/**
 * Hook that manages the WebSocket connection lifecycle and routes
 * incoming messages to the correct handlers.
 */

import { useEffect } from 'react';
import { useAuthStore } from '../store/auth';
import { useChatStore } from '../store/chat';
import { wsClient } from '../lib/wsClient';
import { cryptoManager } from '../lib/cryptoManager';
import type { MessageContent } from '@wasp/types';
import type { MessageEnvelope } from '@wasp/crypto';
import { fromHex } from '@wasp/crypto';

export function useWebSocket() {
  const tokens = useAuthStore((s) => s.tokens);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const { appendMessage, updateMessageStatus, setPresence, setTyping, setBatchPresence, upsertConversation } = useChatStore();

  useEffect(() => {
    if (!tokens?.accessToken) return;

    wsClient.connect(tokens.accessToken);

    // ── Incoming message ────────────────────────────────────────────────────
    const offMessage = wsClient.on('message', async (raw) => {
      const payload = raw.payload as { from: string; messageId: string; envelope: string };
      const { from, messageId, envelope: envelopeStr } = payload;

      try {
        const envelope = JSON.parse(envelopeStr) as MessageEnvelope & {
          senderSigningPublicKey?: string;
        };

        let plaintext: Uint8Array;
        let session = cryptoManager.getSession(from);

        if (envelope.isPreKeyMessage || !session) {
          // Session initialization from a pre-key message
          const senderSigningPubKey = envelope.senderSigningPublicKey
            ? fromHex(envelope.senderSigningPublicKey)
            : new Uint8Array(32);
          const senderDHPubKey = envelope.senderIdentityDHKey
            ? fromHex(envelope.senderIdentityDHKey)
            : new Uint8Array(32);

          const result = cryptoManager.processIncomingPreKeyMessage(
            envelope,
            from,
            senderSigningPubKey,
            senderDHPubKey,
          );
          plaintext = result.plaintext;
          session = result.session;
        } else {
          const senderSigningPubKey = new Uint8Array(32); // Load from contact store
          const result = cryptoManager.decrypt(session, envelope, senderSigningPubKey);
          plaintext = result.plaintext;
        }

        const content = JSON.parse(new TextDecoder().decode(plaintext)) as MessageContent;

        // Deterministic DM conversation ID (same formula used in NewChatModal)
        const conversationId = ['dm', ...[from, currentUserId!].sort()].join('-');

        // Auto-create conversation in store if it doesn't exist yet
        const storeState = useChatStore.getState();
        if (!storeState.conversations.find((c) => c.id === conversationId)) {
          upsertConversation({
            id: conversationId,
            type: 'direct',
            name: from, // best-effort; real display name resolved when contact is loaded
            participantIds: [from, currentUserId!],
            createdAt: Date.now(),
            unreadCount: 1,
            isMuted: false,
            isPinned: false,
            isArchived: false,
          });
        }

        appendMessage(conversationId, {
          id: messageId,
          conversationId,
          senderId: from,
          senderDisplayName: from, // TODO: resolve from contacts
          content,
          status: 'delivered',
          createdAt: content.timestamp ?? Date.now(),
          updatedAt: Date.now(),
          isDeleted: false,
        });

        // Send delivery receipt
        wsClient.sendDeliveryReceipt(from, messageId);
      } catch (err) {
        console.error('[WS] Failed to decrypt message from', from, err);
      }
    });

    // ── Message ACK ─────────────────────────────────────────────────────────
    const offAck = wsClient.on('message_ack', (raw) => {
      const payload = raw.payload as { messageId: string; status: string };
      if (payload.status === 'delivered' || payload.status === 'queued') {
        updateMessageStatus(payload.messageId, 'sent');
      }
    });

    // ── Delivery receipt ─────────────────────────────────────────────────────
    const offDelivery = wsClient.on('delivery_receipt', (raw) => {
      const payload = raw.payload as { messageId: string; deliveredAt: number };
      updateMessageStatus(payload.messageId, 'delivered', payload.deliveredAt);
    });

    // ── Read receipt ─────────────────────────────────────────────────────────
    const offRead = wsClient.on('read_receipt', (raw) => {
      const payload = raw.payload as { messageIds: string[]; readAt: number };
      for (const id of payload.messageIds) {
        updateMessageStatus(id, 'read', payload.readAt);
      }
    });

    // ── Presence ─────────────────────────────────────────────────────────────
    const offPresence = wsClient.on('presence', (raw) => {
      const payload = raw.payload as { userId: string; isOnline: boolean; lastSeen?: number };
      setPresence(payload.userId, payload.isOnline, payload.lastSeen);
    });

    const offPresenceBatch = wsClient.on('presence_batch', (raw) => {
      const payload = raw.payload as { users: Array<{ userId: string; online: boolean; lastSeen?: number }> };
      setBatchPresence(payload.users);
    });

    // ── Typing ───────────────────────────────────────────────────────────────
    const offTyping = wsClient.on('typing', (raw) => {
      const payload = raw.payload as { from: string; conversationId: string; isTyping: boolean };
      setTyping(payload.conversationId, payload.from, payload.isTyping);
    });

    // ── Prekey refill needed ──────────────────────────────────────────────────
    const offRefill = wsClient.on('prekey_refill_needed', async () => {
      try {
        await cryptoManager.uploadInitialKeys();
      } catch (err) {
        console.error('[WS] Failed to refill prekeys:', err);
      }
    });

    return () => {
      offMessage();
      offAck();
      offDelivery();
      offRead();
      offPresence();
      offPresenceBatch();
      offTyping();
      offRefill();
      wsClient.disconnect();
    };
  }, [tokens?.accessToken]); // eslint-disable-line react-hooks/exhaustive-deps
}

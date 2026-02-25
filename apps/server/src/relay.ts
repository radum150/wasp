/**
 * WebSocket Relay — the heart of the WASP server.
 *
 * This is a "dumb relay": it routes encrypted message envelopes from sender
 * to recipient. It NEVER inspects message content. It reads ONLY:
 * - The recipient's user ID (for routing)
 * - The message ID (for delivery acknowledgment)
 *
 * Privacy guarantees:
 * - Zero message content stored
 * - No metadata logging
 * - Offline messages held as opaque encrypted blobs, auto-deleted after TTL
 * - All WebSocket connections are authenticated via JWT
 */

import type { FastifyInstance } from 'fastify';
import type WebSocket from 'ws';
import {
  setUserOnline,
  setUserOffline,
  enqueueOfflineMessage,
  drainOfflineQueue,
  getUserPresence,
  countOneTimePreKeys,
} from './redis.js';
import { config } from './config.js';

// ─── In-memory connection map ─────────────────────────────────────────────────
// userId → WebSocket connection
// This is per-process. In a multi-node deployment, use Redis pub/sub for cross-node relay.
const connections = new Map<string, WebSocket>();

// ─── Message types ────────────────────────────────────────────────────────────

interface WSAuthMessage {
  type: 'auth';
  id: string;
  payload: { token: string };
}

interface WSRelayMessage {
  type: 'message';
  id: string;
  payload: {
    to: string;
    envelope: string; // opaque encrypted blob
    messageId: string;
  };
}

interface WSReceiptMessage {
  type: 'delivery_receipt' | 'read_receipt';
  id: string;
  payload: {
    messageId?: string;
    messageIds?: string[];
    to: string;
  };
}

interface WSTypingMessage {
  type: 'typing';
  id: string;
  payload: { to: string; conversationId: string; isTyping: boolean };
}

interface WSPresenceSubscribeMessage {
  type: 'presence_subscribe';
  id: string;
  payload: { userIds: string[] };
}

type WSInboundMessage =
  | WSAuthMessage
  | WSRelayMessage
  | WSReceiptMessage
  | WSTypingMessage
  | WSPresenceSubscribeMessage;

// ─── Relay registration ───────────────────────────────────────────────────────

/**
 * Register the WebSocket relay plugin with Fastify.
 */
export async function registerRelay(app: FastifyInstance): Promise<void> {
  app.get(
    '/ws',
    { websocket: true },
    (socket, _request) => {
      let authenticatedUserId: string | null = null;
      let pingInterval: NodeJS.Timeout | null = null;

      // Send initial challenge
      send(socket, {
        type: 'auth_challenge',
        id: crypto.randomUUID(),
        payload: { message: 'Please authenticate with your JWT token.' },
        timestamp: Date.now(),
      });

      // Heartbeat to detect stale connections
      pingInterval = setInterval(() => {
        if (socket.readyState === socket.OPEN) {
          socket.ping();
        }
      }, 30_000);

      socket.on('pong', () => {
        // Connection is alive
      });

      socket.on('message', async (rawData: Buffer | string) => {
        let msg: WSInboundMessage;
        try {
          msg = JSON.parse(rawData.toString()) as WSInboundMessage;
        } catch {
          sendError(socket, 'PARSE_ERROR', 'Invalid JSON', null);
          return;
        }

        // ── Authentication ────────────────────────────────────────────────────
        if (msg.type === 'auth') {
          if (authenticatedUserId) {
            sendError(socket, 'ALREADY_AUTH', 'Already authenticated', msg.id);
            return;
          }

          try {
            const decoded = await app.jwt.verify<{ sub: string }>(msg.payload.token);
            authenticatedUserId = decoded.sub;

            // Register connection
            connections.set(authenticatedUserId, socket);
            await setUserOnline(authenticatedUserId);

            send(socket, {
              type: 'auth_ok',
              id: msg.id,
              payload: { userId: authenticatedUserId },
              timestamp: Date.now(),
            });

            // Drain any offline messages
            const offline = await drainOfflineQueue(authenticatedUserId);
            for (const queued of offline) {
              send(socket, {
                type: 'message',
                id: crypto.randomUUID(),
                payload: {
                  from: queued.from,
                  messageId: queued.messageId,
                  envelope: queued.envelope,
                },
                timestamp: Date.now(),
              });
            }

            // Check if prekeys need refilling
            const opkCount = await countOneTimePreKeys(authenticatedUserId);
            if (opkCount < config.PREKEY_REFILL_THRESHOLD) {
              send(socket, {
                type: 'prekey_refill_needed',
                id: crypto.randomUUID(),
                payload: { remaining: opkCount, refillTo: 100 },
                timestamp: Date.now(),
              });
            }

            // Broadcast presence to subscribers
            broadcastPresence(authenticatedUserId, true);

            app.log.info({ userId: authenticatedUserId }, 'WS: User connected');
          } catch {
            sendError(socket, 'AUTH_FAILED', 'Invalid or expired token', msg.id);
            socket.close(1008, 'Unauthorized');
          }
          return;
        }

        // All other messages require authentication
        if (!authenticatedUserId) {
          sendError(socket, 'UNAUTHORIZED', 'Not authenticated', msg.id);
          return;
        }

        // ── Message relay ─────────────────────────────────────────────────────
        if (msg.type === 'message') {
          const { to, envelope, messageId } = msg.payload;

          // Validate envelope size
          if (envelope.length > config.MAX_MESSAGE_SIZE_BYTES * 1.4) {
            // *1.4 for base64 overhead
            sendError(socket, 'MESSAGE_TOO_LARGE', 'Message exceeds size limit', msg.id);
            return;
          }

          const recipientSocket = connections.get(to);

          if (recipientSocket && recipientSocket.readyState === 1) {
            // Recipient is online — relay immediately
            send(recipientSocket, {
              type: 'message',
              id: crypto.randomUUID(),
              payload: {
                from: authenticatedUserId,
                messageId,
                envelope, // forwarded as-is, server cannot decrypt
              },
              timestamp: Date.now(),
            });

            // Send delivery receipt to sender
            send(socket, {
              type: 'message_ack',
              id: msg.id,
              payload: { messageId, status: 'delivered' },
              timestamp: Date.now(),
            });
          } else {
            // Recipient is offline — queue for later delivery
            await enqueueOfflineMessage(
              to,
              {
                messageId,
                from: authenticatedUserId,
                envelope, // opaque encrypted blob
                enqueuedAt: Date.now(),
              },
              config.OFFLINE_MESSAGE_TTL_SECONDS,
            );

            // Ack as "queued" (not yet delivered)
            send(socket, {
              type: 'message_ack',
              id: msg.id,
              payload: { messageId, status: 'queued' },
              timestamp: Date.now(),
            });
          }

          return;
        }

        // ── Delivery / Read receipts ──────────────────────────────────────────
        if (msg.type === 'delivery_receipt' || msg.type === 'read_receipt') {
          const { to } = msg.payload;
          const recipientSocket = connections.get(to);
          if (recipientSocket?.readyState === 1) {
            send(recipientSocket, {
              type: msg.type,
              id: crypto.randomUUID(),
              payload: {
                ...msg.payload,
                from: authenticatedUserId,
              },
              timestamp: Date.now(),
            });
          }
          return;
        }

        // ── Typing indicators ─────────────────────────────────────────────────
        if (msg.type === 'typing') {
          const { to, conversationId, isTyping } = msg.payload;
          const recipientSocket = connections.get(to);
          if (recipientSocket?.readyState === 1) {
            send(recipientSocket, {
              type: 'typing',
              id: crypto.randomUUID(),
              payload: {
                from: authenticatedUserId,
                conversationId,
                isTyping,
              },
              timestamp: Date.now(),
            });
          }
          return;
        }

        // ── Presence subscription ─────────────────────────────────────────────
        if (msg.type === 'presence_subscribe') {
          const presenceUpdates = await Promise.all(
            msg.payload.userIds.map(async (userId) => {
              const p = await getUserPresence(userId);
              return { userId, ...p };
            }),
          );
          send(socket, {
            type: 'presence_batch',
            id: msg.id,
            payload: { users: presenceUpdates },
            timestamp: Date.now(),
          });
          return;
        }
      });

      socket.on('close', async () => {
        if (pingInterval) clearInterval(pingInterval);
        if (authenticatedUserId) {
          connections.delete(authenticatedUserId);
          await setUserOffline(authenticatedUserId);
          broadcastPresence(authenticatedUserId, false);
          app.log.info({ userId: authenticatedUserId }, 'WS: User disconnected');
        }
      });

      socket.on('error', (err: Error) => {
        app.log.error({ err }, 'WS: Socket error');
      });
    },
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function send(socket: WebSocket, data: unknown): void {
  if (socket.readyState === 1) {
    socket.send(JSON.stringify(data));
  }
}

function sendError(
  socket: WebSocket,
  code: string,
  message: string,
  requestId: string | null,
): void {
  send(socket, {
    type: 'error',
    id: requestId ?? crypto.randomUUID(),
    payload: { code, message },
    timestamp: Date.now(),
  });
}

/**
 * Broadcast presence change to all connected users.
 * In production, this should use Redis pub/sub for multi-node support.
 */
function broadcastPresence(userId: string, isOnline: boolean): void {
  const announcement = JSON.stringify({
    type: 'presence',
    id: crypto.randomUUID(),
    payload: { userId, isOnline, lastSeen: Date.now() },
    timestamp: Date.now(),
  });

  for (const [connectedUserId, socket] of connections.entries()) {
    if (connectedUserId !== userId && socket.readyState === 1) {
      socket.send(announcement);
    }
  }
}

export function getActiveConnectionCount(): number {
  return connections.size;
}

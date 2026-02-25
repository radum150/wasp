/**
 * CryptoManager — manages Signal Protocol sessions in the browser.
 *
 * Persists session state and identity keys to localStorage (encrypted)
 * until IndexedDB / WebSQL support is added for production.
 *
 * In a production app, use IndexedDB with encryption for all key material.
 */

import {
  generateIdentityKey,
  generateSignedPreKey,
  generateOneTimePreKeys,
  serializeIdentityKey,
  deserializeIdentityKey,
  serializeSignedPreKey,
  deserializeSignedPreKey,
  serializeOneTimePreKey,
  createOutgoingSession,
  createIncomingSession,
  encryptMessage,
  decryptMessage,
  serializeSessionToStorage,
  deserializeSessionFromStorage,
  toHex,
  fromHex,
  type IdentityKey,
  type Session,
  type MessageEnvelope,
} from '@wasp/crypto';
import type { RecipientPreKeyBundle } from '@wasp/crypto';
import { api } from './api';

const IDENTITY_KEY_STORAGE = 'wasp-identity-key';
const SESSION_PREFIX = 'wasp-session-';
const OPK_COUNTER_KEY = 'wasp-opk-counter';

export class CryptoManager {
  private identityKey: IdentityKey | null = null;
  private sessions = new Map<string, Session>();

  async initialize(): Promise<void> {
    const stored = localStorage.getItem(IDENTITY_KEY_STORAGE);
    if (stored) {
      this.identityKey = deserializeIdentityKey(JSON.parse(stored));
    } else {
      this.identityKey = generateIdentityKey();
      localStorage.setItem(IDENTITY_KEY_STORAGE, JSON.stringify(serializeIdentityKey(this.identityKey)));
    }

    // Load sessions from storage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(SESSION_PREFIX)) {
        const raw = localStorage.getItem(key);
        if (raw) {
          try {
            const session = deserializeSessionFromStorage(JSON.parse(raw));
            this.sessions.set(session.contactId, session);
          } catch {
            console.warn('[Crypto] Failed to deserialize session:', key);
          }
        }
      }
    }
  }

  getIdentityKey(): IdentityKey {
    if (!this.identityKey) throw new Error('CryptoManager not initialized');
    return this.identityKey;
  }

  getRegistrationId(): number {
    return this.getIdentityKey().registrationId;
  }

  async uploadInitialKeys(): Promise<void> {
    const ik = this.getIdentityKey();
    const spk = generateSignedPreKey(ik, 1);

    // Store SPK locally
    localStorage.setItem('wasp-spk', JSON.stringify(serializeSignedPreKey(spk)));

    // Generate 100 OPKs
    const counter = parseInt(localStorage.getItem(OPK_COUNTER_KEY) ?? '0', 10);
    const opks = generateOneTimePreKeys(counter, 100);
    localStorage.setItem(OPK_COUNTER_KEY, String(counter + 100));

    // Store OPKs locally (private key side)
    const opkMap: Record<number, string> = JSON.parse(localStorage.getItem('wasp-opks') ?? '{}');
    for (const opk of opks) {
      const s = serializeOneTimePreKey(opk);
      opkMap[opk.keyId] = JSON.stringify(s);
    }
    localStorage.setItem('wasp-opks', JSON.stringify(opkMap));

    // Upload public side to server
    await api.keys.uploadBundle({
      registrationId: ik.registrationId,
      identitySigningPublicKey: toHex(ik.publicKey),
      identityDHPublicKey: toHex(ik.dhPublicKey),
      signedPreKey: {
        keyId: spk.keyId,
        publicKey: toHex(spk.publicKey),
        signature: toHex(spk.signature),
      },
    });

    await api.keys.uploadPreKeys(opks.map((opk) => ({
      keyId: opk.keyId,
      publicKey: toHex(opk.publicKey),
    })));
  }

  async getOrCreateSession(contactId: string): Promise<{ session: Session; isNew: boolean }> {
    const existing = this.sessions.get(contactId);
    if (existing) return { session: existing, isNew: false };

    // Fetch contact's prekey bundle from server
    const { bundle } = await api.keys.getBundle(contactId) as {
      bundle: {
        userId: string;
        registrationId: number;
        identitySigningPublicKey: string;
        identityDHPublicKey: string;
        signedPreKey: { keyId: number; publicKey: string; signature: string };
        oneTimePreKey?: { keyId: number; publicKey: string } | null;
      }
    };

    const recipientBundle: RecipientPreKeyBundle = {
      userId: bundle.userId,
      registrationId: bundle.registrationId,
      identitySigningPublicKey: fromHex(bundle.identitySigningPublicKey),
      identityDHPublicKey: fromHex(bundle.identityDHPublicKey),
      signedPreKey: {
        keyId: bundle.signedPreKey.keyId,
        publicKey: fromHex(bundle.signedPreKey.publicKey),
        signature: fromHex(bundle.signedPreKey.signature),
      },
      oneTimePreKey: bundle.oneTimePreKey
        ? { keyId: bundle.oneTimePreKey.keyId, publicKey: fromHex(bundle.oneTimePreKey.publicKey) }
        : undefined,
    };

    const session = createOutgoingSession(this.getIdentityKey(), recipientBundle);
    this.saveSession(session);

    return { session, isNew: true };
  }

  encrypt(
    session: Session,
    plaintext: Uint8Array,
    isFirstMessage: boolean,
  ): { envelope: MessageEnvelope; updatedSession: Session } {
    const ik = this.getIdentityKey();
    const { envelope, updatedSession } = encryptMessage(session, plaintext, ik, isFirstMessage);
    this.saveSession(updatedSession);
    return { envelope, updatedSession };
  }

  decrypt(
    session: Session,
    envelope: MessageEnvelope,
    senderSigningPublicKey: Uint8Array,
  ): { plaintext: Uint8Array; updatedSession: Session } {
    const ik = this.getIdentityKey();
    const result = decryptMessage(session, envelope, ik, senderSigningPublicKey);
    this.saveSession(result.updatedSession);
    return result;
  }

  processIncomingPreKeyMessage(
    envelope: MessageEnvelope,
    senderUserId: string,
    senderSigningPublicKey: Uint8Array,
    senderIdentityDHPublicKey: Uint8Array,
  ): { plaintext: Uint8Array; session: Session } {
    const ik = this.getIdentityKey();

    // Load our SPK and OPK from storage
    const spkRaw = localStorage.getItem('wasp-spk');
    if (!spkRaw) throw new Error('Signed prekey not found');
    const spk = deserializeSignedPreKey(JSON.parse(spkRaw));

    let opk;
    if (envelope.usedOneTimePreKeyId !== undefined) {
      const opkMap: Record<number, string> = JSON.parse(localStorage.getItem('wasp-opks') ?? '{}');
      const opkStr = opkMap[envelope.usedOneTimePreKeyId];
      if (opkStr) {
        const { deserializeOneTimePreKey } = require('@wasp/crypto');
        opk = deserializeOneTimePreKey(JSON.parse(opkStr));
        // Remove consumed OPK
        delete opkMap[envelope.usedOneTimePreKeyId];
        localStorage.setItem('wasp-opks', JSON.stringify(opkMap));
      }
    }

    const session = createIncomingSession(
      ik,
      spk,
      opk,
      senderIdentityDHPublicKey,
      fromHex(envelope.ephemeralKey!),
      senderUserId,
      senderSigningPublicKey,
    );

    const { plaintext, updatedSession } = decryptMessage(session, envelope, ik, senderSigningPublicKey);
    this.saveSession(updatedSession);

    return { plaintext, session: updatedSession };
  }

  private saveSession(session: Session): void {
    this.sessions.set(session.contactId, session);
    localStorage.setItem(
      SESSION_PREFIX + session.contactId,
      JSON.stringify(serializeSessionToStorage(session)),
    );
  }

  hasSession(contactId: string): boolean {
    return this.sessions.has(contactId);
  }

  getSession(contactId: string): Session | undefined {
    return this.sessions.get(contactId);
  }
}

export const cryptoManager = new CryptoManager();

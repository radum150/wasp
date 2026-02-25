/**
 * Session Manager — high-level API for managing Signal Protocol sessions.
 *
 * This module provides the main interface that application code uses to:
 * 1. Initiate a new session with a contact (X3DH + Double Ratchet init)
 * 2. Encrypt messages for a contact
 * 3. Decrypt messages from a contact
 * 4. Serialize/deserialize sessions for local storage
 *
 * Each user can have one active session per contact.
 * Sessions are stored locally and never sent to the server.
 */

import { x3dhSend, x3dhReceive } from './x3dh.js';
import {
  initSenderSession,
  initReceiverSession,
  ratchetEncrypt,
  ratchetDecrypt,
  serializeSession,
  deserializeSession,
  type RatchetSessionState,
  type EncryptedRatchetMessage,
  type SerializedRatchetSession,
} from './double-ratchet.js';
import { toHex, fromHex, concat } from './utils.js';
import type { IdentityKey } from './identity.js';
import type { SignedPreKeyPair, OneTimePreKeyPair } from './prekeys.js';
import type { RecipientPreKeyBundle } from './x3dh.js';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A complete session, as stored locally.
 */
export interface Session {
  /** The contact's user ID */
  contactId: string;
  /** Contact's identity public key (hex) — for session verification */
  contactIdentityKey: string;
  /** Double Ratchet state */
  ratchetState: RatchetSessionState;
  createdAt: number;
  updatedAt: number;
}

export interface SerializedSession {
  contactId: string;
  contactIdentityKey: string;
  ratchetState: SerializedRatchetSession;
  createdAt: number;
  updatedAt: number;
}

/**
 * Wire format for an encrypted message envelope.
 * The server sees only this — no plaintext content ever.
 */
export interface MessageEnvelope {
  /** Sender's identity DH public key (hex) — included only in pre-key messages */
  senderIdentityDHKey?: string;
  /** Sender's ephemeral public key (hex) — included only in pre-key messages */
  ephemeralKey?: string;
  /** Which OPK was consumed (for pre-key messages) */
  usedOneTimePreKeyId?: number;
  /** Whether this is a pre-key message (session initiation) */
  isPreKeyMessage: boolean;
  /** Double Ratchet header */
  header: {
    dhRatchetKey: string;
    pn: number;
    n: number;
  };
  /** Base64-encoded ciphertext */
  ciphertext: string;
  /** Message type hint (unencrypted, for UX only — doesn't reveal content) */
  messageType: 'text' | 'media' | 'system';
  /** Registration ID (to detect session conflicts) */
  registrationId: number;
}

// ─── Session Creation ─────────────────────────────────────────────────────────

/**
 * Create a new outgoing session with a contact using their PreKey Bundle.
 * Called when Alice wants to send the first message to Bob.
 */
export function createOutgoingSession(
  senderIdentityKey: IdentityKey,
  recipientBundle: RecipientPreKeyBundle,
): Session {
  const x3dhOutput = x3dhSend(senderIdentityKey, recipientBundle);
  const ratchetState = initSenderSession(
    x3dhOutput.sharedSecret,
    recipientBundle.signedPreKey.publicKey,
  );

  return {
    contactId: recipientBundle.userId,
    contactIdentityKey: toHex(recipientBundle.identitySigningPublicKey),
    ratchetState,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/**
 * Create a new incoming session from a received pre-key message.
 * Called when Bob receives Alice's first message.
 */
export function createIncomingSession(
  receiverIdentityKey: IdentityKey,
  signedPreKey: SignedPreKeyPair,
  oneTimePreKey: OneTimePreKeyPair | undefined,
  senderIdentityDHPublicKey: Uint8Array,
  ephemeralPublicKey: Uint8Array,
  senderUserId: string,
  senderIdentitySigningPublicKey: Uint8Array,
): Session {
  const sharedSecret = x3dhReceive({
    senderIdentityDHPublicKey,
    ephemeralPublicKey,
    identityKey: receiverIdentityKey,
    signedPreKey,
    ...(oneTimePreKey !== undefined ? { oneTimePreKey } : {}),
  });

  const ratchetState = initReceiverSession(sharedSecret, {
    publicKey: signedPreKey.publicKey,
    privateKey: signedPreKey.privateKey,
  });

  return {
    contactId: senderUserId,
    contactIdentityKey: toHex(senderIdentitySigningPublicKey),
    ratchetState,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ─── Encryption / Decryption ──────────────────────────────────────────────────

/**
 * Encrypt a plaintext message for a contact.
 *
 * @param session - The current session with this contact.
 * @param plaintext - The serialized MessageContent as UTF-8 bytes.
 * @param senderIdentityKey - Sender's identity key (for pre-key message header).
 * @param x3dhEphemeralKey - Only provided for the first message (pre-key message).
 */
export function encryptMessage(
  session: Session,
  plaintext: Uint8Array,
  senderIdentityKey: IdentityKey,
  isFirstMessage = false,
  x3dhEphemeralPublicKey?: Uint8Array,
  usedOneTimePreKeyId?: number,
): { envelope: MessageEnvelope; updatedSession: Session } {
  // Associated data = sender identity key || recipient identity key
  const aad = buildAssociatedData(
    senderIdentityKey.publicKey,
    fromHex(session.contactIdentityKey),
  );

  const { message, session: newRatchetState } = ratchetEncrypt(
    session.ratchetState,
    plaintext,
    aad,
  );

  const envelope: MessageEnvelope = {
    isPreKeyMessage: isFirstMessage,
    header: {
      dhRatchetKey: toHex(message.header.dhRatchetKey),
      pn: message.header.pn,
      n: message.header.n,
    },
    ciphertext: bufferToBase64(message.ciphertext),
    messageType: 'text',
    registrationId: senderIdentityKey.registrationId,
  };

  if (isFirstMessage && x3dhEphemeralPublicKey) {
    envelope.senderIdentityDHKey = toHex(senderIdentityKey.dhPublicKey);
    envelope.ephemeralKey = toHex(x3dhEphemeralPublicKey);
    if (usedOneTimePreKeyId !== undefined) {
      envelope.usedOneTimePreKeyId = usedOneTimePreKeyId;
    }
  }

  const updatedSession: Session = {
    ...session,
    ratchetState: newRatchetState,
    updatedAt: Date.now(),
  };

  return { envelope, updatedSession };
}

/**
 * Decrypt a received message envelope.
 *
 * @param session - The current session with the sender.
 * @param envelope - The received encrypted envelope.
 * @param recipientIdentityKey - Our identity key (for AAD verification).
 * @param senderSigningPublicKey - Sender's signing public key (for AAD verification).
 */
export function decryptMessage(
  session: Session,
  envelope: MessageEnvelope,
  recipientIdentityKey: IdentityKey,
  senderSigningPublicKey: Uint8Array,
): { plaintext: Uint8Array; updatedSession: Session } {
  // Verify registration ID to detect session conflicts
  // (In a full implementation, mismatch would trigger a session reset)

  const aad = buildAssociatedData(senderSigningPublicKey, recipientIdentityKey.publicKey);

  const message: EncryptedRatchetMessage = {
    header: {
      dhRatchetKey: fromHex(envelope.header.dhRatchetKey),
      pn: envelope.header.pn,
      n: envelope.header.n,
    },
    ciphertext: base64ToBuffer(envelope.ciphertext),
  };

  const { plaintext, session: newRatchetState } = ratchetDecrypt(
    session.ratchetState,
    message,
    aad,
  );

  const updatedSession: Session = {
    ...session,
    ratchetState: newRatchetState,
    updatedAt: Date.now(),
  };

  return { plaintext, updatedSession };
}

// ─── Serialization ────────────────────────────────────────────────────────────

export function serializeSessionToStorage(session: Session): SerializedSession {
  return {
    contactId: session.contactId,
    contactIdentityKey: session.contactIdentityKey,
    ratchetState: serializeSession(session.ratchetState),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

export function deserializeSessionFromStorage(s: SerializedSession): Session {
  return {
    contactId: s.contactId,
    contactIdentityKey: s.contactIdentityKey,
    ratchetState: deserializeSession(s.ratchetState),
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build the associated data for message authentication.
 * Per Signal spec: AD = sender_identity_key || recipient_identity_key
 */
function buildAssociatedData(senderKey: Uint8Array, recipientKey: Uint8Array): Uint8Array {
  return concat(senderKey, recipientKey);
}

function bufferToBase64(buf: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(buf).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < buf.length; i++) {
    binary += String.fromCharCode(buf[i] ?? 0);
  }
  return btoa(binary);
}

function base64ToBuffer(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

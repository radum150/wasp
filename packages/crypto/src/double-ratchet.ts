/**
 * Double Ratchet Algorithm
 *
 * Provides forward secrecy and break-in recovery for ongoing message exchange.
 *
 * Reference: https://signal.org/docs/specifications/doubleratchet/
 *
 * The Double Ratchet combines:
 * 1. A symmetric-key ratchet (KDF chain) for each direction of communication
 * 2. A Diffie-Hellman ratchet that ratchets forward on each message round-trip
 *
 * Key properties:
 * - Forward secrecy: Compromise of current session keys doesn't expose past messages
 * - Break-in recovery: After some new messages, a compromised session "heals"
 * - Out-of-order message handling: Skipped message keys are cached temporarily
 *
 * Session state:
 *   DHs  — Our current ratchet key pair (DH sending)
 *   DHr  — Their current ratchet public key (DH receiving)
 *   RK   — 32-byte root key
 *   CKs  — Sending chain key
 *   CKr  — Receiving chain key
 *   Ns   — Message number for sending
 *   Nr   — Message number for receiving
 *   PN   — Number of messages in previous sending chain
 *   MKSKIPPED — Map of skipped message keys (for out-of-order delivery)
 */

import {
  generateDHKeyPair,
  dh,
  kdfRootKey,
  kdfChainKey,
  expandMessageKey,
  aesgcmEncrypt,
  aesgcmDecrypt,
} from './primitives.js';
import { toHex, fromHex, concat } from './utils.js';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum number of skipped message keys to store per session (prevents DoS). */
const MAX_SKIP = 1000;

/** Maximum number of out-of-order message keys to cache. */
const MAX_CACHE_SIZE = 2000;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RatchetSessionState {
  /** Our DH sending ratchet key pair */
  DHs: { publicKey: Uint8Array; privateKey: Uint8Array };
  /** Their DH ratchet public key (null before first message received) */
  DHr: Uint8Array | null;
  /** Root key */
  RK: Uint8Array;
  /** Sending chain key (null when no sending chain initialized) */
  CKs: Uint8Array | null;
  /** Receiving chain key (null when no receiving chain initialized) */
  CKr: Uint8Array | null;
  /** Sending message counter */
  Ns: number;
  /** Receiving message counter */
  Nr: number;
  /** Previous sending chain message count */
  PN: number;
  /** Skipped message keys: Map<"ratchetKey:counter", messageKey> */
  MKSkipped: Map<string, Uint8Array>;
}

export interface MessageHeader {
  /** Sender's current DH ratchet public key */
  dhRatchetKey: Uint8Array;
  /** Previous chain message count */
  pn: number;
  /** This message's counter in the current chain */
  n: number;
}

export interface EncryptedRatchetMessage {
  header: MessageHeader;
  /** AES-256-GCM ciphertext with auth tag */
  ciphertext: Uint8Array;
}

export interface SerializedRatchetSession {
  dhsPublicKey: string;
  dhsPrivateKey: string;
  dhr: string | null;
  rk: string;
  cks: string | null;
  ckr: string | null;
  ns: number;
  nr: number;
  pn: number;
  mkSkipped: Array<[string, string]>; // [key, valueHex]
}

// ─── Initialization ───────────────────────────────────────────────────────────

/**
 * Initialize session state for the SENDER (Alice, who initiated X3DH).
 *
 * Alice starts with:
 * - The shared secret SK from X3DH
 * - Bob's signed prekey as the initial DHr
 */
export function initSenderSession(
  sharedSecret: Uint8Array,
  recipientRatchetPublicKey: Uint8Array,
): RatchetSessionState {
  const DHs = generateDHKeyPair();
  const dhOutput = dh(DHs.privateKey, recipientRatchetPublicKey);
  const { newRootKey, chainKey } = kdfRootKey(sharedSecret, dhOutput);

  return {
    DHs,
    DHr: recipientRatchetPublicKey,
    RK: newRootKey,
    CKs: chainKey,
    CKr: null,
    Ns: 0,
    Nr: 0,
    PN: 0,
    MKSkipped: new Map(),
  };
}

/**
 * Initialize session state for the RECEIVER (Bob, who published the PreKey Bundle).
 *
 * Bob starts with:
 * - The shared secret SK from X3DH
 * - His own signed prekey pair as the initial DHs (so he can respond)
 */
export function initReceiverSession(
  sharedSecret: Uint8Array,
  ownSignedPreKeyPair: { publicKey: Uint8Array; privateKey: Uint8Array },
): RatchetSessionState {
  return {
    DHs: ownSignedPreKeyPair,
    DHr: null,
    RK: sharedSecret,
    CKs: null,
    CKr: null,
    Ns: 0,
    Nr: 0,
    PN: 0,
    MKSkipped: new Map(),
  };
}

// ─── Encryption ───────────────────────────────────────────────────────────────

/**
 * Encrypt a plaintext message using the Double Ratchet.
 * Advances the sending chain key.
 */
export function ratchetEncrypt(
  session: RatchetSessionState,
  plaintext: Uint8Array,
  associatedData: Uint8Array,
): { message: EncryptedRatchetMessage; session: RatchetSessionState } {
  if (!session.CKs) {
    throw new Error('Double Ratchet: Sending chain not initialized');
  }

  // Advance the chain key to get a message key
  const { messageKey, nextChainKey } = kdfChainKey(session.CKs);
  const { cipherKey, iv } = expandMessageKey(messageKey);

  const header: MessageHeader = {
    dhRatchetKey: session.DHs.publicKey,
    pn: session.PN,
    n: session.Ns,
  };

  // AAD = header bytes + provided associated data
  const headerBytes = encodeHeader(header);
  const aad = concat(headerBytes, associatedData);

  const ciphertext = aesgcmEncrypt(cipherKey, iv, plaintext, aad);

  const newSession: RatchetSessionState = {
    ...session,
    CKs: nextChainKey,
    Ns: session.Ns + 1,
    MKSkipped: new Map(session.MKSkipped),
  };

  return { message: { header, ciphertext }, session: newSession };
}

// ─── Decryption ───────────────────────────────────────────────────────────────

/**
 * Decrypt a received message using the Double Ratchet.
 * Performs a DH ratchet step if the sender's ratchet key changed.
 * Handles out-of-order messages by caching skipped keys.
 *
 * @throws If decryption fails or MAC verification fails.
 */
export function ratchetDecrypt(
  session: RatchetSessionState,
  message: EncryptedRatchetMessage,
  associatedData: Uint8Array,
): { plaintext: Uint8Array; session: RatchetSessionState } {
  // Try skipped message keys first (for out-of-order messages)
  const skippedKey = trySkippedMessageKey(session, message, associatedData);
  if (skippedKey) {
    return skippedKey;
  }

  let currentSession = session;

  // If the ratchet key changed, perform a DH ratchet step
  const isNewRatchetKey =
    !session.DHr ||
    toHex(message.header.dhRatchetKey) !== toHex(session.DHr);

  if (isNewRatchetKey) {
    // Skip any remaining messages in the current receiving chain
    currentSession = skipMessageKeys(currentSession, message.header.pn);
    // Perform DH ratchet step
    currentSession = dhRatchetStep(currentSession, message.header.dhRatchetKey);
  }

  // Skip any messages we haven't received yet in this chain
  currentSession = skipMessageKeys(currentSession, message.header.n);

  if (!currentSession.CKr) {
    throw new Error('Double Ratchet: Receiving chain not initialized after ratchet step');
  }

  // Advance receiving chain
  const { messageKey, nextChainKey } = kdfChainKey(currentSession.CKr);
  const { cipherKey, iv } = expandMessageKey(messageKey);

  const headerBytes = encodeHeader(message.header);
  const aad = concat(headerBytes, associatedData);

  const plaintext = aesgcmDecrypt(cipherKey, iv, message.ciphertext, aad);

  const newSession: RatchetSessionState = {
    ...currentSession,
    CKr: nextChainKey,
    Nr: currentSession.Nr + 1,
  };

  return { plaintext, session: newSession };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Attempt decryption using a previously skipped message key.
 */
function trySkippedMessageKey(
  session: RatchetSessionState,
  message: EncryptedRatchetMessage,
  associatedData: Uint8Array,
): { plaintext: Uint8Array; session: RatchetSessionState } | null {
  const cacheKey = `${toHex(message.header.dhRatchetKey)}:${message.header.n}`;
  const skippedMK = session.MKSkipped.get(cacheKey);

  if (!skippedMK) return null;

  const { cipherKey, iv } = expandMessageKey(skippedMK);
  const headerBytes = encodeHeader(message.header);
  const aad = concat(headerBytes, associatedData);

  const plaintext = aesgcmDecrypt(cipherKey, iv, message.ciphertext, aad);

  const newSkipped = new Map(session.MKSkipped);
  newSkipped.delete(cacheKey);

  return { plaintext, session: { ...session, MKSkipped: newSkipped } };
}

/**
 * Cache message keys for messages we're skipping over (not yet received).
 */
function skipMessageKeys(
  session: RatchetSessionState,
  until: number,
): RatchetSessionState {
  if (!session.CKr) return session;

  if (session.Nr + MAX_SKIP < until) {
    throw new Error(`Double Ratchet: Too many skipped messages (${until - session.Nr} > ${MAX_SKIP})`);
  }

  const newSkipped = new Map(session.MKSkipped);
  let { CKr, Nr } = session;

  while (Nr < until) {
    if (newSkipped.size >= MAX_CACHE_SIZE) {
      // Evict oldest skipped key to prevent memory exhaustion
      const firstKey = newSkipped.keys().next().value;
      if (firstKey) newSkipped.delete(firstKey);
    }

    const { messageKey, nextChainKey } = kdfChainKey(CKr);
    const cacheKey = `${toHex(session.DHr!)}:${Nr}`;
    newSkipped.set(cacheKey, messageKey);

    CKr = nextChainKey;
    Nr++;
  }

  return { ...session, CKr, Nr, MKSkipped: newSkipped };
}

/**
 * Perform a DH ratchet step using the sender's new ratchet public key.
 * Derives new root key, receiving chain key, then new sending chain key.
 */
function dhRatchetStep(
  session: RatchetSessionState,
  senderRatchetPublicKey: Uint8Array,
): RatchetSessionState {
  const PN = session.Ns;

  // First half: derive receiving chain key
  const dhOut1 = dh(session.DHs.privateKey, senderRatchetPublicKey);
  const { newRootKey: rk1, chainKey: ckr } = kdfRootKey(session.RK, dhOut1);

  // Generate new DH key pair for our next sending turn
  const newDHs = generateDHKeyPair();

  // Second half: derive new sending chain key
  const dhOut2 = dh(newDHs.privateKey, senderRatchetPublicKey);
  const { newRootKey: rk2, chainKey: cks } = kdfRootKey(rk1, dhOut2);

  return {
    ...session,
    DHs: newDHs,
    DHr: senderRatchetPublicKey,
    RK: rk2,
    CKs: cks,
    CKr: ckr,
    Ns: 0,
    Nr: 0,
    PN,
  };
}

// ─── Header serialization ─────────────────────────────────────────────────────

/**
 * Encode a message header to bytes for use as AAD.
 * Format: dhRatchetKey (32 bytes) || pn (4 bytes big-endian) || n (4 bytes big-endian)
 */
function encodeHeader(header: MessageHeader): Uint8Array {
  const buf = new Uint8Array(32 + 4 + 4);
  buf.set(header.dhRatchetKey, 0);
  const view = new DataView(buf.buffer);
  view.setUint32(32, header.pn, false);
  view.setUint32(36, header.n, false);
  return buf;
}

/**
 * Serialize header to a plain object for wire transmission.
 */
export function serializeHeader(header: MessageHeader): {
  dhRatchetKey: string;
  pn: number;
  n: number;
} {
  return {
    dhRatchetKey: toHex(header.dhRatchetKey),
    pn: header.pn,
    n: header.n,
  };
}

/**
 * Deserialize header from wire format.
 */
export function deserializeHeader(h: { dhRatchetKey: string; pn: number; n: number }): MessageHeader {
  return {
    dhRatchetKey: fromHex(h.dhRatchetKey),
    pn: h.pn,
    n: h.n,
  };
}

// ─── Session Serialization ────────────────────────────────────────────────────

/**
 * Serialize the complete Double Ratchet session state for local storage.
 * The private key in DHs must be stored encrypted at rest (handled by db package).
 */
export function serializeSession(state: RatchetSessionState): SerializedRatchetSession {
  const mkSkipped: Array<[string, string]> = [];
  state.MKSkipped.forEach((v, k) => {
    mkSkipped.push([k, toHex(v)]);
  });

  return {
    dhsPublicKey: toHex(state.DHs.publicKey),
    dhsPrivateKey: toHex(state.DHs.privateKey),
    dhr: state.DHr ? toHex(state.DHr) : null,
    rk: toHex(state.RK),
    cks: state.CKs ? toHex(state.CKs) : null,
    ckr: state.CKr ? toHex(state.CKr) : null,
    ns: state.Ns,
    nr: state.Nr,
    pn: state.PN,
    mkSkipped,
  };
}

/**
 * Deserialize session state from storage.
 */
export function deserializeSession(s: SerializedRatchetSession): RatchetSessionState {
  const MKSkipped = new Map<string, Uint8Array>();
  for (const [k, v] of s.mkSkipped) {
    MKSkipped.set(k, fromHex(v));
  }

  return {
    DHs: { publicKey: fromHex(s.dhsPublicKey), privateKey: fromHex(s.dhsPrivateKey) },
    DHr: s.dhr ? fromHex(s.dhr) : null,
    RK: fromHex(s.rk),
    CKs: s.cks ? fromHex(s.cks) : null,
    CKr: s.ckr ? fromHex(s.ckr) : null,
    Ns: s.ns,
    Nr: s.nr,
    PN: s.pn,
    MKSkipped,
  };
}

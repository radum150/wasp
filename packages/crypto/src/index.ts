/**
 * @wasp/crypto — Signal Protocol implementation for WASP
 *
 * Public API exports. Application code should only import from here,
 * never from internal modules directly.
 */

// ─── Primitives (rarely needed directly) ─────────────────────────────────────
export {
  generateDHKeyPair,
  dh,
  generateSigningKeyPair,
  sign,
  verify,
  generateMediaKey,
} from './primitives.js';

// ─── Identity Keys ────────────────────────────────────────────────────────────
export type { IdentityKey, SerializedIdentityKey } from './identity.js';
export {
  generateIdentityKey,
  signWithIdentityKey,
  verifyIdentityKeySignature,
  serializeIdentityKey,
  deserializeIdentityKey,
} from './identity.js';

// ─── PreKeys ──────────────────────────────────────────────────────────────────
export type {
  SignedPreKeyPair,
  SerializedSignedPreKeyPair,
  OneTimePreKeyPair,
  SerializedOneTimePreKeyPair,
} from './prekeys.js';
export {
  generateSignedPreKey,
  serializeSignedPreKey,
  deserializeSignedPreKey,
  generateOneTimePreKeys,
  serializeOneTimePreKey,
  deserializeOneTimePreKey,
  generatePreKeyId,
} from './prekeys.js';

// ─── X3DH ─────────────────────────────────────────────────────────────────────
export type {
  RecipientPreKeyBundle,
  X3DHSenderOutput,
  X3DHReceiverInput,
} from './x3dh.js';
export { x3dhSend, x3dhReceive } from './x3dh.js';

// ─── Double Ratchet ───────────────────────────────────────────────────────────
export type {
  RatchetSessionState,
  MessageHeader,
  EncryptedRatchetMessage,
  SerializedRatchetSession,
} from './double-ratchet.js';
export {
  initSenderSession,
  initReceiverSession,
  ratchetEncrypt,
  ratchetDecrypt,
  serializeSession,
  deserializeSession,
  serializeHeader,
  deserializeHeader,
} from './double-ratchet.js';

// ─── Session Manager (main interface for app code) ────────────────────────────
export type { Session, SerializedSession, MessageEnvelope } from './session.js';
export {
  createOutgoingSession,
  createIncomingSession,
  encryptMessage,
  decryptMessage,
  serializeSessionToStorage,
  deserializeSessionFromStorage,
} from './session.js';

// ─── Media Encryption ─────────────────────────────────────────────────────────
export type { MediaEncryptionResult } from './media.js';
export { encryptMedia, decryptMedia } from './media.js';

// ─── Utilities ────────────────────────────────────────────────────────────────
export {
  concat,
  constantTimeEqual,
  toHex,
  fromHex,
  toBase64,
  fromBase64,
  randomBytes,
  generateRegistrationId,
  zeroize,
} from './utils.js';

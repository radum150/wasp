/**
 * Low-level cryptographic primitives used by the Signal Protocol.
 *
 * We use the @noble suite because it is:
 * - Pure TypeScript (no native bindings required)
 * - Audited and widely used
 * - Works in Node.js, browsers, and React Native
 * - Constant-time implementations
 */

import { x25519 } from '@noble/curves/ed25519';
import { ed25519 } from '@noble/curves/ed25519';
import { gcm } from '@noble/ciphers/aes';
import { hkdf } from '@noble/hashes/hkdf';
import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';

import { randomBytes } from './utils.js';

// ─── X25519 (Diffie-Hellman) ──────────────────────────────────────────────────

/**
 * Generate an X25519 key pair for Diffie-Hellman key exchange.
 */
export function generateDHKeyPair(): { privateKey: Uint8Array; publicKey: Uint8Array } {
  const privateKey = x25519.utils.randomPrivateKey();
  const publicKey = x25519.getPublicKey(privateKey);
  return { privateKey, publicKey };
}

/**
 * Perform Diffie-Hellman shared secret computation.
 * Returns 32-byte shared secret.
 */
export function dh(privateKey: Uint8Array, publicKey: Uint8Array): Uint8Array {
  return x25519.getSharedSecret(privateKey, publicKey);
}

// ─── Ed25519 (Signatures) ─────────────────────────────────────────────────────

/**
 * Generate an Ed25519 signing key pair (used for identity keys and signed prekeys).
 */
export function generateSigningKeyPair(): { privateKey: Uint8Array; publicKey: Uint8Array } {
  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = ed25519.getPublicKey(privateKey);
  return { privateKey, publicKey };
}

/**
 * Sign a message with an Ed25519 private key.
 * Returns 64-byte signature.
 */
export function sign(privateKey: Uint8Array, message: Uint8Array): Uint8Array {
  return ed25519.sign(message, privateKey);
}

/**
 * Verify an Ed25519 signature.
 */
export function verify(publicKey: Uint8Array, message: Uint8Array, signature: Uint8Array): boolean {
  try {
    return ed25519.verify(signature, message, publicKey);
  } catch {
    return false;
  }
}

// ─── HKDF ────────────────────────────────────────────────────────────────────

const HKDF_INFO_ROOT = new TextEncoder().encode('WASP_ROOT_KEY');
const HKDF_INFO_MESSAGE = new TextEncoder().encode('WASP_MESSAGE_KEY');
const HKDF_INFO_X3DH = new TextEncoder().encode('WASP_X3DH_MASTER_SECRET_v1');

/**
 * Derive root key and chain key from DH output and existing root key.
 * Used in the Double Ratchet DH step.
 *
 * KDF_RK(rk, dh_out):
 *   Returns a pair (32-byte root key, 32-byte chain key) as the output
 *   of applying HKDF with SHA-256, with rk as the HKDF salt, dh_out as
 *   the HKDF input key material, and WASP_ROOT_KEY as the HKDF info.
 */
export function kdfRootKey(
  rootKey: Uint8Array,
  dhOutput: Uint8Array,
): { newRootKey: Uint8Array; chainKey: Uint8Array } {
  const output = hkdf(sha256, dhOutput, rootKey, HKDF_INFO_ROOT, 64);
  return {
    newRootKey: output.slice(0, 32),
    chainKey: output.slice(32, 64),
  };
}

/**
 * Advance a chain key to produce a message key.
 * Uses HMAC-SHA256 with constant inputs per Signal spec:
 *   - message key = HMAC-SHA256(CK, 0x01)
 *   - next chain key = HMAC-SHA256(CK, 0x02)
 */
export function kdfChainKey(chainKey: Uint8Array): {
  messageKey: Uint8Array;
  nextChainKey: Uint8Array;
} {
  const messageKey = hmac(sha256, chainKey, new Uint8Array([0x01]));
  const nextChainKey = hmac(sha256, chainKey, new Uint8Array([0x02]));
  return { messageKey, nextChainKey };
}

/**
 * Derive the master secret from X3DH inputs.
 *
 * Per Signal spec:
 *   SK = KDF(F || DH1 || DH2 || DH3 || DH4)
 *   where F is a 32-byte string of 0xFF (to prevent cross-protocol attacks).
 */
export function kdfX3DH(dhOutputs: Uint8Array[]): Uint8Array {
  const F = new Uint8Array(32).fill(0xff);
  const ikm = new Uint8Array(
    F.length + dhOutputs.reduce((sum, dho) => sum + dho.length, 0),
  );
  ikm.set(F, 0);
  let offset = F.length;
  for (const dho of dhOutputs) {
    ikm.set(dho, offset);
    offset += dho.length;
  }
  // Use 32-byte zero salt (Signal spec: "if no salt is provided, HKDF uses a zero-filled salt")
  const salt = new Uint8Array(32);
  return hkdf(sha256, ikm, salt, HKDF_INFO_X3DH, 32);
}

// ─── AES-256-GCM (Message Encryption) ─────────────────────────────────────────

export const AES_KEY_SIZE = 32; // 256-bit
export const IV_SIZE = 12; // 96-bit nonce for GCM
export const AUTH_TAG_SIZE = 16; // 128-bit tag

/**
 * Derive AES-256-GCM key, IV, and HMAC key from a 32-byte message key.
 *
 * Per Signal spec:
 *   - cipher key = first 32 bytes
 *   - mac key = next 32 bytes
 *   - iv = next 16 bytes (we use 12 for GCM nonce)
 */
export function expandMessageKey(messageKey: Uint8Array): {
  cipherKey: Uint8Array;
  macKey: Uint8Array;
  iv: Uint8Array;
} {
  const output = hkdf(sha256, messageKey, new Uint8Array(0), HKDF_INFO_MESSAGE, 80);
  return {
    cipherKey: output.slice(0, 32),
    macKey: output.slice(32, 64),
    iv: output.slice(64, 76), // 12 bytes for GCM
  };
}

/**
 * Encrypt plaintext with AES-256-GCM.
 * Returns ciphertext + 16-byte auth tag (appended).
 */
export function aesgcmEncrypt(
  key: Uint8Array,
  iv: Uint8Array,
  plaintext: Uint8Array,
  aad?: Uint8Array,
): Uint8Array {
  const cipher = gcm(key, iv, aad);
  return cipher.encrypt(plaintext);
}

/**
 * Decrypt AES-256-GCM ciphertext (with appended auth tag).
 * Throws if authentication fails.
 */
export function aesgcmDecrypt(
  key: Uint8Array,
  iv: Uint8Array,
  ciphertext: Uint8Array,
  aad?: Uint8Array,
): Uint8Array {
  const cipher = gcm(key, iv, aad);
  return cipher.decrypt(ciphertext);
}

/**
 * Compute HMAC-SHA256.
 */
export function hmacSha256(key: Uint8Array, data: Uint8Array): Uint8Array {
  return hmac(sha256, key, data);
}

/**
 * SHA-256 hash.
 */
export function sha256Hash(data: Uint8Array): Uint8Array {
  return sha256(data);
}

/**
 * Generate a random AES-256 media encryption key.
 * Used for encrypting media attachments independently of message keys.
 */
export function generateMediaKey(): Uint8Array {
  return randomBytes(64); // 32 bytes cipher key + 32 bytes mac key
}

export { x25519, ed25519 };

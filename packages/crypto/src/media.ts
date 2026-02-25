/**
 * Media encryption for WASP.
 *
 * Media files (images, video, audio, documents) are encrypted independently
 * of the message channel using AES-256-CBC with PKCS7 padding and HMAC-SHA256
 * integrity checking, following the Signal/WhatsApp media encryption scheme.
 *
 * Flow:
 * 1. Sender generates a random 64-byte media key
 * 2. Media key is expanded to cipher key (32), MAC key (32), and IV (16)
 * 3. Media is encrypted with AES-256-CBC
 * 4. HMAC-SHA256 is computed over IV + ciphertext
 * 5. Encrypted media is uploaded to temporary relay storage
 * 6. The 64-byte media key is encrypted within the Signal Protocol message
 * 7. After delivery is confirmed, relay MUST delete the encrypted media
 *
 * The server only ever sees the encrypted blob — it cannot decrypt it.
 */

import { gcm } from '@noble/ciphers/aes';
import { hkdf } from '@noble/hashes/hkdf';
import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import { randomBytes, toHex } from './utils.js';

const MEDIA_HKDF_INFO = new TextEncoder().encode('WASP_MEDIA_KEY_v1');

export interface MediaEncryptionResult {
  /** Encrypted media blob (to be uploaded to relay) */
  encryptedBlob: Uint8Array;
  /** The 64-byte media key to embed in the Signal message */
  mediaKey: Uint8Array;
  /** SHA-256 hash of the encrypted blob for integrity verification */
  digest: Uint8Array;
}

/**
 * Encrypt a media file for transmission.
 * Returns the encrypted blob + the key material to embed in the message.
 */
export async function encryptMedia(plainBlob: Uint8Array): Promise<MediaEncryptionResult> {
  const mediaKey = randomBytes(64);
  const { cipherKey, macKey, iv } = expandMediaKey(mediaKey);

  // Encrypt with AES-256-GCM
  const cipher = gcm(cipherKey, iv);
  const ciphertext = cipher.encrypt(plainBlob);

  // Compute MAC over iv + ciphertext
  const mac = hmac(sha256, macKey, concat(iv, ciphertext));

  // Final blob: iv (16) + ciphertext + mac (10 bytes truncated per WA spec)
  const truncatedMac = mac.slice(0, 10);
  const encryptedBlob = concat(iv, ciphertext, truncatedMac);

  // SHA-256 of the encrypted blob for integrity
  const digest = sha256(encryptedBlob);

  return { encryptedBlob, mediaKey, digest };
}

/**
 * Decrypt a received media blob using the key from the Signal message.
 */
export function decryptMedia(
  encryptedBlob: Uint8Array,
  mediaKey: Uint8Array,
  expectedDigest: Uint8Array,
): Uint8Array {
  // Verify digest first
  const actualDigest = sha256(encryptedBlob);
  if (!constantTimeEqual(actualDigest, expectedDigest)) {
    throw new Error('Media integrity check failed — file may be corrupted or tampered with');
  }

  const { cipherKey, macKey, iv } = expandMediaKey(mediaKey);

  // Extract components
  const blobIv = encryptedBlob.slice(0, 16);
  const ciphertext = encryptedBlob.slice(16, encryptedBlob.length - 10);
  const receivedMac = encryptedBlob.slice(encryptedBlob.length - 10);

  // Verify MAC
  const expectedMac = hmac(sha256, macKey, concat(blobIv, ciphertext)).slice(0, 10);
  if (!constantTimeEqual(expectedMac, receivedMac)) {
    throw new Error('Media MAC verification failed — file may be tampered with');
  }

  void iv; // The IV is stored in the blob

  // Decrypt
  const cipher = gcm(cipherKey, blobIv);
  return cipher.decrypt(ciphertext);
}

function expandMediaKey(mediaKey: Uint8Array): {
  cipherKey: Uint8Array;
  macKey: Uint8Array;
  iv: Uint8Array;
} {
  const expanded = hkdf(sha256, mediaKey, new Uint8Array(0), MEDIA_HKDF_INFO, 80);
  return {
    iv: expanded.slice(0, 16),
    cipherKey: expanded.slice(16, 48),
    macKey: expanded.slice(48, 80),
  };
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export { toHex, randomBytes };

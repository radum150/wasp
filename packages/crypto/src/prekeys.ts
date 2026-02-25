/**
 * PreKey management for the Signal Protocol.
 *
 * Two types of prekeys:
 * 1. Signed PreKey (SPK): Medium-term key, rotated periodically (weekly).
 *    Signed with the identity key so recipients can verify authenticity.
 *
 * 2. One-Time PreKey (OPK): Single-use keys for perfect forward secrecy.
 *    A batch is uploaded to the server; each is consumed once during session init.
 *    When the server runs low, it requests a refill.
 */

import { generateDHKeyPair, sign } from './primitives.js';
import { toHex, fromHex, randomBytes } from './utils.js';
import type { IdentityKey } from './identity.js';

// ─── Signed PreKey ────────────────────────────────────────────────────────────

export interface SignedPreKeyPair {
  keyId: number;
  publicKey: Uint8Array;
  privateKey: Uint8Array;
  /** Ed25519 signature of publicKey with the identity key */
  signature: Uint8Array;
  createdAt: number;
}

export interface SerializedSignedPreKeyPair {
  keyId: number;
  publicKey: string;
  privateKey: string;
  signature: string;
  createdAt: number;
}

/**
 * Generate a new signed prekey and sign it with the identity key.
 */
export function generateSignedPreKey(
  identityKey: IdentityKey,
  keyId: number,
): SignedPreKeyPair {
  const { publicKey, privateKey } = generateDHKeyPair();
  const signature = sign(identityKey.privateKey, publicKey);

  return {
    keyId,
    publicKey,
    privateKey,
    signature,
    createdAt: Date.now(),
  };
}

export function serializeSignedPreKey(spk: SignedPreKeyPair): SerializedSignedPreKeyPair {
  return {
    keyId: spk.keyId,
    publicKey: toHex(spk.publicKey),
    privateKey: toHex(spk.privateKey),
    signature: toHex(spk.signature),
    createdAt: spk.createdAt,
  };
}

export function deserializeSignedPreKey(s: SerializedSignedPreKeyPair): SignedPreKeyPair {
  return {
    keyId: s.keyId,
    publicKey: fromHex(s.publicKey),
    privateKey: fromHex(s.privateKey),
    signature: fromHex(s.signature),
    createdAt: s.createdAt,
  };
}

// ─── One-Time PreKeys ─────────────────────────────────────────────────────────

export interface OneTimePreKeyPair {
  keyId: number;
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export interface SerializedOneTimePreKeyPair {
  keyId: number;
  publicKey: string;
  privateKey: string;
}

/**
 * Generate a batch of one-time prekeys.
 * Typically 100 are generated at registration, refilled in batches of 50.
 */
export function generateOneTimePreKeys(
  startId: number,
  count: number,
): OneTimePreKeyPair[] {
  const keys: OneTimePreKeyPair[] = [];
  for (let i = 0; i < count; i++) {
    const { publicKey, privateKey } = generateDHKeyPair();
    keys.push({ keyId: startId + i, publicKey, privateKey });
  }
  return keys;
}

export function serializeOneTimePreKey(opk: OneTimePreKeyPair): SerializedOneTimePreKeyPair {
  return {
    keyId: opk.keyId,
    publicKey: toHex(opk.publicKey),
    privateKey: toHex(opk.privateKey),
  };
}

export function deserializeOneTimePreKey(s: SerializedOneTimePreKeyPair): OneTimePreKeyPair {
  return {
    keyId: s.keyId,
    publicKey: fromHex(s.publicKey),
    privateKey: fromHex(s.privateKey),
  };
}

/**
 * Generate a random key ID for a new OPK batch, to avoid predictable IDs.
 */
export function generatePreKeyId(): number {
  const bytes = randomBytes(3);
  return ((bytes[0] ?? 0) << 16) | ((bytes[1] ?? 0) << 8) | (bytes[2] ?? 0);
}

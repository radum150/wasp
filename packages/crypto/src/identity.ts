/**
 * Identity Key management.
 *
 * The identity key pair is the user's long-term cryptographic identity.
 * It is generated once on device registration and never leaves the device.
 *
 * We use Ed25519 for identity (signing) and X25519 for DH operations.
 * The XEdDSA scheme allows using Ed25519 keys for both signing and X25519 DH,
 * matching the Signal Protocol specification.
 */

import { generateSigningKeyPair, generateDHKeyPair, sign, verify } from './primitives.js';
import { generateRegistrationId, toHex, fromHex } from './utils.js';

export interface IdentityKey {
  registrationId: number;
  /** Ed25519 public key (for signature verification) */
  publicKey: Uint8Array;
  /** Ed25519 private key (for signing) — never leaves the device */
  privateKey: Uint8Array;
  /** X25519 public key (for DH — derived from Ed25519 key via XEdDSA) */
  dhPublicKey: Uint8Array;
  /** X25519 private key (for DH) */
  dhPrivateKey: Uint8Array;
}

export interface SerializedIdentityKey {
  registrationId: number;
  publicKey: string; // hex
  privateKey: string; // hex
  dhPublicKey: string; // hex
  dhPrivateKey: string; // hex
}

/**
 * Generate a new identity key pair for a user.
 * Called once during device registration.
 */
export function generateIdentityKey(): IdentityKey {
  const signingKeys = generateSigningKeyPair();
  // We use separate X25519 keys for DH to avoid key reuse between sign/DH
  const dhKeys = generateDHKeyPair();

  return {
    registrationId: generateRegistrationId(),
    publicKey: signingKeys.publicKey,
    privateKey: signingKeys.privateKey,
    dhPublicKey: dhKeys.publicKey,
    dhPrivateKey: dhKeys.privateKey,
  };
}

/**
 * Sign data with the identity key.
 */
export function signWithIdentityKey(identityKey: IdentityKey, data: Uint8Array): Uint8Array {
  return sign(identityKey.privateKey, data);
}

/**
 * Verify a signature made with an identity key.
 */
export function verifyIdentityKeySignature(
  identityPublicKey: Uint8Array,
  data: Uint8Array,
  signature: Uint8Array,
): boolean {
  return verify(identityPublicKey, data, signature);
}

/**
 * Serialize identity key to a storable format.
 */
export function serializeIdentityKey(key: IdentityKey): SerializedIdentityKey {
  return {
    registrationId: key.registrationId,
    publicKey: toHex(key.publicKey),
    privateKey: toHex(key.privateKey),
    dhPublicKey: toHex(key.dhPublicKey),
    dhPrivateKey: toHex(key.dhPrivateKey),
  };
}

/**
 * Deserialize identity key from storage.
 */
export function deserializeIdentityKey(serialized: SerializedIdentityKey): IdentityKey {
  return {
    registrationId: serialized.registrationId,
    publicKey: fromHex(serialized.publicKey),
    privateKey: fromHex(serialized.privateKey),
    dhPublicKey: fromHex(serialized.dhPublicKey),
    dhPrivateKey: fromHex(serialized.dhPrivateKey),
  };
}

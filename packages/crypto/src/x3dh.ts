/**
 * X3DH — Extended Triple Diffie-Hellman Key Agreement.
 *
 * Used to establish a shared secret between two parties who have never communicated,
 * using only the recipient's published public keys (PreKey Bundle).
 *
 * Reference: https://signal.org/docs/specifications/x3dh/
 *
 * Protocol overview (Alice → Bob):
 *
 * Alice has:
 *   IK_A  = Alice's identity key pair
 *   EK_A  = Ephemeral key pair (generated fresh for each session init)
 *
 * Bob has published:
 *   IK_B  = Bob's identity key (public, long-term)
 *   SPK_B = Bob's signed prekey (public, medium-term)
 *   OPK_B = Bob's one-time prekey (public, optional, consumed on use)
 *
 * Master secret derivation:
 *   DH1 = DH(IK_A,  SPK_B)   — compromise of IK_A leaks session, but forward secrecy guaranteed by EK
 *   DH2 = DH(EK_A,  IK_B)    — ties session to Bob's identity
 *   DH3 = DH(EK_A,  SPK_B)   — ties session to Bob's signed prekey
 *   DH4 = DH(EK_A,  OPK_B)   — (optional) one-time forward secrecy
 *
 *   SK = KDF(F || DH1 || DH2 || DH3 [|| DH4])
 *
 * Where F = 0xFF × 32 (Signal anti cross-protocol attack prefix)
 */

import { dh, kdfX3DH, generateDHKeyPair, verify } from './primitives.js';
import { concat } from './utils.js';
import type { IdentityKey } from './identity.js';
import type { SignedPreKeyPair, OneTimePreKeyPair } from './prekeys.js';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Bob's published PreKey Bundle (fetched from server by Alice).
 */
export interface RecipientPreKeyBundle {
  /** Bob's user ID */
  userId: string;
  registrationId: number;
  /** Bob's identity DH public key */
  identityDHPublicKey: Uint8Array;
  /** Bob's identity signing public key (for OPK verification if needed) */
  identitySigningPublicKey: Uint8Array;
  signedPreKey: {
    keyId: number;
    publicKey: Uint8Array;
    signature: Uint8Array;
  };
  oneTimePreKey?: {
    keyId: number;
    publicKey: Uint8Array;
  };
}

/**
 * Output of the sender-side X3DH.
 * Contains everything Bob needs to reproduce the shared secret.
 */
export interface X3DHSenderOutput {
  /** The established shared secret (32 bytes) */
  sharedSecret: Uint8Array;
  /** Alice's ephemeral public key — sent to Bob in the initial message header */
  ephemeralPublicKey: Uint8Array;
  /** Which OPK was used (so Bob can mark it consumed) */
  usedOneTimePreKeyId?: number;
}

/**
 * Inputs for the receiver-side X3DH (Bob reconstructing the shared secret).
 */
export interface X3DHReceiverInput {
  /** Alice's identity DH public key (from message header) */
  senderIdentityDHPublicKey: Uint8Array;
  /** Alice's ephemeral public key (from message header) */
  ephemeralPublicKey: Uint8Array;
  /** Bob's own identity key */
  identityKey: IdentityKey;
  /** Bob's signed prekey that was used */
  signedPreKey: SignedPreKeyPair;
  /** Bob's one-time prekey that was used, if any */
  oneTimePreKey?: OneTimePreKeyPair;
}

// ─── Sender (Alice) ───────────────────────────────────────────────────────────

/**
 * Perform the sender-side X3DH to establish a shared secret with a recipient.
 *
 * @throws If the recipient's signed prekey signature is invalid.
 */
export function x3dhSend(
  senderIdentityKey: IdentityKey,
  recipientBundle: RecipientPreKeyBundle,
): X3DHSenderOutput {
  // Verify Bob's signed prekey signature before proceeding
  const sigValid = verify(
    recipientBundle.identitySigningPublicKey,
    recipientBundle.signedPreKey.publicKey,
    recipientBundle.signedPreKey.signature,
  );
  if (!sigValid) {
    throw new Error('X3DH: Invalid signed prekey signature — possible key tampering!');
  }

  // Generate fresh ephemeral key pair for this session
  const ephemeralKeyPair = generateDHKeyPair();

  // Compute the four DH outputs
  const dh1 = dh(senderIdentityKey.dhPrivateKey, recipientBundle.signedPreKey.publicKey);
  const dh2 = dh(ephemeralKeyPair.privateKey, recipientBundle.identityDHPublicKey);
  const dh3 = dh(ephemeralKeyPair.privateKey, recipientBundle.signedPreKey.publicKey);

  const dhOutputs = [dh1, dh2, dh3];
  let usedOneTimePreKeyId: number | undefined;

  if (recipientBundle.oneTimePreKey) {
    const dh4 = dh(ephemeralKeyPair.privateKey, recipientBundle.oneTimePreKey.publicKey);
    dhOutputs.push(dh4);
    usedOneTimePreKeyId = recipientBundle.oneTimePreKey.keyId;
  }

  const sharedSecret = kdfX3DH(dhOutputs);

  return {
    sharedSecret,
    ephemeralPublicKey: ephemeralKeyPair.publicKey,
    ...(usedOneTimePreKeyId !== undefined ? { usedOneTimePreKeyId } : {}),
  };
}

// ─── Receiver (Bob) ───────────────────────────────────────────────────────────

/**
 * Perform the receiver-side X3DH to reproduce the shared secret from Alice's initial message.
 *
 * Bob can reproduce the exact same shared secret without prior interaction.
 */
export function x3dhReceive(input: X3DHReceiverInput): Uint8Array {
  // Alice computed: DH(IK_A, SPK_B) || DH(EK_A, IK_B) || DH(EK_A, SPK_B)
  // Bob computes:   DH(SPK_B, IK_A) || DH(IK_B, EK_A) || DH(SPK_B, EK_A)
  // Since DH(a,B) = DH(b,A) these are identical.

  const dhOutputsRecv = [
    dh(input.identityKey.dhPrivateKey, input.ephemeralPublicKey), // = DH2 from Alice
    dh(input.signedPreKey.privateKey, input.senderIdentityDHPublicKey), // = DH1 from Alice
    dh(input.signedPreKey.privateKey, input.ephemeralPublicKey), // = DH3 from Alice
  ];

  // Reorder to match Alice's sequence: DH1, DH2, DH3 [, DH4]
  const dhOutputs = [
    dh(input.signedPreKey.privateKey, input.senderIdentityDHPublicKey), // DH1
    dh(input.identityKey.dhPrivateKey, input.ephemeralPublicKey), // DH2
    dh(input.signedPreKey.privateKey, input.ephemeralPublicKey), // DH3
  ];
  void dhOutputsRecv; // suppress lint — kept above for reference

  if (input.oneTimePreKey) {
    const dh4 = dh(input.oneTimePreKey.privateKey, input.ephemeralPublicKey);
    dhOutputs.push(dh4);
  }

  return kdfX3DH(dhOutputs);
}

// Keep the concat import for potential future use in associated data
export { concat };

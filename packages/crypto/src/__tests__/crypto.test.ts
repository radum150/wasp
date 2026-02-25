/**
 * Comprehensive tests for the WASP Signal Protocol implementation.
 *
 * Tests cover:
 * - Key generation (identity, signed prekeys, one-time prekeys)
 * - X3DH key agreement (both directions must produce same secret)
 * - Double Ratchet encrypt/decrypt
 * - Out-of-order message handling
 * - Session serialization round-trip
 * - Media encryption
 * - Edge cases and error conditions
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  // Identity
  generateIdentityKey,
  serializeIdentityKey,
  deserializeIdentityKey,
  // PreKeys
  generateSignedPreKey,
  generateOneTimePreKeys,
  serializeSignedPreKey,
  deserializeSignedPreKey,
  serializeOneTimePreKey,
  deserializeOneTimePreKey,
  // X3DH
  x3dhSend,
  x3dhReceive,
  type RecipientPreKeyBundle,
  // Double Ratchet
  initSenderSession,
  initReceiverSession,
  ratchetEncrypt,
  ratchetDecrypt,
  serializeSession,
  deserializeSession,
  // Session manager
  createOutgoingSession,
  createIncomingSession,
  encryptMessage,
  decryptMessage,
  serializeSessionToStorage,
  deserializeSessionFromStorage,
  // Media
  encryptMedia,
  decryptMedia,
  // Utils
  constantTimeEqual,
  toHex,
  fromHex,
  randomBytes,
} from '../index.js';

// ─── Test Fixtures ────────────────────────────────────────────────────────────

function createTestUsers() {
  const alice = {
    id: 'alice',
    identityKey: generateIdentityKey(),
  };
  const bob = {
    id: 'bob',
    identityKey: generateIdentityKey(),
  };

  const bobSignedPreKey = generateSignedPreKey(bob.identityKey, 1);
  const bobOneTimePreKeys = generateOneTimePreKeys(100, 10);

  const bobBundle: RecipientPreKeyBundle = {
    userId: bob.id,
    registrationId: bob.identityKey.registrationId,
    identityDHPublicKey: bob.identityKey.dhPublicKey,
    identitySigningPublicKey: bob.identityKey.publicKey,
    signedPreKey: {
      keyId: bobSignedPreKey.keyId,
      publicKey: bobSignedPreKey.publicKey,
      signature: bobSignedPreKey.signature,
    },
    oneTimePreKey: {
      keyId: bobOneTimePreKeys[0]!.keyId,
      publicKey: bobOneTimePreKeys[0]!.publicKey,
    },
  };

  return { alice, bob, bobSignedPreKey, bobOneTimePreKeys, bobBundle };
}

// ─── Identity Key Tests ───────────────────────────────────────────────────────

describe('Identity Keys', () => {
  it('generates unique key pairs', () => {
    const key1 = generateIdentityKey();
    const key2 = generateIdentityKey();
    expect(toHex(key1.publicKey)).not.toBe(toHex(key2.publicKey));
    expect(toHex(key1.privateKey)).not.toBe(toHex(key2.privateKey));
  });

  it('has 32-byte keys', () => {
    const key = generateIdentityKey();
    expect(key.publicKey).toHaveLength(32);
    expect(key.privateKey).toHaveLength(32);
    expect(key.dhPublicKey).toHaveLength(32);
    expect(key.dhPrivateKey).toHaveLength(32);
  });

  it('generates valid registration IDs (1..16380)', () => {
    for (let i = 0; i < 100; i++) {
      const key = generateIdentityKey();
      expect(key.registrationId).toBeGreaterThanOrEqual(1);
      expect(key.registrationId).toBeLessThanOrEqual(16380);
    }
  });

  it('round-trips through serialization', () => {
    const original = generateIdentityKey();
    const serialized = serializeIdentityKey(original);
    const deserialized = deserializeIdentityKey(serialized);

    expect(constantTimeEqual(original.publicKey, deserialized.publicKey)).toBe(true);
    expect(constantTimeEqual(original.privateKey, deserialized.privateKey)).toBe(true);
    expect(constantTimeEqual(original.dhPublicKey, deserialized.dhPublicKey)).toBe(true);
    expect(original.registrationId).toBe(deserialized.registrationId);
  });
});

// ─── PreKey Tests ─────────────────────────────────────────────────────────────

describe('PreKeys', () => {
  it('generates signed prekey with valid signature', () => {
    const identityKey = generateIdentityKey();
    const spk = generateSignedPreKey(identityKey, 1);

    expect(spk.keyId).toBe(1);
    expect(spk.publicKey).toHaveLength(32);
    expect(spk.privateKey).toHaveLength(32);
    expect(spk.signature).toHaveLength(64);
    expect(spk.createdAt).toBeGreaterThan(0);
  });

  it('signed prekey signature is verifiable', async () => {
    const { verify } = await import('../primitives.js');
    const identityKey = generateIdentityKey();
    const spk = generateSignedPreKey(identityKey, 1);
    const valid = verify(identityKey.publicKey, spk.publicKey, spk.signature);
    expect(valid).toBe(true);
  });

  it('signed prekey signature fails with wrong key', async () => {
    const { verify } = await import('../primitives.js');
    const identityKey1 = generateIdentityKey();
    const identityKey2 = generateIdentityKey();
    const spk = generateSignedPreKey(identityKey1, 1);
    const valid = verify(identityKey2.publicKey, spk.publicKey, spk.signature);
    expect(valid).toBe(false);
  });

  it('generates batch of one-time prekeys', () => {
    const otpks = generateOneTimePreKeys(0, 100);
    expect(otpks).toHaveLength(100);
    // All key IDs should be unique
    const ids = new Set(otpks.map((k) => k.keyId));
    expect(ids.size).toBe(100);
    // Starting from 0
    expect(otpks[0]!.keyId).toBe(0);
    expect(otpks[99]!.keyId).toBe(99);
  });

  it('round-trips signed prekey through serialization', () => {
    const identityKey = generateIdentityKey();
    const spk = generateSignedPreKey(identityKey, 42);
    const serialized = serializeSignedPreKey(spk);
    const deserialized = deserializeSignedPreKey(serialized);

    expect(constantTimeEqual(spk.publicKey, deserialized.publicKey)).toBe(true);
    expect(constantTimeEqual(spk.privateKey, deserialized.privateKey)).toBe(true);
    expect(constantTimeEqual(spk.signature, deserialized.signature)).toBe(true);
    expect(deserialized.keyId).toBe(42);
  });

  it('round-trips one-time prekey through serialization', () => {
    const [otpk] = generateOneTimePreKeys(7, 1);
    const serialized = serializeOneTimePreKey(otpk!);
    const deserialized = deserializeOneTimePreKey(serialized);

    expect(constantTimeEqual(otpk!.publicKey, deserialized.publicKey)).toBe(true);
    expect(constantTimeEqual(otpk!.privateKey, deserialized.privateKey)).toBe(true);
    expect(deserialized.keyId).toBe(7);
  });
});

// ─── X3DH Tests ───────────────────────────────────────────────────────────────

describe('X3DH Key Agreement', () => {
  it('produces identical shared secrets on both sides (with OPK)', () => {
    const { alice, bob, bobSignedPreKey, bobOneTimePreKeys, bobBundle } = createTestUsers();

    // Alice → X3DH send
    const aliceOutput = x3dhSend(alice.identityKey, bobBundle);

    // Bob → X3DH receive
    const bobSecret = x3dhReceive({
      senderIdentityDHPublicKey: alice.identityKey.dhPublicKey,
      ephemeralPublicKey: aliceOutput.ephemeralPublicKey,
      identityKey: bob.identityKey,
      signedPreKey: bobSignedPreKey,
      oneTimePreKey: bobOneTimePreKeys[0],
    });

    expect(constantTimeEqual(aliceOutput.sharedSecret, bobSecret)).toBe(true);
  });

  it('produces identical shared secrets without OPK', () => {
    const alice = { id: 'alice', identityKey: generateIdentityKey() };
    const bob = { id: 'bob', identityKey: generateIdentityKey() };
    const bobSPK = generateSignedPreKey(bob.identityKey, 1);

    const bundleWithoutOPK: RecipientPreKeyBundle = {
      userId: bob.id,
      registrationId: bob.identityKey.registrationId,
      identityDHPublicKey: bob.identityKey.dhPublicKey,
      identitySigningPublicKey: bob.identityKey.publicKey,
      signedPreKey: {
        keyId: bobSPK.keyId,
        publicKey: bobSPK.publicKey,
        signature: bobSPK.signature,
      },
    };

    const aliceOutput = x3dhSend(alice.identityKey, bundleWithoutOPK);
    const bobSecret = x3dhReceive({
      senderIdentityDHPublicKey: alice.identityKey.dhPublicKey,
      ephemeralPublicKey: aliceOutput.ephemeralPublicKey,
      identityKey: bob.identityKey,
      signedPreKey: bobSPK,
    });

    expect(constantTimeEqual(aliceOutput.sharedSecret, bobSecret)).toBe(true);
  });

  it('throws on invalid signed prekey signature', () => {
    const alice = { identityKey: generateIdentityKey() };
    const bob = { identityKey: generateIdentityKey() };
    const wrongIdentityKey = generateIdentityKey();
    const bobSPK = generateSignedPreKey(bob.identityKey, 1);

    // Bundle with wrong signing key
    const corruptBundle: RecipientPreKeyBundle = {
      userId: 'bob',
      registrationId: bob.identityKey.registrationId,
      identityDHPublicKey: bob.identityKey.dhPublicKey,
      identitySigningPublicKey: wrongIdentityKey.publicKey, // wrong!
      signedPreKey: {
        keyId: bobSPK.keyId,
        publicKey: bobSPK.publicKey,
        signature: bobSPK.signature,
      },
    };

    expect(() => x3dhSend(alice.identityKey, corruptBundle)).toThrow(
      'Invalid signed prekey signature',
    );
  });

  it('produces different secrets for different sessions', () => {
    const { alice, bob, bobSignedPreKey, bobOneTimePreKeys, bobBundle } = createTestUsers();

    const output1 = x3dhSend(alice.identityKey, bobBundle);

    // Second session (no OPK this time)
    const bobBundle2: RecipientPreKeyBundle = {
      ...bobBundle,
      oneTimePreKey: bobOneTimePreKeys[1]
        ? { keyId: bobOneTimePreKeys[1].keyId, publicKey: bobOneTimePreKeys[1].publicKey }
        : undefined,
    };
    const output2 = x3dhSend(alice.identityKey, bobBundle2);

    // Ephemeral keys should differ
    expect(toHex(output1.ephemeralPublicKey)).not.toBe(toHex(output2.ephemeralPublicKey));
    // Shared secrets should differ
    expect(constantTimeEqual(output1.sharedSecret, output2.sharedSecret)).toBe(false);

    void bob;
    void bobSignedPreKey;
  });
});

// ─── Double Ratchet Tests ─────────────────────────────────────────────────────

describe('Double Ratchet', () => {
  function setupRatchet() {
    const sharedSecret = randomBytes(32);
    const { alice, bob, bobSignedPreKey } = createTestUsers();

    const aliceSession = initSenderSession(sharedSecret, bobSignedPreKey.publicKey);
    const bobSession = initReceiverSession(sharedSecret, {
      publicKey: bobSignedPreKey.publicKey,
      privateKey: bobSignedPreKey.privateKey,
    });

    const aliceAD = new TextEncoder().encode('alice||bob');
    const bobAD = new TextEncoder().encode('alice||bob');

    return { aliceSession, bobSession, aliceAD, bobAD, alice, bob };
  }

  it('Alice can send a message to Bob', () => {
    const { aliceSession, bobSession, aliceAD, bobAD } = setupRatchet();

    const plaintext = new TextEncoder().encode('Hello, Bob!');
    const { message, session: aliceUpdated } = ratchetEncrypt(aliceSession, plaintext, aliceAD);
    const { plaintext: decrypted, session: bobUpdated } = ratchetDecrypt(
      bobSession,
      message,
      bobAD,
    );

    expect(new TextDecoder().decode(decrypted)).toBe('Hello, Bob!');
    expect(aliceUpdated.Ns).toBe(1);
    expect(bobUpdated.Nr).toBe(1);
  });

  it('supports bidirectional messaging', () => {
    const { aliceSession, bobSession, aliceAD, bobAD } = setupRatchet();

    // Alice sends
    const msg1 = new TextEncoder().encode('Hello from Alice');
    const { message: enc1, session: alice1 } = ratchetEncrypt(aliceSession, msg1, aliceAD);
    const { plaintext: dec1, session: bob1 } = ratchetDecrypt(bobSession, enc1, bobAD);
    expect(new TextDecoder().decode(dec1)).toBe('Hello from Alice');

    // Bob replies (triggers DH ratchet step in Alice)
    const msg2 = new TextEncoder().encode('Hello from Bob');
    const { message: enc2, session: bob2 } = ratchetEncrypt(bob1, msg2, bobAD);
    const { plaintext: dec2, session: alice2 } = ratchetDecrypt(alice1, enc2, aliceAD);
    expect(new TextDecoder().decode(dec2)).toBe('Hello from Bob');

    // Alice responds again
    const msg3 = new TextEncoder().encode('Back to Alice');
    const { message: enc3 } = ratchetEncrypt(alice2, msg3, aliceAD);
    const { plaintext: dec3 } = ratchetDecrypt(bob2, enc3, bobAD);
    expect(new TextDecoder().decode(dec3)).toBe('Back to Alice');
  });

  it('handles out-of-order messages', () => {
    const { aliceSession, bobSession, aliceAD, bobAD } = setupRatchet();

    // Alice sends 3 messages
    const { message: enc1, session: alice1 } = ratchetEncrypt(
      aliceSession,
      new TextEncoder().encode('Message 1'),
      aliceAD,
    );
    const { message: enc2, session: alice2 } = ratchetEncrypt(
      alice1,
      new TextEncoder().encode('Message 2'),
      aliceAD,
    );
    const { message: enc3 } = ratchetEncrypt(
      alice2,
      new TextEncoder().encode('Message 3'),
      aliceAD,
    );

    // Bob receives in reverse order: 3, 1, 2
    const { plaintext: dec3, session: bob1 } = ratchetDecrypt(bobSession, enc3, bobAD);
    expect(new TextDecoder().decode(dec3)).toBe('Message 3');

    const { plaintext: dec1, session: bob2 } = ratchetDecrypt(bob1, enc1, bobAD);
    expect(new TextDecoder().decode(dec1)).toBe('Message 1');

    const { plaintext: dec2 } = ratchetDecrypt(bob2, enc2, bobAD);
    expect(new TextDecoder().decode(dec2)).toBe('Message 2');
  });

  it('fails decryption with tampered ciphertext', () => {
    const { aliceSession, bobSession, aliceAD, bobAD } = setupRatchet();

    const { message } = ratchetEncrypt(
      aliceSession,
      new TextEncoder().encode('Secret'),
      aliceAD,
    );

    // Tamper with the ciphertext
    const tampered = { ...message, ciphertext: message.ciphertext.slice() };
    tampered.ciphertext[0] = (tampered.ciphertext[0] ?? 0) ^ 0xff;

    expect(() => ratchetDecrypt(bobSession, tampered, bobAD)).toThrow();
  });

  it('session state round-trips through serialization', () => {
    const { aliceSession, aliceAD } = setupRatchet();

    const { message: _m, session: updatedSession } = ratchetEncrypt(
      aliceSession,
      new TextEncoder().encode('test'),
      aliceAD,
    );

    const serialized = serializeSession(updatedSession);
    const deserialized = deserializeSession(serialized);

    expect(deserialized.Ns).toBe(updatedSession.Ns);
    expect(deserialized.Nr).toBe(updatedSession.Nr);
    expect(constantTimeEqual(deserialized.RK, updatedSession.RK)).toBe(true);
    expect(constantTimeEqual(deserialized.DHs.publicKey, updatedSession.DHs.publicKey)).toBe(true);
  });

  it('provides forward secrecy — old message keys are not reusable', () => {
    const { aliceSession, bobSession, aliceAD, bobAD } = setupRatchet();

    const plaintext = new TextEncoder().encode('Secret');
    const { message, session: _aliceUpdated } = ratchetEncrypt(aliceSession, plaintext, aliceAD);

    // Bob decrypts normally
    const { plaintext: dec1, session: bobUpdated } = ratchetDecrypt(bobSession, message, bobAD);
    expect(new TextDecoder().decode(dec1)).toBe('Secret');

    // Attempting to decrypt the same message again should fail
    // (message key was consumed, chain advanced)
    expect(() => ratchetDecrypt(bobUpdated, message, bobAD)).toThrow();
  });
});

// ─── Session Manager Tests ────────────────────────────────────────────────────

describe('Session Manager', () => {
  it('full message exchange through session manager', () => {
    const { alice, bob, bobSignedPreKey, bobOneTimePreKeys, bobBundle } = createTestUsers();

    // Alice creates outgoing session
    const aliceSession = createOutgoingSession(alice.identityKey, bobBundle);

    const messageContent = new TextEncoder().encode(
      JSON.stringify({ type: 'text', text: 'Hi Bob!', timestamp: Date.now() }),
    );

    const { envelope, updatedSession: aliceUpdated } = encryptMessage(
      aliceSession,
      messageContent,
      alice.identityKey,
      true, // first message
    );

    // Bob creates incoming session from the pre-key message
    const bobSession = createIncomingSession(
      bob.identityKey,
      bobSignedPreKey,
      bobOneTimePreKeys[0],
      fromHex(envelope.senderIdentityDHKey!),
      fromHex(envelope.ephemeralKey!),
      alice.id,
      alice.identityKey.publicKey,
    );

    const { plaintext, updatedSession: bobUpdated } = decryptMessage(
      bobSession,
      envelope,
      bob.identityKey,
      alice.identityKey.publicKey,
    );

    expect(new TextDecoder().decode(plaintext)).toContain('Hi Bob!');
    expect(aliceUpdated.updatedAt).toBeGreaterThan(0);
    expect(bobUpdated.updatedAt).toBeGreaterThan(0);
  });

  it('round-trips session through storage serialization', () => {
    const { alice, bobBundle } = createTestUsers();
    const session = createOutgoingSession(alice.identityKey, bobBundle);

    const serialized = serializeSessionToStorage(session);
    const deserialized = deserializeSessionFromStorage(serialized);

    expect(deserialized.contactId).toBe(session.contactId);
    expect(deserialized.contactIdentityKey).toBe(session.contactIdentityKey);
    expect(deserialized.ratchetState.Ns).toBe(session.ratchetState.Ns);
  });
});

// ─── Media Encryption Tests ───────────────────────────────────────────────────

describe('Media Encryption', () => {
  it('encrypts and decrypts a media blob', async () => {
    const originalData = new TextEncoder().encode('fake image data bytes 🖼️');
    const { encryptedBlob, mediaKey, digest } = await encryptMedia(originalData);

    expect(encryptedBlob).not.toEqual(originalData);
    expect(mediaKey).toHaveLength(64);
    expect(digest).toHaveLength(32);

    const decrypted = decryptMedia(encryptedBlob, mediaKey, digest);
    expect(constantTimeEqual(decrypted, originalData)).toBe(true);
  });

  it('fails with wrong media key', async () => {
    const data = randomBytes(100);
    const { encryptedBlob, digest } = await encryptMedia(data);
    const wrongKey = randomBytes(64);

    expect(() => decryptMedia(encryptedBlob, wrongKey, digest)).toThrow();
  });

  it('fails with tampered digest', async () => {
    const data = randomBytes(100);
    const { encryptedBlob, mediaKey, digest } = await encryptMedia(data);
    const tamperedDigest = new Uint8Array(digest);
    tamperedDigest[0] = (tamperedDigest[0] ?? 0) ^ 0xff;

    expect(() => decryptMedia(encryptedBlob, mediaKey, tamperedDigest)).toThrow(
      'Media integrity check failed',
    );
  });

  it('produces different ciphertext for same plaintext', async () => {
    const data = new TextEncoder().encode('same data');
    const result1 = await encryptMedia(data);
    const result2 = await encryptMedia(data);

    // Different keys → different ciphertext
    expect(toHex(result1.encryptedBlob)).not.toBe(toHex(result2.encryptedBlob));
    expect(toHex(result1.mediaKey)).not.toBe(toHex(result2.mediaKey));
  });
});

// ─── Utility Tests ────────────────────────────────────────────────────────────

describe('Utilities', () => {
  it('constantTimeEqual is correct', () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 2, 3]);
    const c = new Uint8Array([1, 2, 4]);
    const d = new Uint8Array([1, 2]);

    expect(constantTimeEqual(a, b)).toBe(true);
    expect(constantTimeEqual(a, c)).toBe(false);
    expect(constantTimeEqual(a, d)).toBe(false);
  });

  it('hex encoding round-trips', () => {
    const bytes = randomBytes(32);
    const hex = toHex(bytes);
    const decoded = fromHex(hex);
    expect(constantTimeEqual(bytes, decoded)).toBe(true);
  });

  it('toHex produces lowercase hex', () => {
    const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    expect(toHex(bytes)).toBe('deadbeef');
  });
});

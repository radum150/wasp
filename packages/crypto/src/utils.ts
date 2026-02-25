/**
 * Cryptographic utility functions.
 * All operations are constant-time where it matters for security.
 */

/**
 * Concatenate multiple Uint8Arrays into one.
 */
export function concat(...arrays: Uint8Array[]): Uint8Array {
  const totalLen = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

/**
 * Constant-time comparison of two byte arrays.
 * Prevents timing attacks on key comparison.
 */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

/**
 * Encode bytes as lowercase hex string.
 */
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Decode a hex string to bytes.
 */
export function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('Invalid hex string length');
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Encode bytes as base64url string (URL-safe, no padding).
 */
export function toBase64(bytes: Uint8Array): string {
  // Works in Node.js and modern browsers
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(binary);
}

/**
 * Decode a base64 string to bytes.
 */
export function fromBase64(b64: string): Uint8Array {
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

/**
 * Generate cryptographically secure random bytes.
 */
export function randomBytes(length: number): Uint8Array {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return bytes;
  }
  // Node.js fallback
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { randomBytes: nodeRandomBytes } = require('crypto') as typeof import('crypto');
  return new Uint8Array(nodeRandomBytes(length));
}

/**
 * Generate a random 32-bit registration ID (1..16380 per Signal spec).
 */
export function generateRegistrationId(): number {
  const bytes = randomBytes(2);
  const raw = ((bytes[0] ?? 0) << 8) | (bytes[1] ?? 0);
  return (raw & 0x3fff) + 1; // 1..16380
}

/**
 * Securely zero out a key buffer to prevent it lingering in memory.
 */
export function zeroize(bytes: Uint8Array): void {
  bytes.fill(0);
}

/**
 * Encode a 32-bit unsigned integer as 4 big-endian bytes.
 */
export function uint32ToBytes(n: number): Uint8Array {
  const buf = new Uint8Array(4);
  const view = new DataView(buf.buffer);
  view.setUint32(0, n, false);
  return buf;
}

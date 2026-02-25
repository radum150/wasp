/**
 * Redis client.
 *
 * Redis is used ONLY for:
 * 1. Session routing — mapping userId → WebSocket connection ID
 * 2. Offline message queue — holding encrypted envelopes for offline users
 *    (TTL-limited, server cannot read content)
 * 3. Prekey storage — public key bundles for key distribution
 * 4. Active presence — online/offline status
 *
 * The server NEVER stores plaintext message content in Redis.
 * Offline message envelopes are opaque encrypted blobs.
 */

import { Redis } from 'ioredis';
import { config, isDev } from './config.js';

let redis: Redis | null = null;
let usingMemoryFallback = false;

// ─── In-memory fallback (dev only) ───────────────────────────────────────────
// A minimal Redis-compatible store so the server works without a Redis instance.
// NOT suitable for production (single-process, no TTL enforcement, no pub/sub).
const mem: Record<string, string> = {};
const memLists: Record<string, string[]> = {};
const memHashes: Record<string, Record<string, string>> = {};
const memExpiry: Record<string, number> = {};

function memExpired(key: string): boolean {
  const exp = memExpiry[key];
  if (exp && Date.now() > exp) {
    delete mem[key];
    delete memLists[key];
    delete memHashes[key];
    delete memExpiry[key];
    return true;
  }
  return false;
}

// Minimal shim that satisfies every Redis call made in this file
const memRedis = {
  get: async (key: string) => (memExpired(key) ? null : (mem[key] ?? null)),
  set: async (key: string, value: string) => { mem[key] = value; return 'OK'; },
  setex: async (key: string, ttl: number, value: string) => {
    mem[key] = value;
    memExpiry[key] = Date.now() + ttl * 1000;
    return 'OK';
  },
  del: async (...keys: string[]) => { keys.forEach((k) => { delete mem[k]; delete memLists[k]; delete memHashes[k]; }); return keys.length; },
  keys: async (pattern: string) => {
    const re = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return Object.keys(mem).filter((k) => !memExpired(k) && re.test(k));
  },
  expire: async (key: string, ttl: number) => { memExpiry[key] = Date.now() + ttl * 1000; return 1; },
  // List ops
  rpush: async (key: string, ...vals: string[]) => { (memLists[key] ??= []).push(...vals); return (memLists[key] ?? []).length; },
  lpop: async (key: string) => { return memLists[key]?.shift() ?? null; },
  lrange: async (key: string, start: number, end: number) => {
    const list = memLists[key] ?? [];
    return end === -1 ? list.slice(start) : list.slice(start, end + 1);
  },
  llen: async (key: string) => (memLists[key]?.length ?? 0),
  // Hash ops
  hset: async (key: string, fields: Record<string, string>) => {
    memHashes[key] ??= {};
    Object.assign(memHashes[key]!, fields);
    return Object.keys(fields).length;
  },
  hgetall: async (key: string) => memHashes[key] ?? {},
};

export function getRedis(): typeof memRedis | InstanceType<typeof Redis> {
  if (usingMemoryFallback) return memRedis;
  if (!redis) {
    redis = new Redis(config.REDIS_URL, {
      password: config.REDIS_PASSWORD,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null, // don't retry — we'll fall back immediately
      enableReadyCheck: true,
      lazyConnect: true,
    });
    redis.on('error', () => { /* suppressed after fallback decision */ });
    redis.on('connect', () => { console.info('[Redis] Connected'); });
  }
  return redis;
}

export async function connectRedis(): Promise<void> {
  if (usingMemoryFallback) return;
  try {
    await (getRedis() as Redis).connect();
  } catch {
    if (isDev) {
      usingMemoryFallback = true;
      redis = null;
      console.warn(
        '\n⚠️  Redis unavailable — using in-memory store (dev only).\n' +
        '   Run: docker run -p 6379:6379 redis\n' +
        '   Data will be lost on server restart.\n',
      );
    } else {
      throw new Error('[Redis] Cannot connect in production — is Redis running?');
    }
  }
}

export async function disconnectRedis(): Promise<void> {
  if (redis && !usingMemoryFallback) {
    await redis.quit();
    redis = null;
  }
}

// ─── Key naming conventions ───────────────────────────────────────────────────

export const RedisKeys = {
  /** User presence: online/offline + last seen */
  presence: (userId: string) => `presence:${userId}`,
  /** User's WebSocket connection ID (for routing) */
  session: (userId: string) => `session:${userId}`,
  /** Offline message queue for a user */
  offlineQueue: (userId: string) => `offline:${userId}`,
  /** User's identity key bundle (public keys only) */
  keyBundle: (userId: string) => `keys:bundle:${userId}`,
  /** User's one-time prekeys (FIFO queue) */
  otpKeys: (userId: string) => `keys:otp:${userId}`,
  /** User account data */
  user: (userId: string) => `user:${userId}`,
  /** Username → userId index */
  usernameIndex: (username: string) => `username:${username.toLowerCase()}`,
  /** Phone → userId index */
  phoneIndex: (phone: string) => `phone:${phone}`,
} as const;

// ─── User storage ─────────────────────────────────────────────────────────────

export interface StoredUser {
  id: string;
  username: string;
  displayName: string;
  phoneNumber?: string;
  avatarUrl?: string;
  about?: string;
  passwordHash: string;
  registrationId: number;
  createdAt: number;
}

export async function storeUser(user: StoredUser): Promise<void> {
  const r = getRedis();
  await r.set(RedisKeys.user(user.id), JSON.stringify(user));
  await r.set(RedisKeys.usernameIndex(user.username), user.id);
  if (user.phoneNumber) {
    await r.set(RedisKeys.phoneIndex(user.phoneNumber), user.id);
  }
}

export async function getUserById(id: string): Promise<StoredUser | null> {
  const r = getRedis();
  const data = await r.get(RedisKeys.user(id));
  return data ? (JSON.parse(data) as StoredUser) : null;
}

export async function getUserByUsername(username: string): Promise<StoredUser | null> {
  const r = getRedis();
  const id = await r.get(RedisKeys.usernameIndex(username));
  if (!id) return null;
  return getUserById(id);
}

export async function getUserByPhone(phone: string): Promise<StoredUser | null> {
  const r = getRedis();
  const id = await r.get(RedisKeys.phoneIndex(phone));
  if (!id) return null;
  return getUserById(id);
}

export async function searchUsersByUsername(query: string, limit = 20): Promise<StoredUser[]> {
  // Simple prefix scan — in production, use RediSearch or a proper search index
  const r = getRedis();
  const pattern = RedisKeys.usernameIndex(`${query}*`);
  const keys = await r.keys(pattern);
  const results: StoredUser[] = [];
  for (const key of keys.slice(0, limit)) {
    const id = await r.get(key);
    if (id) {
      const user = await getUserById(id);
      if (user) results.push(user);
    }
  }
  return results;
}

// ─── Key Bundle storage ───────────────────────────────────────────────────────

export interface KeyBundle {
  userId: string;
  registrationId: number;
  identitySigningPublicKey: string;
  identityDHPublicKey: string;
  signedPreKey: {
    keyId: number;
    publicKey: string;
    signature: string;
  };
}

export async function storeKeyBundle(bundle: KeyBundle): Promise<void> {
  const r = getRedis();
  await r.set(RedisKeys.keyBundle(bundle.userId), JSON.stringify(bundle));
}

export async function getKeyBundle(userId: string): Promise<KeyBundle | null> {
  const r = getRedis();
  const data = await r.get(RedisKeys.keyBundle(userId));
  return data ? (JSON.parse(data) as KeyBundle) : null;
}

// ─── One-Time PreKeys ─────────────────────────────────────────────────────────

export interface PublicOTPKey {
  keyId: number;
  publicKey: string;
}

export async function uploadOneTimePreKeys(userId: string, keys: PublicOTPKey[]): Promise<void> {
  const r = getRedis();
  const queueKey = RedisKeys.otpKeys(userId);
  if (keys.length > 0) {
    await r.rpush(queueKey, ...keys.map((k) => JSON.stringify(k)));
  }
}

export async function consumeOneTimePreKey(userId: string): Promise<PublicOTPKey | null> {
  const r = getRedis();
  const data = await r.lpop(RedisKeys.otpKeys(userId));
  return data ? (JSON.parse(data) as PublicOTPKey) : null;
}

export async function countOneTimePreKeys(userId: string): Promise<number> {
  const r = getRedis();
  return r.llen(RedisKeys.otpKeys(userId));
}

// ─── Offline message queue ────────────────────────────────────────────────────

export interface OfflineEnvelope {
  messageId: string;
  from: string;
  envelope: string; // opaque encrypted blob
  enqueuedAt: number;
}

export async function enqueueOfflineMessage(
  recipientId: string,
  msg: OfflineEnvelope,
  ttlSeconds: number,
): Promise<void> {
  const r = getRedis();
  const queueKey = RedisKeys.offlineQueue(recipientId);
  await r.rpush(queueKey, JSON.stringify(msg));
  await r.expire(queueKey, ttlSeconds);
}

export async function drainOfflineQueue(recipientId: string): Promise<OfflineEnvelope[]> {
  const r = getRedis();
  const queueKey = RedisKeys.offlineQueue(recipientId);
  const all = await r.lrange(queueKey, 0, -1);
  if (all.length > 0) {
    await r.del(queueKey);
  }
  return all.map((s: string) => JSON.parse(s) as OfflineEnvelope);
}

// ─── Presence ─────────────────────────────────────────────────────────────────

export async function setUserOnline(userId: string): Promise<void> {
  const r = getRedis();
  await r.hset(RedisKeys.presence(userId), {
    online: '1',
    lastSeen: Date.now().toString(),
  });
}

export async function setUserOffline(userId: string): Promise<void> {
  const r = getRedis();
  await r.hset(RedisKeys.presence(userId), {
    online: '0',
    lastSeen: Date.now().toString(),
  });
}

export async function getUserPresence(
  userId: string,
): Promise<{ online: boolean; lastSeen: number } | null> {
  const r = getRedis();
  const data = await r.hgetall(RedisKeys.presence(userId));
  if (!data.online) return null;
  return {
    online: data.online === '1',
    lastSeen: data.lastSeen ? parseInt(data.lastSeen, 10) : 0,
  };
}

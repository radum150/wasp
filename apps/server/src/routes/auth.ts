/**
 * Authentication routes.
 *
 * POST /auth/register  — Register a new user
 * POST /auth/login     — Login and get tokens
 * POST /auth/refresh   — Refresh access token
 * POST /auth/logout    — Invalidate refresh token
 */

import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import {
  storeUser,
  getUserByUsername,
  getUserByPhone,
  getRedis,
  type StoredUser,
} from '../redis.js';
import { config } from '../config.js';

// ─── Validation schemas ───────────────────────────────────────────────────────

const RegisterSchema = z.object({
  username: z
    .string()
    .min(config.USERNAME_MIN_LENGTH)
    .max(config.USERNAME_MAX_LENGTH)
    .regex(/^[a-zA-Z0-9_.-]+$/, 'Username can only contain letters, numbers, _, -, .'),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(config.DISPLAY_NAME_MAX_LENGTH),
  phoneNumber: z.string().optional(),
  registrationId: z.number().int().min(1).max(16380),
});

const LoginSchema = z.object({
  username: z.string(),
  password: z.string(),
});

const RefreshSchema = z.object({
  refreshToken: z.string(),
});

// ─── Password hashing ─────────────────────────────────────────────────────────

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 600_000, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  const saltHex = Buffer.from(salt).toString('hex');
  const hashHex = Buffer.from(bits).toString('hex');
  return `pbkdf2:${saltHex}:${hashHex}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [, saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 600_000, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  const computedHex = Buffer.from(bits).toString('hex');
  // Constant-time comparison
  if (computedHex.length !== hashHex.length) return false;
  let diff = 0;
  for (let i = 0; i < computedHex.length; i++) {
    diff |= computedHex.charCodeAt(i) ^ hashHex.charCodeAt(i);
  }
  return diff === 0;
}

// ─── Token generation ─────────────────────────────────────────────────────────

async function generateTokens(app: FastifyInstance, userId: string) {
  const accessToken = await app.jwt.sign(
    { sub: userId },
    { expiresIn: config.JWT_ACCESS_EXPIRES_IN },
  );
  const refreshToken = await app.jwt.sign(
    { sub: userId, type: 'refresh' },
    { expiresIn: config.JWT_REFRESH_EXPIRES_IN },
  );

  // Store refresh token in Redis for revocation
  const r = getRedis();
  await r.setex(`refresh:${userId}:${refreshToken.slice(-10)}`, 30 * 24 * 60 * 60, '1');

  return {
    accessToken,
    refreshToken,
    expiresIn: 15 * 60, // 15 minutes in seconds
  };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // POST /auth/register
  app.post('/register', async (request, reply) => {
    const body = RegisterSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: body.error.message },
      });
    }

    const { username, password, displayName, phoneNumber, registrationId } = body.data;

    // Check username uniqueness
    const existing = await getUserByUsername(username);
    if (existing) {
      return reply.status(409).send({
        success: false,
        error: { code: 'USERNAME_TAKEN', message: 'Username is already taken' },
      });
    }

    // Check phone uniqueness
    if (phoneNumber) {
      const byPhone = await getUserByPhone(phoneNumber);
      if (byPhone) {
        return reply.status(409).send({
          success: false,
          error: { code: 'PHONE_TAKEN', message: 'Phone number already registered' },
        });
      }
    }

    const passwordHash = await hashPassword(password);
    const userId = randomUUID();
    const user: StoredUser = {
      id: userId,
      username,
      displayName,
      ...(phoneNumber !== undefined ? { phoneNumber } : {}),
      passwordHash,
      registrationId,
      createdAt: Date.now(),
    };

    await storeUser(user);

    const tokens = await generateTokens(app, userId);

    app.log.info({ userId, username }, 'New user registered');

    return reply.status(201).send({
      success: true,
      data: {
        user: {
          id: userId,
          username,
          displayName,
          phoneNumber,
          createdAt: user.createdAt,
          isOnline: false,
        },
        tokens,
      },
    });
  });

  // POST /auth/login
  app.post('/login', async (request, reply) => {
    const body = LoginSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request' },
      });
    }

    const { username, password } = body.data;
    const user = await getUserByUsername(username);

    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      // Timing-safe: always run verify even if user not found
      if (!user) await verifyPassword(password, 'pbkdf2:0000:0000');
      return reply.status(401).send({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' },
      });
    }

    const tokens = await generateTokens(app, user.id);

    return reply.send({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          phoneNumber: user.phoneNumber,
          createdAt: user.createdAt,
          isOnline: false,
        },
        tokens,
      },
    });
  });

  // POST /auth/refresh
  app.post('/refresh', async (request, reply) => {
    const body = RefreshSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'refreshToken required' },
      });
    }

    try {
      const decoded = await app.jwt.verify<{ sub: string; type: string }>(
        body.data.refreshToken,
      );

      if (decoded.type !== 'refresh') {
        throw new Error('Not a refresh token');
      }

      // Check if token is revoked
      const r = getRedis();
      const revoked = await r.get(`revoked:refresh:${decoded.sub}:${body.data.refreshToken.slice(-10)}`);
      if (revoked) {
        return reply.status(401).send({
          success: false,
          error: { code: 'TOKEN_REVOKED', message: 'Token has been revoked' },
        });
      }

      const accessToken = await app.jwt.sign(
        { sub: decoded.sub },
        { expiresIn: config.JWT_ACCESS_EXPIRES_IN },
      );

      return reply.send({
        success: true,
        data: { accessToken, expiresIn: 15 * 60 },
      });
    } catch {
      return reply.status(401).send({
        success: false,
        error: { code: 'INVALID_TOKEN', message: 'Invalid or expired refresh token' },
      });
    }
  });

  // POST /auth/logout
  app.post(
    '/logout',
    {
      preHandler: async (request, reply) => {
        try {
          await request.jwtVerify();
        } catch {
          return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
        }
      },
    },
    async (request, reply) => {
      const body = RefreshSchema.safeParse(request.body);
      if (body.success) {
        // Revoke the refresh token
        const r = getRedis();
        const decoded = request.user as { sub: string };
        await r.setex(
          `revoked:refresh:${decoded.sub}:${body.data.refreshToken.slice(-10)}`,
          30 * 24 * 60 * 60,
          '1',
        );
      }
      return reply.send({ success: true });
    },
  );
}

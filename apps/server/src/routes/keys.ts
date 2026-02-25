/**
 * Key distribution routes.
 *
 * GET  /keys/:userId/bundle    — Fetch a user's PreKey Bundle (for session initiation)
 * POST /keys/bundle            — Upload/update your key bundle (signed prekey)
 * POST /keys/prekeys           — Upload one-time prekeys
 * GET  /keys/prekeys/count     — Check how many OPKs are remaining
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  storeKeyBundle,
  getKeyBundle,
  uploadOneTimePreKeys,
  consumeOneTimePreKey,
  countOneTimePreKeys,
} from '../redis.js';
import { config } from '../config.js';

const UploadBundleSchema = z.object({
  registrationId: z.number().int().min(1).max(16380),
  identitySigningPublicKey: z.string().length(64), // 32 bytes hex
  identityDHPublicKey: z.string().length(64),
  signedPreKey: z.object({
    keyId: z.number().int().min(0),
    publicKey: z.string().length(64),
    signature: z.string().length(128), // 64 bytes hex
  }),
});

const UploadPreKeysSchema = z.object({
  oneTimePreKeys: z
    .array(
      z.object({
        keyId: z.number().int().min(0),
        publicKey: z.string().length(64),
      }),
    )
    .min(1)
    .max(config.MAX_OPK_UPLOAD_BATCH),
});

export async function keysRoutes(app: FastifyInstance): Promise<void> {
  // GET /keys/:userId/bundle — fetch a user's PreKey Bundle
  app.get<{ Params: { userId: string } }>(
    '/:userId/bundle',
    {
      preHandler: async (request, reply) => {
        try {
          await request.jwtVerify();
        } catch {
          return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
        }
      },
    },
    async (request, reply) => {
      const { userId } = request.params;

      const bundle = await getKeyBundle(userId);
      if (!bundle) {
        return reply.status(404).send({
          success: false,
          error: { code: 'USER_NOT_FOUND', message: 'User not found or no keys uploaded' },
        });
      }

      // Try to attach a one-time prekey
      const otpk = await consumeOneTimePreKey(userId);

      return reply.send({
        success: true,
        data: {
          bundle: {
            ...bundle,
            oneTimePreKey: otpk ?? null,
          },
        },
      });
    },
  );

  // POST /keys/bundle — upload your key bundle
  app.post(
    '/bundle',
    {
      preHandler: async (request, reply) => {
        try {
          await request.jwtVerify();
        } catch {
          return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
        }
      },
    },
    async (request, reply) => {
      const user = request.user as { sub: string };
      const body = UploadBundleSchema.safeParse(request.body);

      if (!body.success) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: body.error.message },
        });
      }

      await storeKeyBundle({
        userId: user.sub,
        ...body.data,
      });

      return reply.send({ success: true });
    },
  );

  // POST /keys/prekeys — upload one-time prekeys
  app.post(
    '/prekeys',
    {
      preHandler: async (request, reply) => {
        try {
          await request.jwtVerify();
        } catch {
          return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
        }
      },
    },
    async (request, reply) => {
      const user = request.user as { sub: string };
      const body = UploadPreKeysSchema.safeParse(request.body);

      if (!body.success) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: body.error.message },
        });
      }

      await uploadOneTimePreKeys(user.sub, body.data.oneTimePreKeys);
      const newCount = await countOneTimePreKeys(user.sub);

      return reply.send({
        success: true,
        data: { uploaded: body.data.oneTimePreKeys.length, totalRemaining: newCount },
      });
    },
  );

  // GET /keys/prekeys/count — check remaining OPK count
  app.get(
    '/prekeys/count',
    {
      preHandler: async (request, reply) => {
        try {
          await request.jwtVerify();
        } catch {
          return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
        }
      },
    },
    async (request, reply) => {
      const user = request.user as { sub: string };
      const count = await countOneTimePreKeys(user.sub);
      return reply.send({
        success: true,
        data: {
          count,
          needsRefill: count < config.PREKEY_REFILL_THRESHOLD,
        },
      });
    },
  );
}

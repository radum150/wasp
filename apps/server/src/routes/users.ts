/**
 * User discovery routes.
 *
 * GET /users/me        — Get current user profile
 * PUT /users/me        — Update profile
 * GET /users/search    — Search users by username
 * GET /users/:id       — Get a user's public profile
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getUserById, searchUsersByUsername, storeUser } from '../redis.js';
import { config } from '../config.js';

const UpdateProfileSchema = z.object({
  displayName: z.string().min(1).max(config.DISPLAY_NAME_MAX_LENGTH).optional(),
  about: z.string().max(139).optional(),
  avatarUrl: z.string().url().optional().nullable(),
});

const SearchSchema = z.object({
  q: z.string().min(1).max(50),
  limit: z.coerce.number().min(1).max(50).default(20),
});

export async function usersRoutes(app: FastifyInstance): Promise<void> {
  const requireAuth = async (
    request: { jwtVerify: () => Promise<void> },
    reply: { status: (n: number) => { send: (v: unknown) => void } },
  ) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    }
  };

  // GET /users/me
  app.get(
    '/me',
    {
      preHandler: async (req, reply) => requireAuth(req as Parameters<typeof requireAuth>[0], reply as Parameters<typeof requireAuth>[1]),
    },
    async (request, reply) => {
      const user = request.user as { sub: string };
      const profile = await getUserById(user.sub);
      if (!profile) {
        return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
      }
      return reply.send({
        success: true,
        data: {
          id: profile.id,
          username: profile.username,
          displayName: profile.displayName,
          phoneNumber: profile.phoneNumber,
          avatarUrl: profile.avatarUrl,
          about: profile.about,
          createdAt: profile.createdAt,
          isOnline: true,
        },
      });
    },
  );

  // PUT /users/me
  app.put(
    '/me',
    {
      preHandler: async (req, reply) => requireAuth(req as Parameters<typeof requireAuth>[0], reply as Parameters<typeof requireAuth>[1]),
    },
    async (request, reply) => {
      const user = request.user as { sub: string };
      const body = UpdateProfileSchema.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: body.error.message } });
      }

      const existing = await getUserById(user.sub);
      if (!existing) {
        return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
      }

      const updated = { ...existing };
      if (body.data.displayName) updated.displayName = body.data.displayName;
      if (body.data.about !== undefined) updated.about = body.data.about;
      if (body.data.avatarUrl !== undefined) {
        if (body.data.avatarUrl === null) delete updated.avatarUrl;
        else updated.avatarUrl = body.data.avatarUrl;
      }

      await storeUser(updated);

      return reply.send({
        success: true,
        data: {
          id: updated.id,
          username: updated.username,
          displayName: updated.displayName,
          avatarUrl: updated.avatarUrl,
          about: updated.about,
        },
      });
    },
  );

  // GET /users/search?q=...
  app.get(
    '/search',
    {
      preHandler: async (req, reply) => requireAuth(req as Parameters<typeof requireAuth>[0], reply as Parameters<typeof requireAuth>[1]),
    },
    async (request, reply) => {
      const query = SearchSchema.safeParse(request.query);
      if (!query.success) {
        return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid query' } });
      }

      const users = await searchUsersByUsername(query.data.q, query.data.limit);
      return reply.send({
        success: true,
        data: {
          users: users.map((u) => ({
            id: u.id,
            username: u.username,
            displayName: u.displayName,
            avatarUrl: u.avatarUrl,
          })),
        },
      });
    },
  );

  // GET /users/:id
  app.get<{ Params: { id: string } }>(
    '/:id',
    {
      preHandler: async (req, reply) => requireAuth(req as Parameters<typeof requireAuth>[0], reply as Parameters<typeof requireAuth>[1]),
    },
    async (request, reply) => {
      const profile = await getUserById(request.params.id);
      if (!profile) {
        return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
      }

      return reply.send({
        success: true,
        data: {
          id: profile.id,
          username: profile.username,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
          // Never expose: passwordHash, phoneNumber (unless contacts)
        },
      });
    },
  );
}

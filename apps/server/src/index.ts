/**
 * WASP Relay Server
 *
 * A "dumb relay" — the server's ONLY jobs are:
 * 1. Authenticate users (JWT)
 * 2. Distribute public keys (never private keys)
 * 3. Route encrypted message envelopes to recipients
 * 4. Queue encrypted envelopes for offline users (TTL-limited)
 * 5. Signal when prekeys need refilling
 *
 * The server NEVER:
 * - Stores or logs message content
 * - Decrypts any messages (it cannot — it has no keys)
 * - Runs analytics or recommendation algorithms
 * - Retains metadata beyond what's needed for active routing
 */

import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Resolve the web build relative to this file's location at runtime.
// In production: apps/server/dist/ → apps/web/dist/
// In dev this folder may not exist — plugin is skipped gracefully.
const WEB_DIST = path.resolve(__dirname, '../../web/dist');

import { config, corsOrigins, isDev } from './config.js';
import { connectRedis, disconnectRedis } from './redis.js';
import { registerRelay, getActiveConnectionCount } from './relay.js';
import { authRoutes } from './routes/auth.js';
import { keysRoutes } from './routes/keys.js';
import { usersRoutes } from './routes/users.js';

// ─── Build app ────────────────────────────────────────────────────────────────

const app = Fastify({
  logger: {
    level: isDev ? 'debug' : 'info',
    ...(isDev ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } } } : {}),
  },
  trustProxy: true,
  bodyLimit: config.MAX_MESSAGE_SIZE_BYTES * 2,
});

// ─── Plugins ──────────────────────────────────────────────────────────────────

await app.register(helmet, {
  contentSecurityPolicy: false, // Handled by reverse proxy
  crossOriginEmbedderPolicy: false,
});

await app.register(cors, {
  origin: isDev ? true : corsOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
});

await app.register(jwt, {
  secret: config.JWT_SECRET,
});

await app.register(rateLimit, {
  global: true,
  max: config.RATE_LIMIT_MAX,
  timeWindow: config.RATE_LIMIT_WINDOW_MS,
  errorResponseBuilder: () => ({
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many requests — please slow down' },
  }),
});

await app.register(websocket, {
  options: {
    maxPayload: config.MAX_MESSAGE_SIZE_BYTES * 2,
    clientTracking: false,
  },
});

// ─── Routes ───────────────────────────────────────────────────────────────────

// Health check (no auth)
app.get('/health', async () => ({
  status: 'ok',
  timestamp: Date.now(),
  connections: getActiveConnectionCount(),
  version: '0.1.0',
}));

// Auth routes
await app.register(authRoutes, { prefix: '/auth' });

// Key distribution routes
await app.register(keysRoutes, { prefix: '/keys' });

// User discovery routes
await app.register(usersRoutes, { prefix: '/users' });

// WebSocket relay
await registerRelay(app);

// ─── Static web client ────────────────────────────────────────────────────────

if (existsSync(WEB_DIST)) {
  await app.register(fastifyStatic, {
    root: WEB_DIST,
    prefix: '/',
    // Don't decorate reply — we do that via setNotFoundHandler below
    decorateReply: false,
  });
}

// ─── 404 / SPA fallback ───────────────────────────────────────────────────────

const API_PREFIXES = ['/auth', '/keys', '/users', '/ws', '/health'];

app.setNotFoundHandler((request, reply) => {
  const isApiRoute = API_PREFIXES.some((p) => request.url.startsWith(p));
  if (isApiRoute || !existsSync(WEB_DIST)) {
    return reply.status(404).send({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Route not found' },
    });
  }
  // SPA fallback — let the React router handle the path
  return reply.sendFile('index.html', WEB_DIST);
});

// ─── Error handler ────────────────────────────────────────────────────────────

app.setErrorHandler((error, _request, reply) => {
  app.log.error(error);
  return reply.status(error.statusCode ?? 500).send({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: isDev ? error.message : 'An internal error occurred',
    },
  });
});

// ─── Startup ──────────────────────────────────────────────────────────────────

async function start(): Promise<void> {
  try {
    await connectRedis();
    await app.listen({ port: config.PORT, host: config.HOST });
    app.log.info(`
╔═══════════════════════════════════════════════════════╗
║   WASP Relay Server                                   ║
║   We Are Signal Protocol                              ║
╠═══════════════════════════════════════════════════════╣
║   Port    : ${String(config.PORT).padEnd(42)}║
║   Mode    : ${config.NODE_ENV.padEnd(42)}║
║   Version : 0.1.0                                     ║
╠═══════════════════════════════════════════════════════╣
║   Zero message storage. Zero content logging.         ║
║   End-to-end encrypted. Community owned.              ║
╚═══════════════════════════════════════════════════════╝
    `);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────

async function shutdown(): Promise<void> {
  app.log.info('Shutting down gracefully...');
  await app.close();
  await disconnectRedis();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

void start();

/**
 * Server configuration.
 * All values come from environment variables with safe defaults for development.
 */

import { z } from 'zod';

const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),

  // JWT — dev defaults are insecure; always override in production
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters')
    .default('dev-only-insecure-jwt-secret-change-me-in-prod-32+'),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32, 'JWT_REFRESH_SECRET must be at least 32 characters')
    .default('dev-only-insecure-refresh-secret-change-me-in-prod!!'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),

  // Redis (for ephemeral session routing + offline message queue)
  REDIS_URL: z.string().default('redis://localhost:6379'),
  REDIS_PASSWORD: z.string().optional(),

  // CORS
  CORS_ORIGINS: z.string().default('http://localhost:5173'),

  // Relay limits
  MAX_MESSAGE_SIZE_BYTES: z.coerce.number().default(65_536), // 64KB
  PREKEY_REFILL_THRESHOLD: z.coerce.number().default(10),

  // Offline message queue TTL (seconds)
  OFFLINE_MESSAGE_TTL_SECONDS: z.coerce.number().default(7 * 24 * 60 * 60), // 7 days

  // Rate limiting
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60_000),

  // Username constraints
  USERNAME_MIN_LENGTH: z.coerce.number().default(3),
  USERNAME_MAX_LENGTH: z.coerce.number().default(32),
  DISPLAY_NAME_MAX_LENGTH: z.coerce.number().default(64),
  MAX_OPK_UPLOAD_BATCH: z.coerce.number().default(100),
});

type Config = z.infer<typeof ConfigSchema>;

function loadConfig(): Config {
  const result = ConfigSchema.safeParse(process.env);
  if (!result.success) {
    console.error('[Config] Invalid configuration:', result.error.format());
    process.exit(1);
  }
  const cfg = result.data;

  if (cfg.NODE_ENV !== 'production') {
    const usingDefaultSecret =
      cfg.JWT_SECRET.startsWith('dev-only') || cfg.JWT_REFRESH_SECRET.startsWith('dev-only');
    if (usingDefaultSecret) {
      console.warn(
        '\n⚠️  WARNING: Using insecure dev-only JWT secrets.\n' +
        '   Set JWT_SECRET and JWT_REFRESH_SECRET in .env before deploying.\n',
      );
    }
  } else {
    // In production, insecure defaults must never be used
    if (cfg.JWT_SECRET.startsWith('dev-only') || cfg.JWT_REFRESH_SECRET.startsWith('dev-only')) {
      console.error('[Config] FATAL: Cannot use dev-only JWT secrets in production.');
      process.exit(1);
    }
  }

  return cfg;
}

export const config = loadConfig();

export const isDev = config.NODE_ENV === 'development';
export const isProd = config.NODE_ENV === 'production';

// Parsed CORS origins
export const corsOrigins = config.CORS_ORIGINS.split(',').map((s) => s.trim());

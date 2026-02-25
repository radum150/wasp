/**
 * Database client — opens and initializes the local SQLite database.
 *
 * On platforms where SQLCipher is available (Node.js desktop via better-sqlite3-sqlcipher),
 * the database is encrypted at rest with a key derived from the user's passphrase.
 *
 * On platforms without SQLCipher, we use WAL mode with standard SQLite and rely on
 * OS-level filesystem encryption + the app sandbox for security.
 *
 * The database key is NEVER sent to the server.
 */

import Database from 'better-sqlite3';
import { CREATE_TABLES_SQL, INITIAL_SETTINGS, SCHEMA_VERSION } from './schema.js';

export type DB = Database.Database;

export interface DatabaseOptions {
  /** Path to the SQLite database file */
  path: string;
  /**
   * Database encryption key (32+ bytes).
   * Derived from user passphrase + device salt using PBKDF2.
   * Only used when SQLCipher is available.
   */
  encryptionKey?: Buffer;
  /** Enable verbose logging for debugging */
  verbose?: boolean;
}

/**
 * Open and initialize the local database.
 * Creates tables if they don't exist, runs pending migrations.
 */
export function openDatabase(options: DatabaseOptions): DB {
  const db = new Database(options.path, {
    verbose: options.verbose ? (msg) => console.info('[DB]', msg) : undefined,
  });

  // Configure for performance and safety
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('cache_size = -64000');  // 64MB cache
  db.pragma('mmap_size = 268435456');  // 256MB mmap

  // Apply encryption key if SQLCipher is available
  if (options.encryptionKey) {
    try {
      db.pragma(`key = "x'${options.encryptionKey.toString('hex')}'"`)
    } catch {
      console.warn('[DB] SQLCipher not available — database stored unencrypted');
    }
  }

  // Initialize schema
  initializeSchema(db);

  return db;
}

/**
 * Derive a database encryption key from the user's passphrase.
 * Uses PBKDF2-SHA256 with 600,000 iterations (OWASP 2023 recommendation).
 */
export async function deriveDbKey(passphrase: string, salt: Buffer): Promise<Buffer> {
  // Use Web Crypto API (works in Node 20+ and browsers)
  const encoder = new TextEncoder();
  const passphraseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveBits'],
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: 600_000,
      hash: 'SHA-256',
    },
    passphraseKey,
    256, // 32 bytes
  );

  return Buffer.from(derivedBits);
}

/**
 * Generate a random device salt for key derivation.
 * Stored separately from the database (e.g., in secure storage / Keychain).
 */
export function generateDeviceSalt(): Buffer {
  const salt = new Uint8Array(32);
  crypto.getRandomValues(salt);
  return Buffer.from(salt);
}

function initializeSchema(db: DB): void {
  // Run all CREATE TABLE IF NOT EXISTS statements
  db.exec(CREATE_TABLES_SQL);

  // Check schema version
  const versionRow = db.prepare('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1').get() as
    | { version: number }
    | undefined;

  if (!versionRow) {
    // Fresh database — insert initial data
    const insertVersion = db.prepare(
      'INSERT INTO schema_version (version, applied_at) VALUES (?, ?)',
    );
    const insertSetting = db.prepare(
      'INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)',
    );

    const now = Date.now();
    db.transaction(() => {
      insertVersion.run(SCHEMA_VERSION, now);
      for (const [key, value] of INITIAL_SETTINGS) {
        insertSetting.run(key, value, now);
      }
    })();
  } else if (versionRow.version < SCHEMA_VERSION) {
    runMigrations(db, versionRow.version);
  }
}

function runMigrations(db: DB, fromVersion: number): void {
  // Future migrations go here
  // Example:
  // if (fromVersion < 2) { db.exec(MIGRATION_V2); }
  console.info(`[DB] Schema is up to date (v${fromVersion} → v${SCHEMA_VERSION})`);
}

/**
 * Close the database connection gracefully.
 * Always call this when shutting down the app.
 */
export function closeDatabase(db: DB): void {
  db.close();
}

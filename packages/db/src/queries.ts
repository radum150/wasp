/**
 * Typed query functions for the WASP local database.
 *
 * All queries are prepared statements for performance and SQL injection prevention.
 * All functions operate synchronously (better-sqlite3 is synchronous).
 */

import { randomUUID } from 'crypto';
import type { DB } from './client.js';
import type {
  Message,
  Conversation,
  Contact,
  MessageContent,
  MessageStatus,
} from '@wasp/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function now(): number {
  return Date.now();
}

function uuid(): string {
  return randomUUID();
}

// ─── Identity ─────────────────────────────────────────────────────────────────

export interface LocalIdentityRow {
  userId: string;
  username: string;
  displayName: string;
  registrationId: number;
  identityPublicKey: string;
  identityPrivateKey: string;
  identityDhPublicKey: string;
  identityDhPrivateKey: string;
  signedPrekeyId: number;
  signedPrekeyPublic: string;
  signedPrekeyPrivate: string;
  signedPrekeySignature: string;
  signedPrekeyCreatedAt: number;
  nextOpkId: number;
}

export function getLocalIdentity(db: DB): LocalIdentityRow | undefined {
  return db
    .prepare(
      `SELECT
        user_id as userId, username, display_name as displayName,
        registration_id as registrationId,
        identity_public_key as identityPublicKey,
        identity_private_key as identityPrivateKey,
        identity_dh_public_key as identityDhPublicKey,
        identity_dh_private_key as identityDhPrivateKey,
        signed_prekey_id as signedPrekeyId,
        signed_prekey_public as signedPrekeyPublic,
        signed_prekey_private as signedPrekeyPrivate,
        signed_prekey_signature as signedPrekeySignature,
        signed_prekey_created_at as signedPrekeyCreatedAt,
        next_opk_id as nextOpkId
       FROM local_identity WHERE id = 1`,
    )
    .get() as LocalIdentityRow | undefined;
}

export function saveLocalIdentity(db: DB, identity: LocalIdentityRow): void {
  db.prepare(
    `INSERT OR REPLACE INTO local_identity (
      id, user_id, username, display_name, registration_id,
      identity_public_key, identity_private_key,
      identity_dh_public_key, identity_dh_private_key,
      signed_prekey_id, signed_prekey_public, signed_prekey_private,
      signed_prekey_signature, signed_prekey_created_at,
      next_opk_id, created_at, updated_at
    ) VALUES (
      1, ?, ?, ?, ?,
      ?, ?,
      ?, ?,
      ?, ?, ?,
      ?, ?,
      ?, ?, ?
    )`,
  ).run(
    identity.userId,
    identity.username,
    identity.displayName,
    identity.registrationId,
    identity.identityPublicKey,
    identity.identityPrivateKey,
    identity.identityDhPublicKey,
    identity.identityDhPrivateKey,
    identity.signedPrekeyId,
    identity.signedPrekeyPublic,
    identity.signedPrekeyPrivate,
    identity.signedPrekeySignature,
    identity.signedPrekeyCreatedAt,
    identity.nextOpkId,
    now(),
    now(),
  );
}

// ─── One-Time PreKeys ─────────────────────────────────────────────────────────

export interface OTPKRow {
  keyId: number;
  publicKey: string;
  privateKey: string;
  uploaded: boolean;
}

export function saveOneTimePreKeys(db: DB, keys: OTPKRow[]): void {
  const stmt = db.prepare(
    'INSERT OR IGNORE INTO one_time_prekeys (key_id, public_key, private_key, uploaded, created_at) VALUES (?, ?, ?, ?, ?)',
  );
  const ts = now();
  db.transaction(() => {
    for (const key of keys) {
      stmt.run(key.keyId, key.publicKey, key.privateKey, key.uploaded ? 1 : 0, ts);
    }
  })();
}

export function getUnuploadedOneTimePreKeys(db: DB): OTPKRow[] {
  return (
    db
      .prepare('SELECT key_id as keyId, public_key as publicKey, private_key as privateKey, uploaded FROM one_time_prekeys WHERE uploaded = 0')
      .all() as Array<{ keyId: number; publicKey: string; privateKey: string; uploaded: number }>
  ).map((row) => ({ ...row, uploaded: row.uploaded === 1 }));
}

export function markOneTimePreKeyUploaded(db: DB, keyId: number): void {
  db.prepare('UPDATE one_time_prekeys SET uploaded = 1 WHERE key_id = ?').run(keyId);
}

export function consumeOneTimePreKey(db: DB, keyId: number): OTPKRow | undefined {
  const row = db
    .prepare('SELECT key_id as keyId, public_key as publicKey, private_key as privateKey, uploaded FROM one_time_prekeys WHERE key_id = ?')
    .get(keyId) as { keyId: number; publicKey: string; privateKey: string; uploaded: number } | undefined;
  if (row) {
    db.prepare('DELETE FROM one_time_prekeys WHERE key_id = ?').run(keyId);
  }
  return row ? { ...row, uploaded: row.uploaded === 1 } : undefined;
}

export function countRemainingOneTimePreKeys(db: DB): number {
  const result = db.prepare('SELECT COUNT(*) as count FROM one_time_prekeys WHERE uploaded = 1').get() as { count: number };
  return result.count;
}

// ─── Contacts ─────────────────────────────────────────────────────────────────

export function upsertContact(db: DB, contact: Contact): void {
  db.prepare(
    `INSERT INTO contacts (
      id, username, display_name, phone_number, avatar_url, about,
      identity_public_key, identity_dh_public_key, registration_id,
      added_at, last_seen, is_online, is_blocked
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      display_name = excluded.display_name,
      avatar_url = excluded.avatar_url,
      about = excluded.about,
      last_seen = excluded.last_seen,
      is_online = excluded.is_online`,
  ).run(
    contact.id,
    contact.username,
    contact.displayName,
    contact.phoneNumber ?? null,
    contact.avatarUrl ?? null,
    contact.about ?? null,
    contact.identityPublicKey,
    '', // dh key — populated when we get their bundle
    null,
    contact.addedAt,
    contact.lastSeen ?? null,
    contact.isOnline ? 1 : 0,
    contact.isBlocked ? 1 : 0,
  );
}

export function getContact(db: DB, id: string): Contact | undefined {
  const row = db
    .prepare(
      `SELECT id, username, display_name as displayName, phone_number as phoneNumber,
              avatar_url as avatarUrl, about, identity_public_key as identityPublicKey,
              added_at as addedAt, last_seen as lastSeen,
              is_online as isOnline, is_blocked as isBlocked
       FROM contacts WHERE id = ?`,
    )
    .get(id) as
    | (Omit<Contact, 'isOnline' | 'isBlocked'> & { isOnline: number; isBlocked: number })
    | undefined;

  if (!row) return undefined;
  return { ...row, isOnline: row.isOnline === 1, isBlocked: row.isBlocked === 1 };
}

export function getAllContacts(db: DB): Contact[] {
  const rows = db
    .prepare(
      `SELECT id, username, display_name as displayName, phone_number as phoneNumber,
              avatar_url as avatarUrl, about, identity_public_key as identityPublicKey,
              added_at as addedAt, last_seen as lastSeen,
              is_online as isOnline, is_blocked as isBlocked
       FROM contacts WHERE is_blocked = 0 ORDER BY display_name ASC`,
    )
    .all() as Array<Omit<Contact, 'isOnline' | 'isBlocked'> & { isOnline: number; isBlocked: number }>;

  return rows.map((row) => ({ ...row, isOnline: row.isOnline === 1, isBlocked: row.isBlocked === 1 }));
}

export function updateContactPresence(db: DB, id: string, isOnline: boolean, lastSeen?: number): void {
  db.prepare('UPDATE contacts SET is_online = ?, last_seen = ? WHERE id = ?').run(
    isOnline ? 1 : 0,
    lastSeen ?? now(),
    id,
  );
}

// ─── Signal Sessions ──────────────────────────────────────────────────────────

export function saveSignalSession(db: DB, contactId: string, sessionData: string): string {
  const existing = db
    .prepare('SELECT id FROM signal_sessions WHERE contact_id = ?')
    .get(contactId) as { id: string } | undefined;

  if (existing) {
    db.prepare('UPDATE signal_sessions SET session_data = ?, updated_at = ? WHERE id = ?').run(
      sessionData,
      now(),
      existing.id,
    );
    return existing.id;
  } else {
    const id = uuid();
    db.prepare(
      'INSERT INTO signal_sessions (id, contact_id, session_data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    ).run(id, contactId, sessionData, now(), now());
    return id;
  }
}

export function getSignalSession(db: DB, contactId: string): string | undefined {
  const row = db
    .prepare('SELECT session_data as sessionData FROM signal_sessions WHERE contact_id = ?')
    .get(contactId) as { sessionData: string } | undefined;
  return row?.sessionData;
}

export function deleteSignalSession(db: DB, contactId: string): void {
  db.prepare('DELETE FROM signal_sessions WHERE contact_id = ?').run(contactId);
}

// ─── Conversations ────────────────────────────────────────────────────────────

export function getConversations(db: DB): Conversation[] {
  const rows = db
    .prepare(
      `SELECT id, type, name, avatar_url as avatarUrl, created_at as createdAt,
              last_message_at as lastMessageAt, last_message_preview as lastMessagePreview,
              unread_count as unreadCount, disappearing_ttl as disappearingMessagesTtl,
              is_muted as isMuted, is_pinned as isPinned, is_archived as isArchived
       FROM conversations
       WHERE is_archived = 0
       ORDER BY is_pinned DESC, last_message_at DESC`,
    )
    .all() as Array<Omit<Conversation, 'participantIds' | 'isMuted' | 'isPinned' | 'isArchived'> & {
      isMuted: number;
      isPinned: number;
      isArchived: number;
    }>;

  return rows.map((row) => ({
    ...row,
    participantIds: getConversationParticipants(db, row.id),
    isMuted: row.isMuted === 1,
    isPinned: row.isPinned === 1,
    isArchived: row.isArchived === 1,
  }));
}

export function getConversation(db: DB, id: string): Conversation | undefined {
  const row = db
    .prepare(
      `SELECT id, type, name, avatar_url as avatarUrl, created_at as createdAt,
              last_message_at as lastMessageAt, last_message_preview as lastMessagePreview,
              unread_count as unreadCount, disappearing_ttl as disappearingMessagesTtl,
              is_muted as isMuted, is_pinned as isPinned, is_archived as isArchived
       FROM conversations WHERE id = ?`,
    )
    .get(id) as
    | (Omit<Conversation, 'participantIds' | 'isMuted' | 'isPinned' | 'isArchived'> & {
        isMuted: number;
        isPinned: number;
        isArchived: number;
      })
    | undefined;

  if (!row) return undefined;
  return {
    ...row,
    participantIds: getConversationParticipants(db, id),
    isMuted: row.isMuted === 1,
    isPinned: row.isPinned === 1,
    isArchived: row.isArchived === 1,
  };
}

export function upsertConversation(db: DB, conversation: Conversation): void {
  db.prepare(
    `INSERT INTO conversations (
      id, type, name, avatar_url, created_at, last_message_at, last_message_preview,
      unread_count, disappearing_ttl, is_muted, is_pinned, is_archived
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      avatar_url = excluded.avatar_url,
      last_message_at = excluded.last_message_at,
      last_message_preview = excluded.last_message_preview,
      unread_count = excluded.unread_count`,
  ).run(
    conversation.id,
    conversation.type,
    conversation.name,
    conversation.avatarUrl ?? null,
    conversation.createdAt,
    conversation.lastMessageAt ?? null,
    conversation.lastMessagePreview ?? null,
    conversation.unreadCount,
    conversation.disappearingMessagesTtl ?? null,
    conversation.isMuted ? 1 : 0,
    conversation.isPinned ? 1 : 0,
    conversation.isArchived ? 1 : 0,
  );
}

export function updateConversationLastMessage(
  db: DB,
  conversationId: string,
  preview: string,
  timestamp: number,
): void {
  db.prepare(
    'UPDATE conversations SET last_message_at = ?, last_message_preview = ? WHERE id = ?',
  ).run(timestamp, preview, conversationId);
}

export function markConversationRead(db: DB, conversationId: string): void {
  db.prepare('UPDATE conversations SET unread_count = 0 WHERE id = ?').run(conversationId);
}

export function incrementUnreadCount(db: DB, conversationId: string): void {
  db.prepare('UPDATE conversations SET unread_count = unread_count + 1 WHERE id = ?').run(conversationId);
}

function getConversationParticipants(db: DB, conversationId: string): string[] {
  const rows = db
    .prepare('SELECT user_id as userId FROM conversation_participants WHERE conversation_id = ?')
    .all(conversationId) as Array<{ userId: string }>;
  return rows.map((r) => r.userId);
}

export function addConversationParticipant(
  db: DB,
  conversationId: string,
  userId: string,
  role: 'member' | 'admin' | 'owner' = 'member',
): void {
  db.prepare(
    `INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id, role, joined_at)
     VALUES (?, ?, ?, ?)`,
  ).run(conversationId, userId, role, now());
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export interface InsertMessageParams {
  id?: string;
  conversationId: string;
  senderId: string;
  senderDisplayName: string;
  type: Message['content']['type'];
  content?: MessageContent;
  mediaLocalPath?: string;
  mediaRemoteUrl?: string;
  mediaMimeType?: string;
  mediaSize?: number;
  replyToId?: string;
  status?: MessageStatus;
  serverMessageId?: string;
  expiresAt?: number;
  groupId?: string;
}

export function insertMessage(db: DB, params: InsertMessageParams): Message {
  const id = params.id ?? uuid();
  const ts = now();

  db.prepare(
    `INSERT INTO messages (
      id, conversation_id, sender_id, sender_display_name,
      type, content, media_local_path, media_remote_url, media_mime_type, media_size,
      reply_to_id, status, created_at, updated_at, server_message_id, expires_at, group_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    params.conversationId,
    params.senderId,
    params.senderDisplayName,
    params.type,
    params.content ? JSON.stringify(params.content) : null,
    params.mediaLocalPath ?? null,
    params.mediaRemoteUrl ?? null,
    params.mediaMimeType ?? null,
    params.mediaSize ?? null,
    params.replyToId ?? null,
    params.status ?? 'pending',
    ts,
    ts,
    params.serverMessageId ?? null,
    params.expiresAt ?? null,
    params.groupId ?? null,
  );

  return getMessageById(db, id)!;
}

export function getMessageById(db: DB, id: string): Message | undefined {
  const row = db
    .prepare(
      `SELECT id, conversation_id as conversationId, sender_id as senderId,
              sender_display_name as senderDisplayName,
              type, content, status, created_at as createdAt, updated_at as updatedAt,
              delivered_at as deliveredAt, read_at as readAt,
              is_deleted as isDeleted, is_forwarded as isForwarded,
              reply_to_id as replyToId, server_message_id as serverMessageId
       FROM messages WHERE id = ?`,
    )
    .get(id) as
    | (Omit<Message, 'content' | 'isDeleted' | 'isForwarded'> & {
        content: string | null;
        isDeleted: number;
        isForwarded: number;
      })
    | undefined;

  if (!row) return undefined;
  return normalizeMessage(row);
}

export function getMessages(
  db: DB,
  conversationId: string,
  options: { limit?: number; before?: number } = {},
): Message[] {
  const { limit = 50, before } = options;
  const query = before
    ? `SELECT id, conversation_id as conversationId, sender_id as senderId,
              sender_display_name as senderDisplayName,
              type, content, status, created_at as createdAt, updated_at as updatedAt,
              delivered_at as deliveredAt, read_at as readAt,
              is_deleted as isDeleted, is_forwarded as isForwarded,
              reply_to_id as replyToId, server_message_id as serverMessageId
       FROM messages WHERE conversation_id = ? AND created_at < ? AND is_deleted = 0
       ORDER BY created_at DESC LIMIT ?`
    : `SELECT id, conversation_id as conversationId, sender_id as senderId,
              sender_display_name as senderDisplayName,
              type, content, status, created_at as createdAt, updated_at as updatedAt,
              delivered_at as deliveredAt, read_at as readAt,
              is_deleted as isDeleted, is_forwarded as isForwarded,
              reply_to_id as replyToId, server_message_id as serverMessageId
       FROM messages WHERE conversation_id = ? AND is_deleted = 0
       ORDER BY created_at DESC LIMIT ?`;

  const params = before ? [conversationId, before, limit] : [conversationId, limit];
  const rows = db.prepare(query).all(...params) as Array<
    Omit<Message, 'content' | 'isDeleted' | 'isForwarded'> & {
      content: string | null;
      isDeleted: number;
      isForwarded: number;
    }
  >;

  return rows.map(normalizeMessage).reverse(); // oldest first for display
}

export function updateMessageStatus(
  db: DB,
  messageId: string,
  status: MessageStatus,
  timestamp?: number,
): void {
  const ts = timestamp ?? now();
  if (status === 'delivered') {
    db.prepare(
      'UPDATE messages SET status = ?, delivered_at = ?, updated_at = ? WHERE id = ?',
    ).run(status, ts, ts, messageId);
  } else if (status === 'read') {
    db.prepare(
      'UPDATE messages SET status = ?, read_at = ?, updated_at = ? WHERE id = ?',
    ).run(status, ts, ts, messageId);
  } else {
    db.prepare('UPDATE messages SET status = ?, updated_at = ? WHERE id = ?').run(
      status,
      ts,
      messageId,
    );
  }
}

export function softDeleteMessage(db: DB, messageId: string): void {
  db.prepare(
    `UPDATE messages SET is_deleted = 1, content = NULL, type = 'deleted', updated_at = ? WHERE id = ?`,
  ).run(now(), messageId);
}

export function updateMessageByServerId(
  db: DB,
  serverMessageId: string,
  status: MessageStatus,
): void {
  db.prepare('UPDATE messages SET status = ?, updated_at = ? WHERE server_message_id = ?').run(
    status,
    now(),
    serverMessageId,
  );
}

export function deleteExpiredMessages(db: DB): number {
  const result = db
    .prepare(
      `UPDATE messages SET is_deleted = 1, content = NULL, type = 'deleted'
       WHERE expires_at IS NOT NULL AND expires_at < ? AND is_deleted = 0`,
    )
    .run(now());
  return result.changes;
}

function normalizeMessage(
  row: Omit<Message, 'content' | 'isDeleted'> & { content: string | null; isDeleted: number },
): Message {
  const content = row.content ? (JSON.parse(row.content) as MessageContent) : { type: 'deleted' as const, timestamp: row.createdAt };
  return {
    ...row,
    content,
    isDeleted: row.isDeleted === 1,
  };
}

// ─── Pending Outbound Messages ────────────────────────────────────────────────

export interface PendingOutbound {
  id: string;
  messageId: string;
  recipientId: string;
  envelope: string;
  attempts: number;
}

export function queueOutboundMessage(
  db: DB,
  messageId: string,
  recipientId: string,
  envelope: string,
): void {
  db.prepare(
    'INSERT OR IGNORE INTO pending_outbound (id, message_id, recipient_id, envelope, attempts, created_at) VALUES (?, ?, ?, ?, 0, ?)',
  ).run(uuid(), messageId, recipientId, envelope, now());
}

export function getPendingOutboundMessages(db: DB): PendingOutbound[] {
  return db
    .prepare(
      'SELECT id, message_id as messageId, recipient_id as recipientId, envelope, attempts FROM pending_outbound ORDER BY created_at ASC',
    )
    .all() as PendingOutbound[];
}

export function incrementPendingAttempts(db: DB, id: string): void {
  db.prepare('UPDATE pending_outbound SET attempts = attempts + 1, last_attempt_at = ? WHERE id = ?').run(now(), id);
}

export function deletePendingOutbound(db: DB, id: string): void {
  db.prepare('DELETE FROM pending_outbound WHERE id = ?').run(id);
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export function getSetting(db: DB, key: string): string | undefined {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

export function setSetting(db: DB, key: string, value: string): void {
  db.prepare(
    'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)',
  ).run(key, value, now());
}

export function getAllSettings(db: DB): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{
    key: string;
    value: string;
  }>;
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

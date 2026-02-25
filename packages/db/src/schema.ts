/**
 * SQLite schema for WASP local database.
 *
 * ALL message content is stored locally on the user's device.
 * The schema is designed for:
 * 1. Fast message retrieval (indexed by conversation + time)
 * 2. Signal Protocol session state storage
 * 3. Contact management
 * 4. Media tracking (local paths + remote encrypted URLs)
 *
 * The database is encrypted at rest using better-sqlite3 with SQLCipher
 * (or the WAL-mode AES encryption extension on platforms where SQLCipher
 * is unavailable).
 */

export const SCHEMA_VERSION = 1;

export const CREATE_TABLES_SQL = `
  -- ─── Schema Versioning ──────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER NOT NULL,
    applied_at INTEGER NOT NULL
  );

  -- ─── Local Device Identity ───────────────────────────────────────────────────
  -- Stores the current user's identity keys. Only one row ever exists.
  CREATE TABLE IF NOT EXISTS local_identity (
    id INTEGER PRIMARY KEY CHECK (id = 1),  -- enforce single row
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    display_name TEXT NOT NULL,
    registration_id INTEGER NOT NULL,
    -- Ed25519 identity key pair (hex-encoded, stored encrypted at rest)
    identity_public_key TEXT NOT NULL,
    identity_private_key TEXT NOT NULL,
    -- X25519 DH key pair
    identity_dh_public_key TEXT NOT NULL,
    identity_dh_private_key TEXT NOT NULL,
    -- Current signed prekey
    signed_prekey_id INTEGER NOT NULL,
    signed_prekey_public TEXT NOT NULL,
    signed_prekey_private TEXT NOT NULL,
    signed_prekey_signature TEXT NOT NULL,
    signed_prekey_created_at INTEGER NOT NULL,
    -- Next OPK key ID to use
    next_opk_id INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  -- ─── One-Time PreKeys (unused, local storage) ────────────────────────────────
  -- Keys that have been generated but not yet consumed by a session.
  CREATE TABLE IF NOT EXISTS one_time_prekeys (
    key_id INTEGER PRIMARY KEY,
    public_key TEXT NOT NULL,
    private_key TEXT NOT NULL,
    uploaded INTEGER NOT NULL DEFAULT 0,  -- 1 if uploaded to server
    created_at INTEGER NOT NULL
  );

  -- ─── Contacts ────────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,  -- remote user ID
    username TEXT NOT NULL,
    display_name TEXT NOT NULL,
    phone_number TEXT,
    avatar_url TEXT,
    about TEXT,
    -- Their identity signing public key (for verification)
    identity_public_key TEXT NOT NULL,
    -- Their identity DH public key
    identity_dh_public_key TEXT NOT NULL,
    registration_id INTEGER,
    added_at INTEGER NOT NULL,
    last_seen INTEGER,
    is_online INTEGER NOT NULL DEFAULT 0,
    is_blocked INTEGER NOT NULL DEFAULT 0,
    is_verified INTEGER NOT NULL DEFAULT 0  -- user has manually verified safety number
  );
  CREATE INDEX IF NOT EXISTS idx_contacts_username ON contacts(username);

  -- ─── Signal Protocol Sessions ────────────────────────────────────────────────
  -- One session per contact per device.
  CREATE TABLE IF NOT EXISTS signal_sessions (
    id TEXT PRIMARY KEY,
    contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    -- Serialized Double Ratchet state (JSON, encrypted at rest)
    session_data TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_contact ON signal_sessions(contact_id);

  -- ─── Conversations ───────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('direct', 'group')),
    name TEXT NOT NULL,
    avatar_url TEXT,
    created_at INTEGER NOT NULL,
    last_message_at INTEGER,
    last_message_preview TEXT,  -- Short preview of last message (NOT encrypted)
    unread_count INTEGER NOT NULL DEFAULT 0,
    disappearing_ttl INTEGER,  -- seconds, NULL = no disappearing messages
    is_muted INTEGER NOT NULL DEFAULT 0,
    is_pinned INTEGER NOT NULL DEFAULT 0,
    is_archived INTEGER NOT NULL DEFAULT 0,
    -- For group conversations
    group_description TEXT,
    group_created_by TEXT,
    group_admin_ids TEXT,  -- JSON array of user IDs
    group_invite_link TEXT,
    group_max_participants INTEGER DEFAULT 256
  );
  CREATE INDEX IF NOT EXISTS idx_conversations_last_msg ON conversations(last_message_at DESC);

  -- ─── Conversation Participants ───────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS conversation_participants (
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    display_name TEXT,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin', 'owner')),
    joined_at INTEGER NOT NULL,
    PRIMARY KEY (conversation_id, user_id)
  );

  -- ─── Messages ────────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id TEXT NOT NULL,
    sender_display_name TEXT NOT NULL,
    -- Message type
    type TEXT NOT NULL CHECK (type IN (
      'text', 'image', 'video', 'audio', 'document', 'voice_note',
      'sticker', 'location', 'contact_card', 'reaction', 'deleted', 'system'
    )),
    -- Plaintext content (stored locally, decrypted)
    -- For text: the message text
    -- For media: JSON with metadata
    -- For reactions: JSON {emoji, targetMessageId}
    content TEXT,
    -- For media messages
    media_local_path TEXT,  -- path on device
    media_remote_url TEXT,  -- temporary server URL
    media_mime_type TEXT,
    media_size INTEGER,
    media_width INTEGER,
    media_height INTEGER,
    media_duration INTEGER,
    media_thumbnail TEXT,  -- base64 encoded thumbnail
    -- For replies
    reply_to_id TEXT REFERENCES messages(id),
    -- Metadata
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    delivered_at INTEGER,
    read_at INTEGER,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    is_forwarded INTEGER NOT NULL DEFAULT 0,
    is_starred INTEGER NOT NULL DEFAULT 0,
    expires_at INTEGER,  -- for disappearing messages
    -- Server message ID (for receipt correlation)
    server_message_id TEXT,
    -- Group message: intended group ID
    group_id TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_messages_conv_time ON messages(conversation_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status) WHERE status IN ('pending', 'sent');
  CREATE INDEX IF NOT EXISTS idx_messages_expiry ON messages(expires_at) WHERE expires_at IS NOT NULL;

  -- ─── Message Reactions ───────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS message_reactions (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    emoji TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(message_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_reactions_message ON message_reactions(message_id);

  -- ─── Statuses / Stories ──────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS statuses (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    user_display_name TEXT NOT NULL,
    user_avatar_url TEXT,
    type TEXT NOT NULL CHECK (type IN ('text', 'image', 'video')),
    text_content TEXT,
    background_color TEXT,
    media_url TEXT,
    media_local_path TEXT,
    media_thumbnail TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,  -- created_at + 24 hours
    viewed_by TEXT NOT NULL DEFAULT '[]'  -- JSON array of user IDs
  );
  CREATE INDEX IF NOT EXISTS idx_statuses_expires ON statuses(expires_at);
  CREATE INDEX IF NOT EXISTS idx_statuses_user ON statuses(user_id);

  -- ─── Call History ────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS call_history (
    id TEXT PRIMARY KEY,
    conversation_id TEXT REFERENCES conversations(id),
    type TEXT NOT NULL CHECK (type IN ('audio', 'video')),
    state TEXT NOT NULL CHECK (state IN ('missed', 'declined', 'ended', 'incoming', 'outgoing')),
    initiator_id TEXT NOT NULL,
    participant_ids TEXT NOT NULL,  -- JSON array
    started_at INTEGER,
    ended_at INTEGER,
    duration INTEGER  -- seconds
  );
  CREATE INDEX IF NOT EXISTS idx_calls_conv ON call_history(conversation_id, started_at DESC);

  -- ─── Pending Outbound Messages ───────────────────────────────────────────────
  -- Messages queued for delivery when connectivity is restored.
  CREATE TABLE IF NOT EXISTS pending_outbound (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL REFERENCES messages(id),
    recipient_id TEXT NOT NULL,
    -- The serialized envelope (JSON, already encrypted) ready to send
    envelope TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_attempt_at INTEGER,
    created_at INTEGER NOT NULL
  );

  -- ─── App Settings ────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
`;

export const INITIAL_SETTINGS = [
  ['theme', 'system'],
  ['notification_sound', '1'],
  ['notification_preview', '1'],
  ['read_receipts', '1'],
  ['last_seen_privacy', 'contacts'],  // 'everyone' | 'contacts' | 'nobody'
  ['online_privacy', '1'],
  ['disappearing_messages_default', '0'],  // seconds, 0 = off
  ['auto_download_wifi', 'image,audio,document'],
  ['auto_download_cellular', 'image'],
  ['backup_enabled', '0'],
] as const;

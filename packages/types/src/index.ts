// ─── User & Auth ──────────────────────────────────────────────────────────────

export interface User {
  id: string;
  username: string;
  displayName: string;
  phoneNumber?: string;
  avatarUrl?: string;
  createdAt: number;
  lastSeen?: number;
  isOnline: boolean;
}

export interface UserProfile extends User {
  about?: string;
}

export interface AuthCredentials {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  password: string;
  displayName: string;
  phoneNumber?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthResponse {
  user: User;
  tokens: AuthTokens;
}

// ─── Signal Protocol Key Types ────────────────────────────────────────────────

/**
 * A key pair in the Signal Protocol.
 * Public key is always safe to share; private key must never leave the device.
 */
export interface KeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

/**
 * Identity key pair — long-lived, represents the user's cryptographic identity.
 */
export interface IdentityKeyPair extends KeyPair {
  registrationId: number;
}

/**
 * Signed PreKey — medium-term DH key signed with the identity key.
 */
export interface SignedPreKey {
  keyId: number;
  publicKey: Uint8Array;
  signature: Uint8Array;
  createdAt: number;
}

export interface SignedPreKeyPair extends SignedPreKey {
  privateKey: Uint8Array;
}

/**
 * One-Time PreKey — single-use DH key for enhanced forward secrecy.
 */
export interface OneTimePreKey {
  keyId: number;
  publicKey: Uint8Array;
}

export interface OneTimePreKeyPair extends OneTimePreKey {
  privateKey: Uint8Array;
}

/**
 * PreKey Bundle — everything needed to initiate a session with a user.
 * Fetched from the server during X3DH.
 */
export interface PreKeyBundle {
  userId: string;
  registrationId: number;
  identityKey: Uint8Array;
  signedPreKey: SignedPreKey;
  oneTimePreKey?: OneTimePreKey;
}

/**
 * What Alice sends to the server after X3DH to allow Bob to complete session init.
 */
export interface X3DHInitMessage {
  /** Alice's ephemeral public key */
  ephemeralKey: Uint8Array;
  /** Which one-time prekey was used (so Bob can mark it as consumed) */
  usedOneTimePreKeyId?: number;
  /** Alice's identity public key */
  identityKey: Uint8Array;
  /** The initial encrypted message ciphertext */
  ciphertext: EncryptedMessage;
}

// ─── Encryption / Messages ────────────────────────────────────────────────────

export type MessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'voice_note'
  | 'sticker'
  | 'location'
  | 'contact_card'
  | 'reaction'
  | 'deleted';

export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface EncryptedMessage {
  /** Double-Ratchet ciphertext */
  body: Uint8Array;
  /** Message type indicator (0 = normal, 1 = pre-key message) */
  type: 0 | 1;
  /** Sender ratchet public key (for Double Ratchet) */
  ratchetKey?: Uint8Array;
  /** Sending chain counter */
  counter: number;
  /** Previous chain counter */
  previousCounter: number;
}

/**
 * The plaintext content of a message, before/after encryption.
 * Serialized as JSON, then encrypted.
 */
export interface MessageContent {
  type: MessageType;
  text?: string;
  /** For media messages: encrypted media key + attachment metadata */
  media?: MediaAttachment;
  /** For reactions: the emoji and the target message ID */
  reaction?: { emoji: string; targetMessageId: string };
  /** For replies: the original message reference */
  replyTo?: { messageId: string; senderDisplayName: string; previewText: string };
  /** For forwarded messages */
  forwarded?: boolean;
  /** Ephemeral TTL in seconds (for disappearing messages) */
  ttl?: number;
  /** Timestamp from sender (milliseconds since epoch) */
  timestamp: number;
}

export interface MediaAttachment {
  /** The filename */
  name: string;
  /** MIME type */
  mimeType: string;
  /** File size in bytes */
  size: number;
  /** Width/height for images and video */
  dimensions?: { width: number; height: number };
  /** Duration in seconds for audio/video */
  duration?: number;
  /**
   * Encrypted media key (32 bytes), encrypted separately from the message.
   * The server never sees the plaintext media or media key.
   */
  encryptedKey: Uint8Array;
  /** SHA-256 hash of the encrypted media file for integrity verification */
  digest: Uint8Array;
  /** Temporary URL for fetching the encrypted media blob from the relay */
  url: string;
  /** Thumbnail (inline base64, blurred) */
  thumbnailBase64?: string;
}

// ─── Local Message Model ──────────────────────────────────────────────────────

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderDisplayName: string;
  content: MessageContent;
  status: MessageStatus;
  createdAt: number;
  updatedAt: number;
  deliveredAt?: number;
  readAt?: number;
  isDeleted: boolean;
  /** Set on group messages to indicate intended recipient group */
  groupId?: string;
}

// ─── Conversations ────────────────────────────────────────────────────────────

export type ConversationType = 'direct' | 'group';

export interface Conversation {
  id: string;
  type: ConversationType;
  /** For groups: the group name. For DMs: the contact's displayName */
  name: string;
  /** For groups: custom avatar. For DMs: contact's avatar */
  avatarUrl?: string;
  createdAt: number;
  lastMessageAt?: number;
  lastMessagePreview?: string;
  unreadCount: number;
  /** Participant user IDs */
  participantIds: string[];
  /** For groups only */
  group?: GroupInfo;
  /** Whether messages disappear */
  disappearingMessagesTtl?: number;
  isMuted: boolean;
  isPinned: boolean;
  isArchived: boolean;
}

export interface GroupInfo {
  id: string;
  name: string;
  description?: string;
  avatarUrl?: string;
  createdBy: string;
  createdAt: number;
  adminIds: string[];
  maxParticipants: number;
  inviteLink?: string;
}

// ─── Contacts ─────────────────────────────────────────────────────────────────

export interface Contact {
  id: string;
  username: string;
  displayName: string;
  phoneNumber?: string;
  avatarUrl?: string;
  about?: string;
  /** Their identity public key (hex) */
  identityPublicKey: string;
  addedAt: number;
  lastSeen?: number;
  isOnline: boolean;
  isBlocked: boolean;
}

// ─── WebSocket Protocol ───────────────────────────────────────────────────────

export type WSMessageType =
  | 'auth'
  | 'auth_ok'
  | 'auth_error'
  | 'message'
  | 'message_ack'
  | 'delivery_receipt'
  | 'read_receipt'
  | 'presence'
  | 'typing'
  | 'call_offer'
  | 'call_answer'
  | 'call_ice_candidate'
  | 'call_hangup'
  | 'prekey_refill_needed'
  | 'error';

export interface WSMessage<T = unknown> {
  type: WSMessageType;
  id: string;
  payload: T;
  timestamp: number;
}

export interface WSAuthPayload {
  token: string;
}

export interface WSRelayPayload {
  /** Recipient user ID */
  to: string;
  /**
   * Opaque encrypted envelope. The server reads ONLY `to` and routes accordingly.
   * The `envelope` is base64-encoded and the server never inspects it.
   */
  envelope: string;
  /** Message ID generated by sender */
  messageId: string;
}

export interface WSAckPayload {
  messageId: string;
  status: 'delivered' | 'failed';
  reason?: string;
}

export interface WSDeliveryReceiptPayload {
  messageId: string;
  from: string;
  deliveredAt: number;
}

export interface WSReadReceiptPayload {
  messageIds: string[];
  from: string;
  readAt: number;
}

export interface WSPresencePayload {
  userId: string;
  isOnline: boolean;
  lastSeen?: number;
}

export interface WSTypingPayload {
  conversationId: string;
  userId: string;
  isTyping: boolean;
}

export interface WSCallPayload {
  callId: string;
  from: string;
  to: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  callType?: 'audio' | 'video';
}

// ─── API Endpoints ────────────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

export interface UploadPreKeysRequest {
  oneTimePreKeys: OneTimePreKey[];
}

export interface UpdateSignedPreKeyRequest {
  signedPreKey: SignedPreKey;
}

export interface SearchUsersResponse {
  users: User[];
}

export interface GetPreKeyBundleResponse {
  bundle: PreKeyBundle;
}

// ─── Status / Stories ─────────────────────────────────────────────────────────

export interface Status {
  id: string;
  userId: string;
  userDisplayName: string;
  userAvatarUrl?: string;
  content: StatusContent;
  createdAt: number;
  expiresAt: number;
  /** IDs of contacts who viewed this status */
  viewedBy: string[];
}

export interface StatusContent {
  type: 'text' | 'image' | 'video';
  text?: string;
  backgroundColor?: string;
  fontStyle?: string;
  mediaUrl?: string;
  mediaThumbnailBase64?: string;
}

// ─── Calls ────────────────────────────────────────────────────────────────────

export type CallState = 'ringing' | 'connecting' | 'active' | 'ended' | 'missed' | 'declined';
export type CallType = 'audio' | 'video';

export interface Call {
  id: string;
  type: CallType;
  state: CallState;
  initiatorId: string;
  participantIds: string[];
  startedAt?: number;
  endedAt?: number;
  duration?: number;
}

// ─── Device / Multi-Device ────────────────────────────────────────────────────

export interface Device {
  id: string;
  userId: string;
  name: string;
  platform: 'web' | 'ios' | 'android' | 'desktop';
  registrationId: number;
  identityPublicKey: string;
  linkedAt: number;
  lastActiveAt?: number;
}

export interface QRLinkingPayload {
  userId: string;
  deviceId: string;
  identityPublicKey: string;
  ephemeralPublicKey: string;
  timestamp: number;
}

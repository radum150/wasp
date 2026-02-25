import type { Conversation, Message, Contact } from '@wasp/types';
import { useChatStore } from '../store/chat';

const NOW = Date.now();
const ago = (minutes: number) => NOW - minutes * 60 * 1000;

// ─── Contacts ─────────────────────────────────────────────────────────────────

export const MOCK_CONTACTS: Contact[] = [
  {
    id: 'user-alice',
    username: 'alice',
    displayName: 'Alice Chen',
    avatarUrl: undefined,
    about: 'Product designer 🎨',
    identityPublicKey: 'a'.repeat(64),
    addedAt: ago(10000),
    lastSeen: ago(5),
    isOnline: true,
    isBlocked: false,
  },
  {
    id: 'user-bob',
    username: 'bob',
    displayName: 'Bob Martinez',
    avatarUrl: undefined,
    about: 'Just vibing 🎸',
    identityPublicKey: 'b'.repeat(64),
    addedAt: ago(8000),
    lastSeen: ago(120),
    isOnline: false,
    isBlocked: false,
  },
  {
    id: 'user-carol',
    username: 'carol',
    displayName: 'Carol White',
    avatarUrl: undefined,
    about: 'Engineer @ WASP',
    identityPublicKey: 'c'.repeat(64),
    addedAt: ago(5000),
    lastSeen: ago(2),
    isOnline: true,
    isBlocked: false,
  },
  {
    id: 'user-dan',
    username: 'dan',
    displayName: 'Dan Kim',
    avatarUrl: undefined,
    about: '☕ coffee & code',
    identityPublicKey: 'd'.repeat(64),
    addedAt: ago(3000),
    lastSeen: ago(1440),
    isOnline: false,
    isBlocked: false,
  },
];

// ─── Conversations ────────────────────────────────────────────────────────────

export const MOCK_CONVERSATIONS: Conversation[] = [
  {
    id: 'conv-alice',
    type: 'direct',
    name: 'Alice Chen',
    participantIds: ['__me__', 'user-alice'],
    createdAt: ago(10000),
    lastMessageAt: ago(3),
    lastMessagePreview: 'Can you review the new design?',
    unreadCount: 2,
    isMuted: false,
    isPinned: true,
    isArchived: false,
  },
  {
    id: 'conv-bob',
    type: 'direct',
    name: 'Bob Martinez',
    participantIds: ['__me__', 'user-bob'],
    createdAt: ago(8000),
    lastMessageAt: ago(47),
    lastMessagePreview: 'See you at the standup 👋',
    unreadCount: 0,
    isMuted: false,
    isPinned: false,
    isArchived: false,
  },
  {
    id: 'conv-group',
    type: 'group',
    name: 'WASP Dev Team 🐝',
    participantIds: ['__me__', 'user-alice', 'user-carol', 'user-dan'],
    createdAt: ago(5000),
    lastMessageAt: ago(12),
    lastMessagePreview: 'Carol: Just pushed the fix 🚀',
    unreadCount: 5,
    isMuted: false,
    isPinned: false,
    isArchived: false,
    group: {
      id: 'group-dev',
      name: 'WASP Dev Team 🐝',
      description: 'Building the future of private messaging',
      createdBy: 'user-carol',
      createdAt: ago(5000),
      adminIds: ['user-carol'],
      maxParticipants: 256,
    },
  },
  {
    id: 'conv-carol',
    type: 'direct',
    name: 'Carol White',
    participantIds: ['__me__', 'user-carol'],
    createdAt: ago(3000),
    lastMessageAt: ago(90),
    lastMessagePreview: 'The encryption tests are all green ✅',
    unreadCount: 0,
    isMuted: false,
    isPinned: false,
    isArchived: false,
  },
  {
    id: 'conv-dan',
    type: 'direct',
    name: 'Dan Kim',
    participantIds: ['__me__', 'user-dan'],
    createdAt: ago(2000),
    lastMessageAt: ago(1500),
    lastMessagePreview: 'Let me know when you\'re free',
    unreadCount: 0,
    isMuted: true,
    isPinned: false,
    isArchived: false,
  },
];

// ─── Messages ─────────────────────────────────────────────────────────────────

export const MOCK_MESSAGES: Record<string, Message[]> = {
  'conv-alice': [
    {
      id: 'msg-a1',
      conversationId: 'conv-alice',
      senderId: 'user-alice',
      senderDisplayName: 'Alice Chen',
      content: { type: 'text', text: 'Hey! How\'s the Signal Protocol implementation going?', timestamp: ago(120) },
      status: 'read',
      createdAt: ago(120),
      updatedAt: ago(120),
      isDeleted: false,
    },
    {
      id: 'msg-a2',
      conversationId: 'conv-alice',
      senderId: '__me__',
      senderDisplayName: 'Me',
      content: { type: 'text', text: 'Really well! X3DH and Double Ratchet are both working. Tests are passing 🎉', timestamp: ago(118) },
      status: 'read',
      createdAt: ago(118),
      updatedAt: ago(118),
      isDeleted: false,
    },
    {
      id: 'msg-a3',
      conversationId: 'conv-alice',
      senderId: 'user-alice',
      senderDisplayName: 'Alice Chen',
      content: { type: 'text', text: 'That\'s awesome! Forward secrecy and break-in recovery both solid?', timestamp: ago(115) },
      status: 'read',
      createdAt: ago(115),
      updatedAt: ago(115),
      isDeleted: false,
    },
    {
      id: 'msg-a4',
      conversationId: 'conv-alice',
      senderId: '__me__',
      senderDisplayName: 'Me',
      content: { type: 'text', text: 'Yep, out-of-order messages work too. The skipped key cache handles up to 1000 messages 😄', timestamp: ago(110) },
      status: 'read',
      createdAt: ago(110),
      updatedAt: ago(110),
      isDeleted: false,
    },
    {
      id: 'msg-a5',
      conversationId: 'conv-alice',
      senderId: 'user-alice',
      senderDisplayName: 'Alice Chen',
      content: { type: 'text', text: 'Can you review the new design?', timestamp: ago(3) },
      status: 'delivered',
      createdAt: ago(3),
      updatedAt: ago(3),
      isDeleted: false,
    },
    {
      id: 'msg-a6',
      conversationId: 'conv-alice',
      senderId: 'user-alice',
      senderDisplayName: 'Alice Chen',
      content: { type: 'text', text: 'I redesigned the chat bubbles and the sidebar hover state 👀', timestamp: ago(2) },
      status: 'delivered',
      createdAt: ago(2),
      updatedAt: ago(2),
      isDeleted: false,
    },
  ],

  'conv-bob': [
    {
      id: 'msg-b1',
      conversationId: 'conv-bob',
      senderId: '__me__',
      senderDisplayName: 'Me',
      content: { type: 'text', text: 'Hey Bob, are you joining the standup today?', timestamp: ago(60) },
      status: 'read',
      createdAt: ago(60),
      updatedAt: ago(60),
      isDeleted: false,
    },
    {
      id: 'msg-b2',
      conversationId: 'conv-bob',
      senderId: 'user-bob',
      senderDisplayName: 'Bob Martinez',
      content: { type: 'text', text: 'Yeah, will be there in 5', timestamp: ago(55) },
      status: 'read',
      createdAt: ago(55),
      updatedAt: ago(55),
      isDeleted: false,
    },
    {
      id: 'msg-b3',
      conversationId: 'conv-bob',
      senderId: 'user-bob',
      senderDisplayName: 'Bob Martinez',
      content: { type: 'text', text: 'See you at the standup 👋', timestamp: ago(47) },
      status: 'read',
      createdAt: ago(47),
      updatedAt: ago(47),
      isDeleted: false,
    },
  ],

  'conv-group': [
    {
      id: 'msg-g1',
      conversationId: 'conv-group',
      senderId: 'user-carol',
      senderDisplayName: 'Carol White',
      content: { type: 'text', text: 'Morning everyone! Sprint planning in 30 mins', timestamp: ago(480) },
      status: 'read',
      createdAt: ago(480),
      updatedAt: ago(480),
      isDeleted: false,
    },
    {
      id: 'msg-g2',
      conversationId: 'conv-group',
      senderId: 'user-alice',
      senderDisplayName: 'Alice Chen',
      content: { type: 'text', text: '👍', timestamp: ago(475) },
      status: 'read',
      createdAt: ago(475),
      updatedAt: ago(475),
      isDeleted: false,
    },
    {
      id: 'msg-g3',
      conversationId: 'conv-group',
      senderId: '__me__',
      senderDisplayName: 'Me',
      content: { type: 'text', text: 'On it, almost done with the relay refactor', timestamp: ago(470) },
      status: 'read',
      createdAt: ago(470),
      updatedAt: ago(470),
      isDeleted: false,
    },
    {
      id: 'msg-g4',
      conversationId: 'conv-group',
      senderId: 'user-dan',
      senderDisplayName: 'Dan Kim',
      content: { type: 'text', text: 'I found a bug in the prekey upload logic, PR incoming', timestamp: ago(35) },
      status: 'delivered',
      createdAt: ago(35),
      updatedAt: ago(35),
      isDeleted: false,
    },
    {
      id: 'msg-g5',
      conversationId: 'conv-group',
      senderId: 'user-carol',
      senderDisplayName: 'Carol White',
      content: { type: 'text', text: 'Just pushed the fix 🚀', timestamp: ago(12) },
      status: 'delivered',
      createdAt: ago(12),
      updatedAt: ago(12),
      isDeleted: false,
    },
  ],

  'conv-carol': [
    {
      id: 'msg-c1',
      conversationId: 'conv-carol',
      senderId: '__me__',
      senderDisplayName: 'Me',
      content: { type: 'text', text: 'Carol, can you run the full crypto test suite?', timestamp: ago(100) },
      status: 'read',
      createdAt: ago(100),
      updatedAt: ago(100),
      isDeleted: false,
    },
    {
      id: 'msg-c2',
      conversationId: 'conv-carol',
      senderId: 'user-carol',
      senderDisplayName: 'Carol White',
      content: { type: 'text', text: 'The encryption tests are all green ✅', timestamp: ago(90) },
      status: 'read',
      createdAt: ago(90),
      updatedAt: ago(90),
      isDeleted: false,
    },
  ],
};

// ─── Seed function ────────────────────────────────────────────────────────────

export function seedMockData(currentUserId: string): void {
  const store = useChatStore.getState();

  // Replace __me__ placeholder with real user ID
  const conversations = MOCK_CONVERSATIONS.map((c) => ({
    ...c,
    participantIds: c.participantIds.map((id) => (id === '__me__' ? currentUserId : id)),
  }));

  const messages: Record<string, Message[]> = {};
  for (const [convId, msgs] of Object.entries(MOCK_MESSAGES)) {
    messages[convId] = msgs.map((m) => ({
      ...m,
      senderId: m.senderId === '__me__' ? currentUserId : m.senderId,
    }));
  }

  store.setConversations(conversations);
  store.setContacts(MOCK_CONTACTS);

  for (const [convId, msgs] of Object.entries(messages)) {
    store.setMessages(convId, msgs);
  }

  // Set presence
  store.setPresence('user-alice', true);
  store.setPresence('user-carol', true);
  store.setPresence('user-bob', false, ago(120));
  store.setPresence('user-dan', false, ago(1440));
}

export function clearMockData(): void {
  const store = useChatStore.getState();
  store.setConversations([]);
  store.setContacts([]);
}

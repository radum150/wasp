/**
 * Chat store — manages conversations, messages, contacts, and presence.
 * All data here is local (decrypted). Encrypted versions only exist in transit.
 */

import { create } from 'zustand';
import type { Conversation, Message, Contact, MessageStatus } from '@wasp/types';

interface TypingState {
  [conversationId: string]: {
    [userId: string]: boolean;
  };
}

interface ChatState {
  conversations: Conversation[];
  messages: Record<string, Message[]>; // conversationId → messages
  contacts: Contact[];
  presence: Record<string, { isOnline: boolean; lastSeen?: number }>;
  typing: TypingState;
  activeConversationId: string | null;

  // Conversations
  setConversations: (conversations: Conversation[]) => void;
  upsertConversation: (conversation: Conversation) => void;
  markConversationRead: (conversationId: string) => void;
  setActiveConversation: (id: string | null) => void;

  // Messages
  setMessages: (conversationId: string, messages: Message[]) => void;
  prependMessages: (conversationId: string, messages: Message[]) => void;
  appendMessage: (conversationId: string, message: Message) => void;
  updateMessageStatus: (messageId: string, status: MessageStatus, timestamp?: number) => void;
  deleteMessage: (messageId: string, conversationId: string) => void;

  // Contacts
  setContacts: (contacts: Contact[]) => void;
  upsertContact: (contact: Contact) => void;

  // Presence
  setPresence: (userId: string, isOnline: boolean, lastSeen?: number) => void;
  setBatchPresence: (updates: Array<{ userId: string; online: boolean; lastSeen?: number }>) => void;

  // Typing
  setTyping: (conversationId: string, userId: string, isTyping: boolean) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  conversations: [],
  messages: {},
  contacts: [],
  presence: {},
  typing: {},
  activeConversationId: null,

  setConversations: (conversations) => set({ conversations }),

  upsertConversation: (conversation) =>
    set((state) => {
      const existing = state.conversations.findIndex((c) => c.id === conversation.id);
      if (existing >= 0) {
        const updated = [...state.conversations];
        updated[existing] = conversation;
        return { conversations: updated };
      }
      return { conversations: [conversation, ...state.conversations] };
    }),

  markConversationRead: (conversationId) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId ? { ...c, unreadCount: 0 } : c,
      ),
    })),

  setActiveConversation: (id) => set({ activeConversationId: id }),

  setMessages: (conversationId, messages) =>
    set((state) => ({ messages: { ...state.messages, [conversationId]: messages } })),

  prependMessages: (conversationId, messages) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [conversationId]: [...messages, ...(state.messages[conversationId] ?? [])],
      },
    })),

  appendMessage: (conversationId, message) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [conversationId]: [...(state.messages[conversationId] ?? []), message],
      },
    })),

  updateMessageStatus: (messageId, status, timestamp) =>
    set((state) => {
      const updated: typeof state.messages = {};
      for (const [convId, msgs] of Object.entries(state.messages)) {
        updated[convId] = msgs.map((m) =>
          m.id === messageId
            ? {
                ...m,
                status,
                ...(status === 'delivered' && timestamp ? { deliveredAt: timestamp } : {}),
                ...(status === 'read' && timestamp ? { readAt: timestamp } : {}),
              }
            : m,
        );
      }
      return { messages: updated };
    }),

  deleteMessage: (messageId, conversationId) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [conversationId]: (state.messages[conversationId] ?? []).map((m) =>
          m.id === messageId ? { ...m, isDeleted: true, content: { type: 'deleted', timestamp: m.createdAt } } : m,
        ),
      },
    })),

  setContacts: (contacts) => set({ contacts }),

  upsertContact: (contact) =>
    set((state) => {
      const existing = state.contacts.findIndex((c) => c.id === contact.id);
      if (existing >= 0) {
        const updated = [...state.contacts];
        updated[existing] = contact;
        return { contacts: updated };
      }
      return { contacts: [...state.contacts, contact] };
    }),

  setPresence: (userId, isOnline, lastSeen) =>
    set((state) => ({
      presence: {
        ...state.presence,
        [userId]: { isOnline, lastSeen: lastSeen ?? state.presence[userId]?.lastSeen },
      },
    })),

  setBatchPresence: (updates) =>
    set((state) => {
      const newPresence = { ...state.presence };
      for (const { userId, online, lastSeen } of updates) {
        const resolvedLastSeen = lastSeen ?? newPresence[userId]?.lastSeen;
        newPresence[userId] = {
          isOnline: online,
          ...(resolvedLastSeen !== undefined ? { lastSeen: resolvedLastSeen } : {}),
        };
      }
      return { presence: newPresence };
    }),

  setTyping: (conversationId, userId, isTyping) =>
    set((state) => ({
      typing: {
        ...state.typing,
        [conversationId]: {
          ...(state.typing[conversationId] ?? {}),
          [userId]: isTyping,
        },
      },
    })),
}));

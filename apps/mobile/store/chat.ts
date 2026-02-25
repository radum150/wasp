// Re-export chat store from shared logic (same structure as web)
import { create } from 'zustand';
import type { Conversation, Message, Contact, MessageStatus } from '@wasp/types';

interface ChatState {
  conversations: Conversation[];
  messages: Record<string, Message[]>;
  contacts: Contact[];
  presence: Record<string, { isOnline: boolean; lastSeen?: number }>;
  typing: Record<string, Record<string, boolean>>;

  setConversations: (c: Conversation[]) => void;
  upsertConversation: (c: Conversation) => void;
  markConversationRead: (id: string) => void;
  setMessages: (convId: string, msgs: Message[]) => void;
  appendMessage: (convId: string, msg: Message) => void;
  updateMessageStatus: (id: string, status: MessageStatus, ts?: number) => void;
  setContacts: (c: Contact[]) => void;
  setPresence: (userId: string, isOnline: boolean, lastSeen?: number) => void;
  setTyping: (convId: string, userId: string, isTyping: boolean) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  conversations: [],
  messages: {},
  contacts: [],
  presence: {},
  typing: {},

  setConversations: (conversations) => set({ conversations }),
  upsertConversation: (conversation) =>
    set((s) => {
      const idx = s.conversations.findIndex((c) => c.id === conversation.id);
      if (idx >= 0) {
        const updated = [...s.conversations];
        updated[idx] = conversation;
        return { conversations: updated };
      }
      return { conversations: [conversation, ...s.conversations] };
    }),
  markConversationRead: (id) =>
    set((s) => ({
      conversations: s.conversations.map((c) => c.id === id ? { ...c, unreadCount: 0 } : c),
    })),
  setMessages: (convId, msgs) =>
    set((s) => ({ messages: { ...s.messages, [convId]: msgs } })),
  appendMessage: (convId, msg) =>
    set((s) => ({
      messages: { ...s.messages, [convId]: [...(s.messages[convId] ?? []), msg] },
    })),
  updateMessageStatus: (id, status, ts) =>
    set((s) => {
      const updated: typeof s.messages = {};
      for (const [k, msgs] of Object.entries(s.messages)) {
        updated[k] = msgs.map((m) =>
          m.id === id
            ? { ...m, status, ...(status === 'delivered' && ts ? { deliveredAt: ts } : {}), ...(status === 'read' && ts ? { readAt: ts } : {}) }
            : m,
        );
      }
      return { messages: updated };
    }),
  setContacts: (contacts) => set({ contacts }),
  setPresence: (userId, isOnline, lastSeen) =>
    set((s) => ({ presence: { ...s.presence, [userId]: { isOnline, lastSeen: lastSeen ?? s.presence[userId]?.lastSeen } } })),
  setTyping: (convId, userId, isTyping) =>
    set((s) => ({ typing: { ...s.typing, [convId]: { ...(s.typing[convId] ?? {}), [userId]: isTyping } } })),
}));

import { useEffect, useRef, useCallback, useState } from 'react';
import { Phone, Video, Search, MoreVertical, ArrowLeft } from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';
import type { Conversation, Message, MessageContent } from '@wasp/types';
import { MessageBubble } from './MessageBubble';
import { MessageInput } from './MessageInput';
import { Avatar } from '../ui/Avatar';
import { useChatStore } from '../../store/chat';
import { useAuthStore } from '../../store/auth';
import { wsClient } from '../../lib/wsClient';
import { cryptoManager } from '../../lib/cryptoManager';
import { toHex } from '@wasp/crypto';

interface ChatViewProps {
  conversation: Conversation;
  onBack?: () => void;
}

function DateDivider({ date }: { date: number }) {
  const label = isToday(date) ? 'Today' : isYesterday(date) ? 'Yesterday' : format(date, 'MMMM d, yyyy');
  return (
    <div className="flex items-center justify-center py-3">
      <span className="bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs px-3 py-1 rounded-full shadow-sm border border-gray-200 dark:border-gray-700">
        {label}
      </span>
    </div>
  );
}

function TypingIndicator({ names }: { names: string[] }) {
  if (names.length === 0) return null;
  const label = names.length === 1 ? `${names[0]} is typing...` : `${names.join(', ')} are typing...`;
  return (
    <div className="flex items-center gap-2 px-4 pb-2">
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-2 h-2 bg-gray-400 rounded-full animate-typing-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
      <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
    </div>
  );
}

export function ChatView({ conversation, onBack }: ChatViewProps) {
  const currentUser = useAuthStore((s) => s.user);
  const { messages: allMessages, presence, typing, appendMessage, updateMessageStatus } = useChatStore();
  const messages = allMessages[conversation.id] ?? [];
  const bottomRef = useRef<HTMLDivElement>(null);
  const [isSending, setIsSending] = useState(false);

  const typingUsers = Object.entries(typing[conversation.id] ?? {})
    .filter(([userId, isTyping]) => isTyping && userId !== currentUser?.id)
    .map(([userId]) =>
      // For DMs the other party is always conversation.name; groups fall back to userId
      conversation.type === 'direct' ? conversation.name : userId,
    );

  const contactId = conversation.participantIds.find((id) => id !== currentUser?.id);
  const isOnline = contactId ? (presence[contactId]?.isOnline ?? false) : false;

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = useCallback(
    async (text: string) => {
      if (!currentUser || !contactId) return;
      setIsSending(true);

      const messageId = crypto.randomUUID();
      const now = Date.now();
      const content: MessageContent = { type: 'text', text, timestamp: now };

      // Append optimistically so the message appears immediately
      const optimisticMsg: Message = {
        id: messageId,
        conversationId: conversation.id,
        senderId: currentUser.id,
        senderDisplayName: currentUser.displayName,
        content,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
        isDeleted: false,
      };
      appendMessage(conversation.id, optimisticMsg);

      try {
        const plaintext = new TextEncoder().encode(JSON.stringify(content));

        // Get or create E2E session
        const { session, isNew } = await cryptoManager.getOrCreateSession(contactId);
        const { envelope } = cryptoManager.encrypt(session, plaintext, isNew);

        // Send via WebSocket
        const envelopeStr = JSON.stringify({
          ...envelope,
          ...(isNew && {
            senderSigningPublicKey: toHex(cryptoManager.getIdentityKey().publicKey),
          }),
        });

        wsClient.sendMessage(contactId, envelopeStr, messageId);
        updateMessageStatus(messageId, 'sent');
      } catch (err) {
        console.error('[ChatView] Failed to send:', err);
        updateMessageStatus(messageId, 'failed');
      } finally {
        setIsSending(false);
      }
    },
    [currentUser, contactId, conversation.id, appendMessage, updateMessageStatus],
  );

  const handleTypingChange = useCallback(
    (isTyping: boolean) => {
      if (!contactId) return;
      wsClient.sendTyping(contactId, conversation.id, isTyping);
    },
    [contactId, conversation.id],
  );

  const handleAttachment = useCallback(async (file: File) => {
    console.info('[ChatView] Attachment selected:', file.name, file.type, file.size);
    // TODO: encrypt media, upload to relay, then send message with media metadata
  }, []);

  // Render messages with date dividers
  const messageElements: React.ReactNode[] = [];
  let lastDate: string | null = null;

  for (const msg of messages) {
    const msgDate = format(msg.createdAt, 'yyyy-MM-dd');
    if (msgDate !== lastDate) {
      messageElements.push(<DateDivider key={`divider-${msgDate}`} date={msg.createdAt} />);
      lastDate = msgDate;
    }
    messageElements.push(
      <MessageBubble
        key={msg.id}
        message={msg}
        isOwn={msg.senderId === currentUser?.id}
        showSender={conversation.type === 'group'}
      />,
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
        {onBack && (
          <button
            onClick={onBack}
            className="p-1.5 -ml-1.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <Avatar
          src={conversation.avatarUrl}
          name={conversation.name}
          size="sm"
          isOnline={conversation.type === 'direct' ? isOnline : undefined}
        />
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100 truncate">
            {conversation.name}
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {conversation.type === 'direct'
              ? isOnline
                ? 'Online'
                : 'Offline'
              : `${conversation.participantIds.length} members`}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-300">
            <Phone className="w-5 h-5" />
          </button>
          <button className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-300">
            <Video className="w-5 h-5" />
          </button>
          <button className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-300">
            <Search className="w-5 h-5" />
          </button>
          <button className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-300">
            <MoreVertical className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto px-4 py-2 space-y-1"
        style={{ backgroundImage: 'var(--chat-bg)', backgroundColor: '#efeae2' }}
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
            <div className="w-12 h-12 rounded-full bg-wasp-100 dark:bg-wasp-900 flex items-center justify-center">
              <svg className="w-6 h-6 text-wasp-600" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 1a9 9 0 1 0 4.35 16.82L21 19l-1.18-4.65A8.96 8.96 0 0 0 12 1z" />
              </svg>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Messages are end-to-end encrypted.
              <br />
              Only you and {conversation.name} can read them.
            </p>
            <span className="text-xs text-gray-400">🔒</span>
          </div>
        )}

        {messageElements}

        <TypingIndicator names={typingUsers} />
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <MessageInput
        onSend={handleSend}
        onTypingChange={handleTypingChange}
        onAttachment={handleAttachment}
        disabled={isSending}
      />
    </div>
  );
}

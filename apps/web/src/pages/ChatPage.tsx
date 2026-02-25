import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MessageSquarePlus, Settings, Users } from 'lucide-react';
import { clsx } from 'clsx';
import { ChatView } from '../components/chat/ChatView';
import { ConversationList } from '../components/sidebar/ConversationList';
import { Avatar } from '../components/ui/Avatar';
import { useChatStore } from '../store/chat';
import { useAuthStore } from '../store/auth';
import { useWebSocket } from '../hooks/useWebSocket';
import { cryptoManager } from '../lib/cryptoManager';

export default function ChatPage() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { conversations, setActiveConversation, markConversationRead } = useChatStore();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [cryptoReady, setCryptoReady] = useState(false);

  // Initialize E2E crypto
  useEffect(() => {
    cryptoManager.initialize().then(() => setCryptoReady(true)).catch(console.error);
  }, []);

  // Connect WebSocket
  useWebSocket();

  useEffect(() => {
    if (conversationId) {
      setActiveConversation(conversationId);
      markConversationRead(conversationId);
    }
  }, [conversationId, setActiveConversation, markConversationRead]);

  const activeConversation = conversations.find((c) => c.id === conversationId);

  const handleSelectConversation = (id: string) => {
    void navigate(`/chat/${id}`);
    setSidebarOpen(false); // on mobile, close sidebar
  };

  if (!cryptoReady) {
    return (
      <div className="h-full flex items-center justify-center bg-white dark:bg-gray-900">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full bg-wasp-100 dark:bg-wasp-900 flex items-center justify-center mx-auto mb-3 animate-pulse">
            <svg className="w-6 h-6 text-wasp-600" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          <p className="text-gray-500 text-sm">Initializing encryption...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex bg-white dark:bg-gray-900">
      {/* Sidebar */}
      <div
        className={clsx(
          'flex flex-col border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900',
          'md:w-[var(--sidebar-width)] md:flex-shrink-0',
          // Mobile: full screen when no conversation selected, hidden otherwise
          conversationId ? 'hidden md:flex' : 'flex w-full',
          sidebarOpen ? 'flex' : 'hidden md:flex',
        )}
      >
        {/* Sidebar header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <Avatar src={user?.avatarUrl} name={user?.displayName ?? 'You'} size="sm" />
            <h1 className="font-bold text-gray-900 dark:text-white text-lg">WASP</h1>
          </div>
          <div className="flex items-center gap-1">
            <button
              className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-300"
              title="New chat"
            >
              <MessageSquarePlus className="w-5 h-5" />
            </button>
            <button
              className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-300"
              title="Groups"
              onClick={() => void navigate('/groups')}
            >
              <Users className="w-5 h-5" />
            </button>
            <button
              className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-300"
              title="Settings"
              onClick={() => void navigate('/settings')}
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div className="px-4 py-2 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="search"
              placeholder="Search or start new chat"
              className="w-full pl-9 pr-4 py-2 rounded-full bg-gray-100 dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none focus:ring-2 focus:ring-wasp-500"
            />
          </div>
        </div>

        {/* Conversation list */}
        <ConversationList
          conversations={conversations}
          activeId={conversationId ?? null}
          onSelect={handleSelectConversation}
        />
      </div>

      {/* Main chat area */}
      <div
        className={clsx(
          'flex-1 flex flex-col',
          !conversationId && 'hidden md:flex',
        )}
      >
        {activeConversation ? (
          <ChatView
            conversation={activeConversation}
            onBack={() => void navigate('/chat')}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-800 text-center px-8">
            <div className="w-24 h-24 rounded-full bg-white dark:bg-gray-700 shadow-sm flex items-center justify-center mb-6">
              <span className="text-5xl font-bold text-wasp-500">W</span>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">WASP</h2>
            <p className="text-gray-500 dark:text-gray-400 max-w-sm">
              Select a conversation to start messaging.
              All messages are end-to-end encrypted — only you and the recipient can read them.
            </p>
            <div className="mt-6 flex items-center gap-2 text-sm text-gray-400">
              <svg className="w-4 h-4 text-wasp-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
              <span>End-to-end encrypted by Signal Protocol</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

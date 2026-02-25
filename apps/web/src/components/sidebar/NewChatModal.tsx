import { useState, useEffect, useRef } from 'react';
import { X, Search, Loader2 } from 'lucide-react';
import { Avatar } from '../ui/Avatar';
import { api } from '../../lib/api';
import { useChatStore } from '../../store/chat';
import { useAuthStore } from '../../store/auth';
import type { Conversation } from '@wasp/types';

interface UserResult {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
}

interface NewChatModalProps {
  onClose: () => void;
  onSelectConversation: (id: string) => void;
}

export function NewChatModal({ onClose, onSelectConversation }: NewChatModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const currentUser = useAuthStore((s) => s.user);
  const { conversations, setConversations } = useChatStore();

  // Focus input on open
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Search as user types (debounced)
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    const timer = setTimeout(async () => {
      try {
        const data = await api.users.search(q);
        const users = (data.users as UserResult[]).filter((u) => u.id !== currentUser?.id);
        setResults(users);
      } catch {
        setError('Could not search users. Check your connection.');
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, currentUser?.id]);

  const handleSelect = (user: UserResult) => {
    if (!currentUser) return;

    // Use a deterministic conversation ID so both users share the same conv
    const convId = ['dm', ...[currentUser.id, user.id].sort()].join('-');

    // Create conversation in store if it doesn't already exist
    const exists = conversations.some((c) => c.id === convId);
    if (!exists) {
      const newConv: Conversation = {
        id: convId,
        type: 'direct',
        name: user.displayName,
        participantIds: [currentUser.id, user.id],
        createdAt: Date.now(),
        unreadCount: 0,
        isMuted: false,
        isPinned: false,
        isArchived: false,
      };
      setConversations([newConv, ...conversations]);
    }

    onSelectConversation(convId);
    onClose();
  };

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-x-4 top-16 md:inset-auto md:left-1/2 md:-translate-x-1/2 md:top-24 md:w-[420px] z-50 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl flex flex-col max-h-[70vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <h2 className="font-semibold text-gray-900 dark:text-white">New Conversation</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search input */}
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <div className="relative flex items-center">
            <Search className="absolute left-3 w-4 h-4 text-gray-400" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by username…"
              className="w-full pl-9 pr-4 py-2 rounded-full bg-gray-100 dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none focus:ring-2 focus:ring-wasp-500"
            />
            {loading && (
              <Loader2 className="absolute right-3 w-4 h-4 text-gray-400 animate-spin" />
            )}
          </div>
        </div>

        {/* Results */}
        <div className="overflow-y-auto flex-1">
          {error && (
            <p className="px-4 py-6 text-center text-sm text-red-500">{error}</p>
          )}

          {!loading && !error && query.trim() && results.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              No users found for "<span className="font-medium">{query}</span>"
            </p>
          )}

          {!query.trim() && (
            <p className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
              Start typing a username to search
            </p>
          )}

          {results.map((user) => (
            <button
              key={user.id}
              onClick={() => handleSelect(user)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
            >
              <Avatar name={user.displayName} src={user.avatarUrl} size="md" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 dark:text-white truncate">
                  {user.displayName}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                  @{user.username}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

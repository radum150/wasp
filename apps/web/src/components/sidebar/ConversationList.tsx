import { formatDistanceToNowStrict } from 'date-fns';
import { clsx } from 'clsx';
import type { Conversation } from '@wasp/types';
import { Avatar } from '../ui/Avatar';
import { useChatStore } from '../../store/chat';
import { useAuthStore } from '../../store/auth';

interface ConversationListProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
}

export function ConversationList({ conversations, activeId, onSelect }: ConversationListProps) {
  const presence = useChatStore((s) => s.presence);
  const currentUserId = useAuthStore((s) => s.user?.id);

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center px-8">
        <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <p className="text-gray-500 dark:text-gray-400 font-medium">No conversations yet</p>
        <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">Start a new chat to get going</p>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto flex-1">
      {conversations.map((conv) => {
        const contactId = conv.participantIds.find((id) => id !== currentUserId);
        const isOnline = contactId ? (presence[contactId]?.isOnline ?? false) : false;
        const isActive = conv.id === activeId;

        return (
          <button
            key={conv.id}
            onClick={() => onSelect(conv.id)}
            className={clsx(
              'group w-full flex items-center gap-3 px-4 py-3 text-left',
              'border-l-[3px] transition-all duration-150',
              'hover:bg-wasp-50 dark:hover:bg-gray-800/70 hover:border-l-wasp-400',
              isActive
                ? 'bg-wasp-50 dark:bg-gray-800 border-l-wasp-500'
                : 'border-l-transparent',
            )}
          >
            <Avatar
              src={conv.avatarUrl}
              name={conv.name}
              size="md"
              isOnline={conv.type === 'direct' ? isOnline : undefined}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className={clsx(
                  'font-medium truncate transition-colors',
                  isActive
                    ? 'text-wasp-700 dark:text-wasp-300'
                    : 'text-gray-900 dark:text-gray-100 group-hover:text-wasp-700 dark:group-hover:text-wasp-300',
                )}>
                  {conv.name}
                </span>
                {conv.lastMessageAt && (
                  <span className={clsx(
                    'text-xs flex-shrink-0 transition-colors',
                    isActive ? 'text-wasp-500' : 'text-gray-400 dark:text-gray-500',
                  )}>
                    {formatDistanceToNowStrict(conv.lastMessageAt, { addSuffix: false })}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 mt-0.5">
                <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                  {conv.lastMessagePreview ?? 'No messages yet'}
                </p>
                {conv.unreadCount > 0 && (
                  <span className="flex-shrink-0 bg-wasp-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                  </span>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

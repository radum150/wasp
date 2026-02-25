import { format } from 'date-fns';
import { clsx } from 'clsx';
import { Check, CheckCheck } from 'lucide-react';
import type { Message } from '@wasp/types';

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  showSender?: boolean;
}

function MessageStatus({ status }: { status: Message['status'] }) {
  if (status === 'pending') return <Check className="w-3.5 h-3.5 text-gray-400" />;
  if (status === 'sent') return <Check className="w-3.5 h-3.5 text-gray-500" />;
  if (status === 'delivered') return <CheckCheck className="w-3.5 h-3.5 text-gray-500" />;
  if (status === 'read') return <CheckCheck className="w-3.5 h-3.5 text-blue-500" />;
  return null;
}

export function MessageBubble({ message, isOwn, showSender = false }: MessageBubbleProps) {
  const { content, status, createdAt, isDeleted } = message;

  if (isDeleted) {
    return (
      <div className={clsx('flex', isOwn ? 'justify-end' : 'justify-start')}>
        <div className="px-3 py-2 rounded-2xl bg-gray-100 dark:bg-gray-800 max-w-xs">
          <p className="text-sm text-gray-400 dark:text-gray-500 italic">This message was deleted</p>
        </div>
      </div>
    );
  }

  return (
    <div className={clsx('flex items-end gap-1', isOwn ? 'justify-end' : 'justify-start')}>
      <div
        className={clsx(
          'max-w-sm lg:max-w-md xl:max-w-lg px-3 py-2 shadow-sm',
          isOwn ? 'chat-bubble-sent' : 'chat-bubble-received',
        )}
      >
        {/* Group sender name */}
        {showSender && !isOwn && (
          <p className="text-xs font-semibold text-wasp-600 dark:text-wasp-400 mb-1">
            {message.senderDisplayName}
          </p>
        )}

        {/* Reply preview */}
        {content.replyTo && (
          <div className="border-l-2 border-wasp-500 pl-2 mb-2 bg-black/5 dark:bg-white/5 rounded-r py-1">
            <p className="text-xs font-semibold text-wasp-600">{content.replyTo.senderDisplayName}</p>
            <p className="text-xs text-gray-600 dark:text-gray-300 truncate">{content.replyTo.previewText}</p>
          </div>
        )}

        {/* Content */}
        {content.type === 'text' && (
          <p className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words">
            {content.text}
          </p>
        )}

        {content.type === 'image' && content.media && (
          <div className="rounded-lg overflow-hidden mb-1">
            {content.media.thumbnailBase64 ? (
              <img
                src={`data:image/jpeg;base64,${content.media.thumbnailBase64}`}
                alt={content.media.name}
                className="max-w-full rounded-lg"
              />
            ) : (
              <div className="w-48 h-48 bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center">
                <span className="text-gray-400 text-sm">📷 {content.media.name}</span>
              </div>
            )}
          </div>
        )}

        {(content.type === 'audio' || content.type === 'voice_note') && (
          <div className="flex items-center gap-2 min-w-48">
            <button className="w-8 h-8 rounded-full bg-wasp-500 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </button>
            <div className="flex-1 h-1 bg-gray-300 dark:bg-gray-600 rounded-full">
              <div className="h-1 bg-wasp-500 rounded-full w-0" />
            </div>
            <span className="text-xs text-gray-500">
              {content.media?.duration ? `${Math.floor(content.media.duration / 60)}:${String(content.media.duration % 60).padStart(2, '0')}` : '0:00'}
            </span>
          </div>
        )}

        {content.type === 'document' && content.media && (
          <div className="flex items-center gap-2 min-w-48">
            <div className="w-10 h-12 bg-blue-100 dark:bg-blue-900 rounded flex items-center justify-center flex-shrink-0">
              <span className="text-blue-600 dark:text-blue-300 text-xs font-bold">
                {content.media.name.split('.').pop()?.toUpperCase().slice(0, 4) ?? 'FILE'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{content.media.name}</p>
              <p className="text-xs text-gray-500">
                {content.media.size ? `${(content.media.size / 1024).toFixed(1)} KB` : ''}
              </p>
            </div>
          </div>
        )}

        {/* Timestamp + status */}
        <div className={clsx('flex items-center gap-1 mt-1', isOwn ? 'justify-end' : 'justify-start')}>
          {content.forwarded && (
            <span className="text-xs text-gray-400 italic mr-1">Forwarded</span>
          )}
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {format(createdAt, 'HH:mm')}
          </span>
          {isOwn && <MessageStatus status={status} />}
        </div>
      </div>
    </div>
  );
}

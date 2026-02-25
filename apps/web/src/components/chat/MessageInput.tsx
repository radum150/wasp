import { useState, useRef, useCallback } from 'react';
import { Paperclip, Mic, Send, Smile } from 'lucide-react';
import { clsx } from 'clsx';

interface MessageInputProps {
  onSend: (text: string) => void;
  onTypingChange: (isTyping: boolean) => void;
  onAttachment: (file: File) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function MessageInput({
  onSend,
  onTypingChange,
  onAttachment,
  disabled = false,
  placeholder = 'Type a message',
}: MessageInputProps) {
  const [text, setText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setText(value);

      // Auto-resize
      const ta = e.target;
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';

      // Typing indicator
      if (value.length > 0) {
        onTypingChange(true);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => onTypingChange(false), 3000);
      } else {
        onTypingChange(false);
      }
    },
    [onTypingChange],
  );

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    onTypingChange(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [text, disabled, onSend, onTypingChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        onAttachment(file);
        e.target.value = '';
      }
    },
    [onAttachment],
  );

  const hasText = text.trim().length > 0;

  return (
    <div className="flex items-end gap-2 p-3 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
      {/* Emoji button */}
      <button
        className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex-shrink-0 mb-0.5"
        title="Emoji"
      >
        <Smile className="w-5 h-5" />
      </button>

      {/* Attachment button */}
      <button
        onClick={() => fileInputRef.current?.click()}
        className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex-shrink-0 mb-0.5"
        title="Attach file"
      >
        <Paperclip className="w-5 h-5" />
      </button>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileSelect}
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
      />

      {/* Text input */}
      <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-3xl px-4 py-2 min-h-10 flex items-end">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          rows={1}
          className="w-full bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 resize-none outline-none max-h-32 leading-5"
          style={{ height: 'auto' }}
        />
      </div>

      {/* Send / Voice note button */}
      {hasText ? (
        <button
          onClick={handleSend}
          disabled={disabled}
          className={clsx(
            'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all',
            'bg-wasp-500 hover:bg-wasp-600 text-white shadow-sm',
            disabled && 'opacity-50 cursor-not-allowed',
          )}
          title="Send message"
        >
          <Send className="w-4 h-4" />
        </button>
      ) : (
        <button
          onMouseDown={() => setIsRecording(true)}
          onMouseUp={() => setIsRecording(false)}
          onMouseLeave={() => setIsRecording(false)}
          className={clsx(
            'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all',
            isRecording
              ? 'bg-red-500 text-white scale-110'
              : 'bg-wasp-500 hover:bg-wasp-600 text-white',
          )}
          title="Hold to record voice message"
        >
          <Mic className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

import { useState } from 'react';
import type { ThreadMessage } from '../store/threadWindowStore.ts';
import { MessageBubble } from './MessageBubble.tsx';

interface MessageListProps {
  messages: ThreadMessage[];
  errorMessage: string | null;
}

export function MessageList({ messages, errorMessage }: MessageListProps) {
  const handleCopy = (text: string) => {
    // 显示复制成功反馈（可选）
    console.log('已复制:', text.slice(0, 50));
  };

  return (
    <div className="flex flex-col gap-3 min-h-0 overflow-y-auto px-5 py-4">
      {messages.length === 0 ? (
        <div className="flex items-center justify-center h-full text-sm text-text-secondary">
          等待输入
        </div>
      ) : null}

      {messages.map((message) => (
        <MessageBubble
          key={message.id}
          message={message}
          onCopy={handleCopy}
        />
      ))}

      {errorMessage && (
        <div className="max-w-3xl mx-auto w-full rounded-bubble border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
          {errorMessage}
        </div>
      )}
    </div>
  );
}

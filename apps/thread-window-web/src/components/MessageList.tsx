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
    <div className="flex min-h-0 flex-col gap-sm overflow-y-auto bg-surface-dark px-lg py-md">
      {messages.length === 0 ? (
        <div className="flex h-full items-center justify-center text-sm text-on-dark-soft">
          <div className="rounded-lg border border-white/10 bg-surface-dark-elevated px-lg py-md text-center shadow-product-inner">
            <div className="font-display text-[28px] font-normal tracking-[-0.02em] text-on-dark">
              等待输入
            </div>
            <div className="mt-xs text-sm text-on-dark-soft">
              从下方输入框开始一个 thread
            </div>
          </div>
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
        <div className="mx-auto w-full max-w-3xl rounded-lg border border-error/30 bg-error/10 px-md py-sm text-sm text-error">
          {errorMessage}
        </div>
      )}
    </div>
  );
}

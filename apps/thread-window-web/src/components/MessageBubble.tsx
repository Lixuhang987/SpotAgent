import { useState } from 'react';
import type { ThreadMessage } from '../store/threadWindowStore.ts';
import { cn } from '../utils/cn.ts';
import { TypingIndicator } from './TypingIndicator.tsx';

interface MessageBubbleProps {
  message: ThreadMessage;
  onCopy: (text: string) => void;
  isRunning?: boolean; // 是否正在运行（用于显示打字指示器）
}

export function MessageBubble({ message, onCopy, isRunning = false }: MessageBubbleProps) {
  const [isHovered, setIsHovered] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.text);
    onCopy(message.text);
  };

  // GPT 风格：assistant 消息透明无背景，user 消息右对齐带背景
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const isTool = message.role === 'tool';

  return (
    <article
      className={cn(
        'group mx-auto w-full',
        isUser && 'flex justify-end' // user 消息右对齐
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={cn(
        'w-full',
        isUser && 'max-w-[85%]' // user 消息最大宽度 85%
      )}>
        <div
          className={cn(
            'px-lg py-md',
            // GPT 风格样式
            isUser && 'rounded-2xl bg-surface-card text-ink', // user: 16pt 圆角 + 背景
            isAssistant && 'bg-transparent text-on-dark', // assistant: 完全透明
            isTool && 'rounded-lg bg-tool-bubble/50 text-on-dark-soft' // tool: 低调呈现
          )}
        >
          {message.toolName && (
            <div
              className={cn(
                'mb-xs font-code text-xs',
                isTool ? 'text-on-dark-soft' : 'text-muted'
              )}
            >
              [{message.toolName}]
            </div>
          )}
          <p
            className={cn(
              'm-0 whitespace-pre-wrap break-words leading-[1.6]',
              isTool ? 'font-code text-[13px]' : 'text-[15px]',
              isAssistant && 'text-on-dark',
              isUser && 'text-ink',
              isTool && 'text-on-dark-soft'
            )}
          >
            {message.text}
          </p>
          {message.pending && (
            <small
              className={cn(
                'mt-xs block text-xs',
                isTool ? 'text-on-dark-soft' : 'text-muted'
              )}
            >
              处理中...
            </small>
          )}

          {/* GPT 风格：assistant 消息运行时显示打字指示器 */}
          {isAssistant && isRunning && <TypingIndicator />}
        </div>

        {/* 操作按钮栏 - hover 时显示 (GPT 风格) */}
        {(isHovered || isUser) && ( // user 消息始终显示，其他 hover 显示
          <div className="mt-xs flex h-8 items-center gap-xs px-xs">
            <button
              onClick={handleCopy}
              className="flex h-6 items-center gap-1 rounded-sm px-xs text-xs text-on-dark-soft transition-colors hover:bg-white/10 hover:text-on-dark"
              aria-label="复制消息"
            >
              <svg width="14" height="14" viewBox="0 0 14 14">
                <rect
                  x="4"
                  y="4"
                  width="7"
                  height="7"
                  rx="1"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  fill="none"
                />
                <path
                  d="M3 10V3.5A1.5 1.5 0 0 1 4.5 2H10"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  fill="none"
                />
              </svg>
              <span>复制</span>
            </button>

            {/* 预留按钮 - 禁用状态 */}
            <button
              disabled
              className="h-6 cursor-not-allowed rounded-sm px-xs text-xs text-on-dark-soft/50"
              title="即将推出"
            >
              编辑
            </button>
            <button
              disabled
              className="h-6 cursor-not-allowed rounded-sm px-xs text-xs text-on-dark-soft/50"
              title="即将推出"
            >
              重新生成
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

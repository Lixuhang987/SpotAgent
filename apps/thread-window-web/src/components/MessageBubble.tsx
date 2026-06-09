import type { ThreadMessage } from '../store/threadWindowStore.ts';
import { cn } from '../utils/cn.ts';
import { TypingIndicator } from './TypingIndicator.tsx';

interface MessageBubbleProps {
  message: ThreadMessage;
  onCopy: (text: string) => void;
  isRunning?: boolean; // 是否正在运行（用于显示打字指示器）
}

export function MessageBubble({ message, onCopy, isRunning = false }: MessageBubbleProps) {
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
        isUser && 'flex justify-end'
      )}
    >
      <div className={cn(
        'w-full',
        isUser && 'max-w-[85%]'
      )}>
        <div
          className={cn(
            'px-lg py-md',
            isUser && 'rounded-2xl border border-app-hairline/70 bg-app-user-bubble text-app-text-primary shadow-soft',
            isAssistant && 'bg-transparent text-app-text-primary',
            isTool && 'rounded-xl border border-app-hairline bg-app-tool-bubble/70 text-app-text-muted shadow-product-inner'
          )}
        >
          {message.toolName && (
            <div
              className={cn(
                'mb-xs font-code text-xs',
                isTool ? 'text-app-text-muted' : 'text-app-text-secondary'
              )}
            >
              [{message.toolName}]
            </div>
          )}
          <p
            className={cn(
              'm-0 whitespace-pre-wrap break-words leading-[1.6]',
              isTool ? 'font-code text-[13px]' : 'text-[15px]',
              isAssistant && 'text-app-text-primary',
              isUser && 'text-app-text-primary',
              isTool && 'text-app-text-muted'
            )}
          >
            {message.text}
          </p>
          {message.pending && (
            <small
              className={cn(
                'mt-xs block text-xs',
                isTool ? 'text-app-text-muted' : 'text-app-text-secondary'
              )}
            >
              处理中...
            </small>
          )}

          {/* GPT 风格：assistant 消息运行时显示打字指示器 */}
          {isAssistant && isRunning && <TypingIndicator />}
        </div>

        <div
          className={cn(
            'mt-xs flex h-8 items-center gap-xs px-xs opacity-0 transition-opacity duration-200 group-focus-within:opacity-100 group-hover:opacity-100',
            isUser && 'opacity-100'
          )}
        >
          <button
            onClick={handleCopy}
            className="flex h-7 items-center gap-1 rounded-md px-xs text-xs text-app-text-muted transition-colors duration-200 hover:bg-app-surface-muted hover:text-app-text-primary focus:outline-none focus:ring-4 focus:ring-app-accent-ring"
            aria-label="复制消息"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
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

          <button
            disabled
            className="h-7 cursor-not-allowed rounded-md px-xs text-xs text-app-text-muted/50"
            title="即将推出"
          >
            编辑
          </button>
          <button
            disabled
            className="h-7 cursor-not-allowed rounded-md px-xs text-xs text-app-text-muted/50"
            title="即将推出"
          >
            重新生成
          </button>
        </div>
      </div>
    </article>
  );
}

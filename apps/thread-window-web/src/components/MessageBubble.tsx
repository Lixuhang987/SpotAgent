import type { ThreadMessage } from '../store/threadWindowStore.ts';
import { cn } from '../utils/cn.ts';

interface MessageBubbleProps {
  message: ThreadMessage;
  onCopy: (text: string) => void;
}

export function MessageBubble({ message, onCopy }: MessageBubbleProps) {
  const handleCopy = () => {
    navigator.clipboard.writeText(message.text);
    onCopy(message.text);
  };

  return (
    <article
      className={cn(
        'mx-auto w-full max-w-3xl',
        message.role === 'user' && 'max-w-2xl'
      )}
    >
      <div
        className={cn(
          'rounded-lg border px-lg py-md shadow-product-inner',
          message.role === 'user' && 'ml-auto border-primary/25 bg-user-bubble text-ink',
          message.role === 'assistant' && 'border-hairline bg-assistant-bubble text-ink shadow-soft',
          message.role === 'tool' && 'border-white/10 bg-tool-bubble text-on-dark'
        )}
      >
        {message.toolName && (
          <div
            className={cn(
              'mb-xs font-code text-xs',
              message.role === 'tool' ? 'text-on-dark-soft' : 'text-muted'
            )}
          >
            Tool: {message.toolName}
          </div>
        )}
        <p
          className={cn(
            'm-0 whitespace-pre-wrap break-words text-sm leading-[1.6]',
            message.role === 'tool' ? 'font-code text-on-dark' : 'text-body'
          )}
        >
          {message.text}
        </p>
        {message.pending && (
          <small
            className={cn(
              'mt-xs block text-xs',
              message.role === 'tool' ? 'text-on-dark-soft' : 'text-muted'
            )}
          >
            处理中...
          </small>
        )}
      </div>

      {/* 操作按钮栏 - 始终显示 */}
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
    </article>
  );
}

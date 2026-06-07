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
        'w-full max-w-3xl mx-auto',
        message.role === 'user' && 'ml-auto'
      )}
    >
      <div
        className={cn(
          'rounded-bubble border px-6 py-4',
          message.role === 'user' && 'border-accent/30 bg-user-bubble',
          message.role === 'assistant' && 'border-border bg-assistant-bubble',
          message.role === 'tool' && 'border-border bg-tool-bubble'
        )}
      >
        {message.toolName && (
          <div className="text-xs text-text-secondary mb-2">
            Tool: {message.toolName}
          </div>
        )}
        <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap break-words m-0">
          {message.text}
        </p>
        {message.pending && (
          <small className="block mt-2 text-xs text-text-secondary">
            处理中...
          </small>
        )}
      </div>

      {/* 操作按钮栏 - 始终显示 */}
      <div className="flex items-center gap-1 h-8 mt-1 px-2">
        <button
          onClick={handleCopy}
          className="h-6 px-2 rounded hover:bg-surface text-text-secondary hover:text-text-primary transition-colors text-xs flex items-center gap-1"
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
          className="h-6 px-2 rounded text-text-secondary/50 text-xs cursor-not-allowed"
          title="即将推出"
        >
          编辑
        </button>
        <button
          disabled
          className="h-6 px-2 rounded text-text-secondary/50 text-xs cursor-not-allowed"
          title="即将推出"
        >
          重新生成
        </button>
      </div>
    </article>
  );
}

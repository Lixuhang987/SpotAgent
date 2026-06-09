import type { ThreadMessage } from '../store/threadWindowStore.ts';
import { MessageBubble } from './MessageBubble.tsx';

interface MessageListProps {
  messages: ThreadMessage[];
  errorMessage: string | null;
  isRunning?: boolean; // 是否正在运行
}

export function MessageList({ messages, errorMessage, isRunning = false }: MessageListProps) {
  const handleCopy = (text: string) => {
    // 显示复制成功反馈（可选）
    console.log('已复制:', text.slice(0, 50));
  };

  // 找到最后一条 assistant 消息的索引
  const lastAssistantIndex = messages.reduce((lastIdx, msg, idx) => {
    return msg.role === 'assistant' ? idx : lastIdx;
  }, -1);

  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-sm overflow-y-auto overflow-x-hidden bg-app-canvas px-lg py-md">
      {messages.length === 0 ? (
        <div className="flex h-full items-center justify-center text-sm text-app-text-muted">
          <div className="rounded-lg border border-app-hairline bg-app-surface-elevated px-lg py-md text-center shadow-product-inner">
            <div className="font-display text-[28px] font-normal tracking-[-0.02em] text-app-text-primary">
              等待输入
            </div>
            <div className="mt-xs text-sm text-app-text-muted">
              从下方输入框开始一个 thread
            </div>
          </div>
        </div>
      ) : null}

      {/* GPT 风格：消息区域居中，max-width 720pt */}
      <div className="mx-auto min-w-0 w-full max-w-[720pt] space-y-sm">
        {messages.map((message, index) => (
          <MessageBubble
            key={message.id}
            message={message}
            onCopy={handleCopy}
            // 只有最后一条 assistant 消息在运行时显示打字指示器
            isRunning={isRunning && message.role === 'assistant' && index === lastAssistantIndex}
          />
        ))}

        {errorMessage && (
          <div className="rounded-lg border border-app-error/30 bg-app-error/10 px-md py-sm text-sm text-app-error">
            {errorMessage}
          </div>
        )}
      </div>
    </div>
  );
}

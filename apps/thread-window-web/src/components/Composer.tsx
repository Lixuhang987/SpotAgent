import { useRef, useState } from 'react';
import type { QueuedComposerInput } from '../store/threadWindowStore.ts';

interface ComposerProps {
  disabled: boolean;
  stopDisabled: boolean;
  queuedInputs?: QueuedComposerInput[];
  onSubmit: (text: string) => void;
  onStop: () => void;
  onRemoveQueuedInput?: (index: number) => void;
}

const MAX_ROWS = 5;
const LINE_HEIGHT = 24;

export function Composer({
  disabled,
  stopDisabled,
  queuedInputs = [],
  onSubmit,
  onStop,
  onRemoveQueuedInput,
}: ComposerProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget;
    setText(target.value);

    // 自动调整高度
    target.style.height = 'auto';
    target.style.height = `${Math.min(target.scrollHeight, MAX_ROWS * LINE_HEIGHT)}px`;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || disabled) return;

    onSubmit(trimmed);
    setText('');

    // 重置高度
    if (textareaRef.current) {
      textareaRef.current.style.height = '52px';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const isRunning = !stopDisabled;

  return (
    <form
      onSubmit={handleSubmit}
      className="flex min-w-0 flex-col items-center justify-end overflow-hidden bg-surface-dark px-lg py-md"
    >
      {queuedInputs.length > 0 ? (
        <div
          data-queued-composer-panel="true"
          className="mb-xs max-h-[156px] min-w-0 w-full max-w-[720pt] overflow-y-auto rounded-2xl border border-white/10 bg-surface-dark-elevated/95 px-xs py-xs shadow-product-inner"
        >
          <div className="space-y-1">
            {queuedInputs.map((queuedInput, index) => (
              <div
                key={`${index}-${queuedInput.text}`}
                data-queued-composer-item="true"
                className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-xs rounded-xl px-xs py-1 text-sm text-on-dark-soft hover:bg-white/5"
              >
                <span className="font-code text-xs text-on-dark-soft/70">↳</span>
                <span className="truncate text-on-dark" title={queuedInput.text}>
                  {queuedInput.text}
                </span>
                <span className="whitespace-nowrap text-xs text-on-dark-soft">待发送</span>
                <button
                  type="button"
                  aria-label={`移除排队输入 ${index + 1}`}
                  onClick={() => onRemoveQueuedInput?.(index)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-on-dark-soft transition-colors hover:bg-white/10 hover:text-on-dark"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <path
                      d="M3.5 4.2H10.5M5.2 4.2V3.1H8.8V4.2M5 5.8V10M7 5.8V10M9 5.8V10M4.2 4.2L4.7 11.2H9.3L9.8 4.2"
                      stroke="currentColor"
                      strokeWidth="1.3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* GPT 风格 pill 形容器 */}
      <div className="relative mx-auto min-w-0 w-full max-w-[720pt] rounded-3xl border border-white/10 bg-surface-dark-elevated px-md py-xs shadow-product-inner transition-colors focus-within:border-white/20">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-xs">
          {/* 文本输入区域 */}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Ask HandAgent"
            disabled={disabled}
            className="min-h-[52px] min-w-0 max-h-[120px] w-full resize-none overflow-y-auto overflow-x-hidden bg-transparent px-xs py-xs text-[16px] leading-[1.5] text-on-dark placeholder:text-on-dark-soft outline-none disabled:cursor-not-allowed disabled:text-on-dark-soft/50"
            style={{ minHeight: '52px', maxHeight: `${MAX_ROWS * LINE_HEIGHT}px` }}
          />

          {/* 右侧按钮区域 */}
          <div className="flex flex-shrink-0 items-center gap-xs pb-xs">
            {/* 附件按钮 - 占位 */}
            <button
              type="button"
              disabled
              className="flex h-8 w-8 items-center justify-center rounded-lg text-on-dark-soft transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              title="附件（即将推出）"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path
                  d="M10 5V15M5 10H15"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>

            {isRunning ? (
              <button
                type="button"
                onClick={onStop}
                disabled={stopDisabled}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-on-primary transition-colors hover:bg-primary-active disabled:cursor-not-allowed disabled:bg-primary-disabled disabled:text-muted"
                title="停止"
              >
                <svg width="12" height="12" viewBox="0 0 12 12">
                  <rect
                    x="2"
                    y="2"
                    width="8"
                    height="8"
                    rx="1"
                    fill="currentColor"
                  />
                </svg>
              </button>
            ) : null}
            <button
              type="submit"
              disabled={disabled || !text.trim()}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-on-primary transition-colors hover:bg-primary-active disabled:cursor-not-allowed disabled:bg-surface-dark-elevated disabled:text-on-dark-soft"
              title="发送"
            >
              <svg width="16" height="16" viewBox="0 0 16 16">
                <path
                  d="M8 3V13M8 3L12 7M8 3L4 7"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

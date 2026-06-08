import { useRef, useState } from 'react';

interface ComposerProps {
  disabled: boolean;
  stopDisabled: boolean;
  onSubmit: (text: string) => void;
  onStop: () => void;
}

const MAX_ROWS = 5;
const LINE_HEIGHT = 24;

export function Composer({ disabled, stopDisabled, onSubmit, onStop }: ComposerProps) {
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

  // GPT 风格：根据运行状态决定显示发送还是停止按钮
  const isRunning = !stopDisabled;

  return (
    <form
      onSubmit={handleSubmit}
      className="flex min-w-0 items-end justify-center overflow-hidden bg-surface-dark px-lg py-md"
    >
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

            {/* 发送或停止按钮 */}
            {isRunning ? (
              // 停止按钮（方形图标）
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
            ) : (
              // 发送按钮（箭头图标）
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
            )}
          </div>
        </div>
      </div>
    </form>
  );
}

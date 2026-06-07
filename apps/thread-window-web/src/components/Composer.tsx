import { useRef, useState } from 'react';

interface ComposerProps {
  disabled: boolean;
  stopDisabled: boolean;
  onSubmit: (text: string) => void;
  onStop: () => void;
}

const MAX_ROWS = 6;
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

  return (
    <form
      onSubmit={handleSubmit}
      className="grid grid-cols-[1fr_auto] gap-sm border-t border-white/10 bg-surface-dark-soft px-sm py-sm"
    >
      <textarea
        ref={textareaRef}
        value={text}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        placeholder="Ask HandAgent"
        disabled={disabled}
        className="min-h-[52px] max-h-[144px] resize-none overflow-y-auto rounded-lg border border-hairline bg-canvas px-sm py-xs text-sm leading-[1.6] text-ink placeholder:text-muted-soft outline-none transition-shadow disabled:cursor-not-allowed disabled:bg-primary-disabled disabled:text-muted focus:border-primary focus:ring-4 focus:ring-accent-ring"
        style={{ minHeight: '52px', maxHeight: `${MAX_ROWS * LINE_HEIGHT}px` }}
      />
      <div className="flex flex-col gap-xs">
        <button
          type="submit"
          disabled={disabled || !text.trim()}
          className="h-10 rounded-md bg-primary px-md text-sm font-medium text-on-primary transition-colors hover:bg-primary-active active:bg-accent-pressed disabled:cursor-not-allowed disabled:bg-primary-disabled disabled:text-muted"
        >
          发送
        </button>
        <button
          type="button"
          onClick={onStop}
          disabled={stopDisabled}
          className="h-10 rounded-md border border-white/10 bg-surface-dark-elevated px-md text-sm font-medium text-on-dark transition-colors hover:bg-surface-dark disabled:cursor-not-allowed disabled:text-on-dark-soft/50"
        >
          停止
        </button>
      </div>
    </form>
  );
}

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
      className="grid grid-cols-[1fr_auto] gap-2.5 border-t border-border bg-surface/50 px-3 py-3"
    >
      <textarea
        ref={textareaRef}
        value={text}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        placeholder="Ask HandAgent"
        disabled={disabled}
        className="min-h-[52px] max-h-[144px] resize-none overflow-y-auto rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-text-primary leading-relaxed placeholder:text-text-secondary disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-accent-ring"
        style={{ minHeight: '52px', maxHeight: `${MAX_ROWS * LINE_HEIGHT}px` }}
      />
      <div className="flex flex-col gap-2">
        <button
          type="submit"
          disabled={disabled || !text.trim()}
          className="h-10 px-4 rounded-lg bg-accent hover:bg-accent-hover active:bg-accent-pressed disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium text-background transition-colors"
        >
          发送
        </button>
        <button
          type="button"
          onClick={onStop}
          disabled={stopDisabled}
          className="h-10 px-4 rounded-lg border border-border bg-surface hover:bg-surface/80 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium text-text-primary transition-colors"
        >
          停止
        </button>
      </div>
    </form>
  );
}

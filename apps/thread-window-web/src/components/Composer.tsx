import { useState } from "react";

export function Composer({
  disabled,
  stopDisabled,
  onSubmit,
  onStop,
}: {
  disabled: boolean;
  stopDisabled: boolean;
  onSubmit(text: string): void;
  onStop(): void;
}) {
  const [text, setText] = useState("");

  return (
    <form
      className="composer"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = text.trim();
        if (!trimmed || disabled) {
          return;
        }
        onSubmit(trimmed);
        setText("");
      }}
    >
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Ask HandAgent"
        disabled={disabled}
      />
      <div className="composer-actions">
        <button type="submit" disabled={disabled}>发送</button>
        <button type="button" disabled={stopDisabled} onClick={onStop}>停止</button>
      </div>
    </form>
  );
}

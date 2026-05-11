interface PromptBoxProps {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

export function PromptBox({ value, disabled = false, onChange, onSubmit }: PromptBoxProps) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label>
        <span>Prompt</span>
        <input
          autoFocus
          placeholder="输入你要 Agent 执行的任务"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
        />
      </label>
    </form>
  );
}

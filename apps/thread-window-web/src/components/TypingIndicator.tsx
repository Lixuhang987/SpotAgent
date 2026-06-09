export function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-lg py-sm">
      <div className="flex gap-1">
        <span
          className="h-2 w-2 animate-bounce rounded-full bg-app-text-muted"
          style={{ animationDelay: '0ms', animationDuration: '1s' }}
        />
        <span
          className="h-2 w-2 animate-bounce rounded-full bg-app-text-muted"
          style={{ animationDelay: '150ms', animationDuration: '1s' }}
        />
        <span
          className="h-2 w-2 animate-bounce rounded-full bg-app-text-muted"
          style={{ animationDelay: '300ms', animationDuration: '1s' }}
        />
      </div>
    </div>
  );
}

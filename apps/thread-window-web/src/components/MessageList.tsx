import type { ThreadMessage } from "../store/threadWindowStore.ts";

export function MessageList({
  messages,
  errorMessage,
}: {
  messages: ThreadMessage[];
  errorMessage: string | null;
}) {
  return (
    <div className="message-list">
      {messages.length === 0 ? <div className="message-empty-state">等待输入</div> : null}
      {messages.map((message) => (
        <article className="message-bubble" data-role={message.role} key={message.id}>
          {message.toolName ? <div className="tool-name">{message.toolName}</div> : null}
          <p>{message.text}</p>
          {message.pending ? <small>pending</small> : null}
        </article>
      ))}
      {errorMessage ? <div className="thread-error">{errorMessage}</div> : null}
    </div>
  );
}

import type { ThreadListEntry } from "../protocol/threadProtocol.ts";

export function HistorySidebar({
  history,
  activeTabId,
  onOpenThread,
  onDeleteThread,
}: {
  history: ThreadListEntry[];
  activeTabId: string | null;
  onOpenThread(threadId: string): void;
  onDeleteThread(threadId: string): void;
}) {
  return (
    <aside className="thread-history-panel" aria-label="Thread history">
      <div className="thread-window-title">HandAgent</div>
      <div className="thread-history-list">
        {history.length === 0 ? <div className="thread-history-empty">暂无历史</div> : null}
        {history.map((item) => (
          <div className="thread-history-row" data-active={activeTabId === item.id} key={item.id}>
            <button className="thread-history-open" type="button" onClick={() => onOpenThread(item.id)}>
              <span>{item.preview ?? "Untitled thread"}</span>
              <small>{item.messageCount} messages</small>
            </button>
            <button
              className="icon-button"
              type="button"
              aria-label="Delete thread"
              onClick={() => onDeleteThread(item.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}

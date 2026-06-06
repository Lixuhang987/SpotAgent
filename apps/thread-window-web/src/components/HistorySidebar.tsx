import { useMemo, useState } from "react";
import type { ThreadListEntry } from "../protocol/threadProtocol.ts";

export function filterHistoryEntries(history: ThreadListEntry[], query: string): ThreadListEntry[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) {
    return history;
  }
  return history.filter((item) => {
    const preview = item.preview?.toLocaleLowerCase() ?? "";
    return item.id.toLocaleLowerCase().includes(normalized) || preview.includes(normalized);
  });
}

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
  const [query, setQuery] = useState("");
  const filteredHistory = useMemo(() => filterHistoryEntries(history, query), [history, query]);

  return (
    <aside className="thread-history-panel" aria-label="Thread history">
      <div className="thread-window-title">HandAgent</div>
      <input
        className="thread-history-search"
        type="search"
        aria-label="Search thread history"
        placeholder="Search history"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="thread-history-list">
        {filteredHistory.length === 0 ? <div className="thread-history-empty">暂无历史</div> : null}
        {filteredHistory.map((item) => (
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

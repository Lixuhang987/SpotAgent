import type { ThreadTabState } from "../store/threadWindowStore.ts";

export function TabBar({
  tabs,
  activeTabId,
  onActivate,
  onClose,
}: {
  tabs: ThreadTabState[];
  activeTabId: string | null;
  onActivate(threadId: string): void;
  onClose(threadId: string): void;
}) {
  return (
    <div className="thread-tab-bar" role="tablist">
      {tabs.map((tab) => (
        <div className="thread-tab" data-active={activeTabId === tab.threadId} key={tab.threadId}>
          <button type="button" role="tab" onClick={() => onActivate(tab.threadId)}>
            <span className="status-dot" data-status={tab.status} />
            <span className="thread-tab-title">{tab.title ?? tab.threadId}</span>
          </button>
          <button className="icon-button" type="button" aria-label="Close tab" onClick={() => onClose(tab.threadId)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

import { useMemo } from 'react';
import { createThreadWindowStore } from '../store/threadWindowStore.ts';
import { groupThreadsByWorkspace } from '../utils/groupThreads.ts';
import { cn } from '../utils/cn.ts';
import type { ThreadListEntry } from '../protocol/threadProtocol.ts';
import { WorkspaceGroup } from './WorkspaceGroup.tsx';

interface HistorySidebarProps {
  history: ThreadListEntry[];
  activeTabId: string | null;
  onOpenThread: (threadId: string) => void;
  onDeleteThread: (threadId: string) => void;
  onNewThread: () => void;
}

export function HistorySidebar({
  history,
  activeTabId,
  onOpenThread,
  onDeleteThread,
  onNewThread,
}: HistorySidebarProps) {
  const workspaces = createThreadWindowStore((state) => state.workspaces);
  const searchQuery = createThreadWindowStore((state) => state.searchQuery);
  const expandedWorkspaceIds = createThreadWindowStore((state) => state.expandedWorkspaceIds);
  const setSearchQuery = createThreadWindowStore((state) => state.setSearchQuery);
  const toggleWorkspaceExpanded = createThreadWindowStore((state) => state.toggleWorkspaceExpanded);

  const grouped = useMemo(
    () => groupThreadsByWorkspace(history, workspaces, searchQuery),
    [history, workspaces, searchQuery]
  );

  return (
    <aside className="min-h-screen border-r border-hairline bg-surface-card p-sm overflow-hidden flex flex-col">
      <header className="mb-sm">
        <div className="flex items-center gap-xs">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-ink text-canvas text-[15px] leading-none" aria-hidden="true">
            ✣
          </span>
          <h1 className="font-display text-[25px] font-normal leading-none tracking-[-0.02em] text-ink">
            HandAgent
          </h1>
        </div>
        <p className="mt-xs text-xs text-muted">
          本地 thread 工作台
        </p>
        <button
          onClick={onNewThread}
          className="mt-sm h-10 w-full rounded-md bg-primary px-sm text-sm font-medium text-on-primary transition-colors hover:bg-primary-active disabled:bg-primary-disabled disabled:text-muted"
        >
          新建对话
        </button>
      </header>

      <input
        type="search"
        placeholder="搜索对话..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="mb-sm h-10 w-full rounded-md border border-hairline bg-canvas px-sm text-sm text-ink placeholder:text-muted-soft outline-none transition-shadow focus:border-primary focus:ring-4 focus:ring-accent-ring"
      />

      {/* Workspace 分组和默认分组 */}
      <div className="flex-1 overflow-y-auto space-y-xs pr-1">
        {/* Workspace 分组 */}
        {grouped.workspaceGroups.map((group) => (
          <WorkspaceGroup
            key={group.workspace.id}
            workspace={group.workspace}
            threads={group.threads}
            activeTabId={activeTabId}
            isExpanded={expandedWorkspaceIds.has(group.workspace.id)}
            onToggle={() => toggleWorkspaceExpanded(group.workspace.id)}
            onOpenThread={onOpenThread}
            onDeleteThread={onDeleteThread}
          />
        ))}

        {/* 默认分组 - 固定在底部 */}
        {grouped.defaultGroup.length > 0 && (
          <div className="mt-md border-t border-hairline pt-sm">
            <h3 className="px-sm py-xs text-xs font-medium text-muted">
              默认对话
            </h3>
            <div className="flex flex-col gap-xs">
              {grouped.defaultGroup.map((thread) => (
                <ThreadItem
                  key={thread.id}
                  thread={thread}
                  isActive={thread.id === activeTabId}
                  onOpen={() => onOpenThread(thread.id)}
                  onDelete={() => onDeleteThread(thread.id)}
                />
              ))}
            </div>
          </div>
        )}

        {history.length === 0 && (
          <p className="rounded-md border border-hairline bg-canvas px-sm py-md text-sm text-muted">
            暂无对话历史
          </p>
        )}
      </div>
    </aside>
  );
}

// ThreadItem 组件（与 WorkspaceGroup 中的定义一致）
interface ThreadItemProps {
  thread: ThreadListEntry;
  isActive: boolean;
  onOpen: () => void;
  onDelete: () => void;
}

function ThreadItem({ thread, isActive, onOpen, onDelete }: ThreadItemProps) {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpen();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={handleKeyDown}
      className={cn(
        'grid grid-cols-[1fr_28px] items-stretch gap-xs rounded-md border transition-colors focus:outline-none focus:ring-4 focus:ring-accent-ring',
        isActive
          ? 'border-hairline bg-canvas shadow-soft'
          : 'border-transparent hover:bg-surface-soft'
      )}
    >
      <div className="min-w-0 rounded-md px-sm py-xs text-left">
        <span className="block truncate text-[13px] font-medium text-ink">
          {thread.preview || '新对话'}
        </span>
        <small className="block text-[11px] text-muted">
          {new Date(thread.updatedAt).toLocaleDateString('zh-CN')}
        </small>
      </div>
      <button
        onClick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
        className="my-auto h-[26px] w-[26px] rounded-sm text-muted transition-colors hover:bg-surface-cream-strong hover:text-ink"
        aria-label="删除对话"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" className="mx-auto">
          <path
            d="M3 3L11 11M11 3L3 11"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}

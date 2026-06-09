import { useMemo } from 'react';
import * as Accordion from '@radix-ui/react-accordion';
import { createThreadWindowStore } from '../store/threadWindowStore.ts';
import { groupThreadsByWorkspace } from '../utils/groupThreads.ts';
import { cn } from '../utils/cn.ts';
import type { ThreadListEntry } from '../protocol/threadProtocol.ts';
import { WorkspaceGroup } from './WorkspaceGroup.tsx';

interface HistorySidebarProps {
  history: ThreadListEntry[];
  activeThreadId: string | null;
  onOpenThread: (threadId: string) => void;
  onDeleteThread: (threadId: string) => void;
  onNewThread: () => void;
}

export function HistorySidebar({
  history,
  activeThreadId,
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
    <aside className="flex h-screen min-h-0 min-w-0 flex-col overflow-hidden border-r border-app-hairline bg-app-surface p-sm">
      <header className="mb-sm">
        <div className="flex items-center gap-xs">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-app-text-primary text-app-canvas text-[15px] leading-none" aria-hidden="true">
            ✣
          </span>
          <h1 className="font-display text-[25px] font-normal leading-none tracking-[-0.02em] text-app-text-primary">
            HandAgent
          </h1>
        </div>
        <p className="mt-xs text-xs text-app-text-secondary">
          本地 thread 工作台
        </p>
        <button
          onClick={onNewThread}
          className="mt-sm h-10 w-full rounded-md bg-app-accent px-sm text-sm font-medium text-app-on-accent transition-colors hover:bg-app-accent-hover disabled:bg-app-surface-muted disabled:text-app-text-secondary"
        >
          新建对话
        </button>
      </header>

      <input
        type="search"
        placeholder="搜索对话..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="mb-sm h-10 w-full rounded-md border border-app-hairline bg-app-canvas px-sm text-sm text-app-text-primary placeholder:text-app-text-muted outline-none transition-shadow focus:border-app-accent focus:ring-4 focus:ring-app-accent-ring"
      />

      {/* Workspace 分组和默认分组 */}
      <Accordion.Root
        type="multiple"
        value={Array.from(expandedWorkspaceIds)}
        className="flex-1 min-h-0 space-y-xs overflow-y-auto overflow-x-hidden pr-1"
      >
        {/* Workspace 分组 */}
        {grouped.workspaceGroups.map((group) => (
          <WorkspaceGroup
            key={group.workspace.id}
            workspace={group.workspace}
            threads={group.threads}
            activeThreadId={activeThreadId}
            isExpanded={expandedWorkspaceIds.has(group.workspace.id)}
            onToggle={() => toggleWorkspaceExpanded(group.workspace.id)}
            onOpenThread={onOpenThread}
            onDeleteThread={onDeleteThread}
          />
        ))}

        {/* 默认分组 - 固定在底部 */}
        {grouped.defaultGroup.length > 0 && (
          <div className="mt-md border-t border-app-hairline pt-sm">
            <h3 className="px-sm py-xs text-xs font-medium text-app-text-secondary">
              默认对话
            </h3>
            <div className="flex flex-col gap-xs">
              {grouped.defaultGroup.map((thread) => (
                <ThreadItem
                  key={thread.id}
                  thread={thread}
                  isActive={thread.id === activeThreadId}
                  onOpen={() => onOpenThread(thread.id)}
                  onDelete={() => onDeleteThread(thread.id)}
                />
              ))}
            </div>
          </div>
        )}

        {history.length === 0 && (
          <p className="rounded-md border border-app-hairline bg-app-canvas px-sm py-md text-sm text-app-text-secondary">
            暂无对话历史
          </p>
        )}
      </Accordion.Root>
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
        'grid grid-cols-[1fr_28px] items-stretch gap-xs rounded-md border transition-colors focus:outline-none focus:ring-4 focus:ring-app-accent-ring',
        isActive
          ? 'border-app-hairline bg-app-canvas shadow-soft'
          : 'border-transparent hover:bg-app-surface-soft'
      )}
    >
      <div className="min-w-0 rounded-md px-sm py-xs text-left">
        <span className="block truncate text-[13px] font-medium text-app-text-primary">
          {thread.preview || '新对话'}
        </span>
        <small className="block text-[11px] text-app-text-secondary">
          {new Date(thread.updatedAt).toLocaleDateString('zh-CN')}
        </small>
      </div>
      <button
        onClick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
        className="my-auto h-[26px] w-[26px] rounded-sm text-app-text-secondary transition-colors hover:bg-app-surface-muted hover:text-app-text-primary"
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

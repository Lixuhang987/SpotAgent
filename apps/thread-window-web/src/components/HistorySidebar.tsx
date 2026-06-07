import * as Accordion from '@radix-ui/react-accordion';
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
}

export function HistorySidebar({
  history,
  activeTabId,
  onOpenThread,
  onDeleteThread,
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
    <aside className="min-h-screen border-r border-border bg-surface/50 p-3.5 overflow-hidden flex flex-col">
      <header className="mb-3">
        <h1 className="text-[13px] font-semibold text-accent leading-5">
          HandAgent
        </h1>
        <button
          onClick={() => {
            // 创建空白 thread 的逻辑稍后实现
            console.log('Create new thread');
          }}
          className="mt-3 w-full h-8 rounded-lg bg-accent/10 hover:bg-accent/20 text-accent text-sm font-medium transition-colors"
        >
          新建对话
        </button>
      </header>

      <input
        type="search"
        placeholder="搜索对话..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="w-full h-[30px] px-2.5 mb-2.5 rounded-lg border border-border bg-background text-text-primary text-sm placeholder:text-text-secondary"
      />

      {/* Workspace 分组和默认分组 */}
      <div className="flex-1 overflow-y-auto space-y-1">
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
          <div className="mt-4 pt-4 border-t border-border">
            <h3 className="px-2.5 py-2 text-xs font-medium text-text-secondary">
              默认对话
            </h3>
            <div className="flex flex-col gap-1.5">
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
          <p className="px-2.5 py-4 text-sm text-text-secondary">
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
  return (
    <div
      className={cn(
        'grid grid-cols-[1fr_28px] items-center gap-1 px-2.5 py-2 rounded-lg border',
        isActive
          ? 'border-border bg-surface'
          : 'border-transparent hover:bg-surface/50'
      )}
    >
      <button
        onClick={onOpen}
        className="min-w-0 text-left flex flex-col gap-0.5"
      >
        <span className="text-[13px] text-text-primary truncate">
          {thread.preview || '新对话'}
        </span>
        <small className="text-[11px] text-text-secondary">
          {new Date(thread.updatedAt).toLocaleDateString('zh-CN')}
        </small>
      </button>
      <button
        onClick={onDelete}
        className="w-[26px] h-[26px] rounded-md hover:bg-surface text-text-secondary hover:text-text-primary transition-colors"
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

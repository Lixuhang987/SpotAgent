import * as Accordion from '@radix-ui/react-accordion';
import { useMemo } from 'react';
import { createThreadWindowStore } from '../store/threadWindowStore.ts';
import { groupThreadsByWorkspace } from '../utils/groupThreads.ts';
import { cn } from '../utils/cn.ts';
import type { ThreadListEntry } from '../protocol/threadProtocol.ts';

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

      {/* Workspace 分组和默认分组将在下一个 task 中实现 */}
      <div className="flex-1 overflow-y-auto">
        {/* 占位符 */}
      </div>
    </aside>
  );
}

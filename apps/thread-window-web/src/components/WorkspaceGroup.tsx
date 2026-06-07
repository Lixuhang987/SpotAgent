// apps/thread-window-web/src/components/WorkspaceGroup.tsx
import * as Accordion from '@radix-ui/react-accordion';
import type { ThreadListEntry } from '../protocol/threadProtocol.ts';
import { cn } from '../utils/cn.ts';

interface WorkspaceGroupProps {
  workspace: { id: string; name: string; rootPath: string };
  threads: ThreadListEntry[];
  activeTabId: string | null;
  isExpanded: boolean;
  onToggle: () => void;
  onOpenThread: (threadId: string) => void;
  onDeleteThread: (threadId: string) => void;
}

export function WorkspaceGroup({
  workspace,
  threads,
  activeTabId,
  isExpanded,
  onToggle,
  onOpenThread,
  onDeleteThread,
}: WorkspaceGroupProps) {
  return (
    <Accordion.Item value={workspace.id} className="mb-1.5">
      <Accordion.Header>
        <Accordion.Trigger
          onClick={onToggle}
          className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-surface text-left text-sm text-text-primary"
        >
          <span className="font-medium truncate">{workspace.name}</span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            className={cn(
              'transition-transform text-text-secondary',
              isExpanded && 'rotate-180'
            )}
          >
            <path
              d="M3 5L6 8L9 5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
        </Accordion.Trigger>
      </Accordion.Header>
      <Accordion.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
        <div className="flex flex-col gap-1.5 pt-1">
          {threads.length === 0 ? (
            <p className="px-2.5 py-2 text-xs text-text-secondary">
              暂无对话
            </p>
          ) : (
            threads.map((thread) => (
              <ThreadItem
                key={thread.id}
                thread={thread}
                isActive={thread.id === activeTabId}
                onOpen={() => onOpenThread(thread.id)}
                onDelete={() => onDeleteThread(thread.id)}
              />
            ))
          )}
        </div>
      </Accordion.Content>
    </Accordion.Item>
  );
}

// ThreadItem 组件
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

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
    <Accordion.Item value={workspace.id} className="mb-xs">
      <Accordion.Header>
        <Accordion.Trigger
          onClick={onToggle}
          className="flex w-full items-center justify-between rounded-md px-sm py-xs text-left text-sm text-app-text-primary transition-colors hover:bg-app-surface-soft"
        >
          <span className="min-w-0">
            <span className="block truncate font-medium">{workspace.name}</span>
            <span className="block truncate text-[11px] text-app-text-secondary">{workspace.rootPath}</span>
          </span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            className={cn(
              'ml-xs flex-shrink-0 text-app-text-secondary transition-transform',
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
        <div className="flex flex-col gap-xs pt-xs">
          {threads.length === 0 ? (
            <p className="px-sm py-xs text-xs text-app-text-secondary">
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

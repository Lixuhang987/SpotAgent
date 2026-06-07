import type { ThreadTabState } from '../store/threadWindowStore.ts';
import { cn } from '../utils/cn.ts';

interface TabBarProps {
  tabs: ThreadTabState[];
  activeTabId: string | null;
  onActivate: (threadId: string) => void;
  onClose: (threadId: string) => void;
}

export function TabBar({ tabs, activeTabId, onActivate, onClose }: TabBarProps) {
  return (
    <div className="flex gap-2 min-w-0 overflow-x-auto">
      {tabs.map((tab) => (
        <div
          key={tab.threadId}
          className={cn(
            'flex-shrink-0 flex-grow-0 basis-[220px] min-w-[140px] grid grid-cols-[1fr_28px] items-center gap-1 rounded-lg border px-2 py-1.5',
            tab.threadId === activeTabId
              ? 'border-border bg-surface'
              : 'border-transparent bg-surface/50'
          )}
        >
          <button
            onClick={() => onActivate(tab.threadId)}
            className="min-w-0 flex items-center gap-2 text-left"
          >
            {/* 状态点 */}
            <span
              className={cn(
                'w-2 h-2 rounded-full flex-shrink-0',
                tab.status === 'running' && 'bg-green-500',
                tab.status === 'failed' && 'bg-error',
                tab.status === 'interrupted' && 'bg-yellow-500',
                tab.status === 'idle' && 'bg-text-secondary'
              )}
            />
            <span className="text-sm text-text-primary truncate">
              {tab.title ?? tab.threadId.slice(0, 8)}
            </span>
          </button>
          <button
            onClick={() => onClose(tab.threadId)}
            className="w-[26px] h-[26px] rounded-md hover:bg-surface text-text-secondary hover:text-text-primary transition-colors"
            aria-label="关闭 tab"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" className="mx-auto">
              <path
                d="M3 3L9 9M9 3L3 9"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}

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
    <div className="flex min-w-0 gap-xs overflow-x-auto">
      {tabs.map((tab) => (
        <div
          key={tab.threadId}
          className={cn(
            'grid flex-shrink-0 flex-grow-0 basis-[230px] grid-cols-[1fr_28px] items-center gap-xs rounded-md border px-xs py-xs transition-colors',
            tab.threadId === activeTabId
              ? 'border-white/15 bg-surface-dark-elevated shadow-product-inner'
              : 'border-transparent bg-surface-dark-soft text-on-dark-soft hover:bg-surface-dark-elevated'
          )}
        >
          <button
            onClick={() => onActivate(tab.threadId)}
            className="flex min-w-0 items-center gap-xs text-left"
          >
            {/* 状态点 */}
            <span
              className={cn(
                'h-2 w-2 flex-shrink-0 rounded-full',
                tab.status === 'running' && 'bg-success',
                tab.status === 'failed' && 'bg-error',
                tab.status === 'interrupted' && 'bg-warning',
                tab.status === 'idle' && 'bg-on-dark-soft'
              )}
            />
            <span className="truncate text-sm font-medium text-on-dark">
              {tab.title ?? tab.threadId.slice(0, 8)}
            </span>
          </button>
          <button
            onClick={() => onClose(tab.threadId)}
            className="h-[26px] w-[26px] rounded-sm text-on-dark-soft transition-colors hover:bg-white/10 hover:text-on-dark"
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

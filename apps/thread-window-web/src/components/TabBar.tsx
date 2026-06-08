import type { ThreadTabState } from '../store/threadWindowStore.ts';
import { cn } from '../utils/cn.ts';

interface TabBarProps {
  tabs: ThreadTabState[];
  activeTabId: string | null;
  onActivate: (threadId: string) => void;
  onClose: (threadId: string) => void;
}

export function TabBar({ tabs, activeTabId, onActivate, onClose }: TabBarProps) {
  if (tabs.length === 0) {
    return null;
  }

  return (
    <div className="flex h-full w-full max-w-full min-w-0 items-end gap-1 overflow-x-auto overflow-y-hidden px-xs">
      {tabs.map((tab) => {
        const isActive = tab.threadId === activeTabId;

        return (
          <div
            key={tab.threadId}
            className={cn(
              'group relative flex min-w-[120px] max-w-[180px] flex-shrink-0 items-center gap-xs rounded-t-lg px-sm py-xs transition-colors',
              // GPT 浏览器风格：活跃 tab 与内容区融合
              isActive
                ? 'bg-surface-dark text-on-dark'
                : 'bg-surface-dark-soft text-on-dark-soft hover:bg-surface-dark-elevated'
            )}
          >
            <button
              onClick={() => onActivate(tab.threadId)}
              className="flex min-w-0 flex-1 items-center gap-xs text-left"
            >
              {/* 去除状态点，使用更简洁的视觉 */}
              <span className="truncate text-sm font-medium">
                {tab.title ?? tab.threadId.slice(0, 8)}
              </span>
            </button>

            {/* 关闭按钮 - hover 时显示 */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose(tab.threadId);
              }}
              className={cn(
                'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-sm transition-opacity hover:bg-white/10',
                isActive ? 'opacity-0 group-hover:opacity-100' : 'opacity-0 group-hover:opacity-100'
              )}
              aria-label="关闭 tab"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" className="text-on-dark-soft">
                <path
                  d="M2 2L8 8M8 2L2 8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        );
      })}

      {/* 新建 tab 按钮 */}
      <button
        onClick={() => {
          // 触发新建会话（通过 parent 组件处理）
          console.log('新建 tab 按钮点击');
        }}
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-on-dark-soft transition-colors hover:bg-surface-dark-elevated"
        title="新建 tab"
      >
        <svg width="16" height="16" viewBox="0 0 16 16">
          <path
            d="M8 3V13M3 8H13"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}

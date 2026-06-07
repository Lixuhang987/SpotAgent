// apps/thread-window-web/src/utils/groupThreads.ts
import type { ThreadMetadata } from '../store/threadWindowStore.ts';

export interface GroupedThreads {
  workspaceGroups: Array<{
    workspace: { id: string; name: string; rootPath: string };
    threads: ThreadMetadata[];
  }>;
  defaultGroup: ThreadMetadata[];
}

export function groupThreadsByWorkspace(
  threads: ThreadMetadata[],
  workspaces: Array<{ id: string; name: string; rootPath: string }>,
  searchQuery: string
): GroupedThreads {
  // 过滤搜索
  const filtered = searchQuery
    ? threads.filter(t =>
        t.preview?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : threads;

  // 按 workspaceId 分组
  const grouped = new Map<string | null, ThreadMetadata[]>();
  for (const thread of filtered) {
    const key = thread.workspaceId ?? null;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(thread);
  }

  return {
    workspaceGroups: workspaces.map(ws => ({
      workspace: ws,
      threads: grouped.get(ws.id) ?? [],
    })),
    defaultGroup: grouped.get(null) ?? [],
  };
}

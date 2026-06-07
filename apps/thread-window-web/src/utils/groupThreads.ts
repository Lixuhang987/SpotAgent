// apps/thread-window-web/src/utils/groupThreads.ts
import type { ThreadListEntry } from '../protocol/threadProtocol.ts';

export interface GroupedThreads {
  workspaceGroups: Array<{
    workspace: { id: string; name: string; rootPath: string };
    threads: ThreadListEntry[];
  }>;
  defaultGroup: ThreadListEntry[];
}

export function groupThreadsByWorkspace(
  threads: ThreadListEntry[],
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
  const grouped = new Map<string | null, ThreadListEntry[]>();
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

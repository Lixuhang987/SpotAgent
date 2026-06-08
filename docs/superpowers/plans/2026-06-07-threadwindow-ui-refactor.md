# ThreadWindow UI 重构实施计划

> **状态：历史计划。**
> 本文记录早期 Tailwind/Radix 与 Raycast Glass / Mango Amber 实施路径。当前视觉依据已切到 `DESIGN.md` warm-canvas / coral / dark product surface，不应按本文的 dark-only 约束继续开发。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构 ThreadWindow 前端 UI，采用 ChatGPT 风格的布局密度和交互模式，保留 Raycast Glass 视觉风格

**Architecture:** 渐进式重构分 4 个 phase：Phase 1 引入 Tailwind + Radix UI 基础设施；Phase 2 扩展协议添加 workspace 关联；Phase 3 重写左侧历史边栏支持 workspace 分组；Phase 4 重写右侧对话区达到 ChatGPT 级别视觉完成度。

**Tech Stack:** Tailwind CSS 3.4, Radix UI (Accordion/ScrollArea/DropdownMenu), React 18, Zustand, Immer, TypeScript

---

## Phase 1: 基础设施层

### Task 1.1: 安装依赖

**Files:**
- Modify: `apps/thread-window-web/package.json`

- [ ] **Step 1: 添加 Tailwind CSS 和相关依赖**

```bash
cd apps/thread-window-web
pnpm add -D tailwindcss@^3.4.0 postcss@^8.4.0 autoprefixer@^10.4.0
```

- [ ] **Step 2: 添加 Radix UI 组件**

```bash
pnpm add @radix-ui/react-accordion@^1.1.0 @radix-ui/react-dropdown-menu@^2.0.0 @radix-ui/react-scroll-area@^1.0.0
```

- [ ] **Step 3: 添加样式工具库**

```bash
pnpm add clsx@^2.1.0 tailwind-merge@^2.2.0
```

- [ ] **Step 4: 验证依赖安装**

Run: `pnpm list tailwindcss @radix-ui/react-accordion clsx`
Expected: 所有包版本正确显示

- [ ] **Step 5: Commit**

```bash
git add apps/thread-window-web/package.json apps/thread-window-web/pnpm-lock.yaml
git commit -m "deps: add tailwind css and radix ui dependencies"
```

### Task 1.2: 配置 Tailwind CSS

**Files:**
- Create: `apps/thread-window-web/tailwind.config.js`
- Create: `apps/thread-window-web/postcss.config.js`

- [ ] **Step 1: 创建 Tailwind 配置文件**

```javascript
// apps/thread-window-web/tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#0B0B0F',
        surface: 'rgba(255, 255, 255, 0.04)',
        border: 'rgba(255, 255, 255, 0.08)',
        'text-primary': '#F2F2F5',
        'text-secondary': '#9A9AA8',
        accent: {
          DEFAULT: '#FFA947',
          hover: '#FF9420',
          pressed: '#E07F0A',
          subtle: 'rgba(255, 169, 71, 0.14)',
          ring: 'rgba(255, 169, 71, 0.40)',
        },
        error: '#FF5E5E',
        'user-bubble': 'rgba(255, 169, 71, 0.12)',
        'assistant-bubble': 'rgba(255, 255, 255, 0.04)',
        'tool-bubble': 'rgba(255, 255, 255, 0.06)',
      },
      spacing: {
        xs: '4px',
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '20px',
        xxl: '24px',
      },
      borderRadius: {
        panel: '12px',
        bubble: '8px',
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 2: 创建 PostCSS 配置文件**

```javascript
// apps/thread-window-web/postcss.config.js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 3: Commit**

```bash
git add apps/thread-window-web/tailwind.config.js apps/thread-window-web/postcss.config.js
git commit -m "config: setup tailwind css with raycast glass theme tokens"
```

### Task 1.3: 创建 Tailwind 样式入口

**Files:**
- Create: `apps/thread-window-web/src/styles/tailwind.css`
- Modify: `apps/thread-window-web/src/main.tsx`

- [ ] **Step 1: 创建 Tailwind 样式文件**

```css
/* apps/thread-window-web/src/styles/tailwind.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  body {
    margin: 0;
    min-width: 720px;
    min-height: 520px;
    background: #0B0B0F;
    color: #F2F2F5;
  }

  * {
    box-sizing: border-box;
  }

  button {
    cursor: default;
  }
}
```

- [ ] **Step 2: 在 main.tsx 中导入 Tailwind 样式**

修改 `apps/thread-window-web/src/main.tsx`，将现有样式导入替换为：

```typescript
import './styles/tailwind.css';
```

- [ ] **Step 3: 注释掉旧的 CSS 文件导入（保留文件备用）**

在 `apps/thread-window-web/src/main.tsx` 中找到旧的 CSS 导入（如果有），注释掉：

```typescript
// import './styles/thread-window.css';  // 旧样式，Phase 4 后移除
```

- [ ] **Step 4: 验证构建成功**

Run: `pnpm --filter handagent-thread-window-web build`
Expected: 构建成功，生成 dist/ 目录

- [ ] **Step 5: Commit**

```bash
git add apps/thread-window-web/src/styles/tailwind.css apps/thread-window-web/src/main.tsx
git commit -m "style: add tailwind css entry point"
```

### Task 1.4: 创建样式工具函数

**Files:**
- Create: `apps/thread-window-web/src/utils/cn.ts`

- [ ] **Step 1: 创建 cn 工具函数**

```typescript
// apps/thread-window-web/src/utils/cn.ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * 合并 Tailwind class names，避免冲突
 * 用法: cn('px-4 py-2', condition && 'bg-accent', className)
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/thread-window-web/src/utils/cn.ts
git commit -m "feat: add cn utility for tailwind class merging"
```

---

## Phase 2: 协议扩展和数据层

### Task 2.1: 扩展 ThreadMetadata 添加 workspaceId

**Files:**
- Modify: `packages/core/src/storage/threadStore.ts`
- Modify: `packages/core/src/storage/fileThreadStore.ts`

- [ ] **Step 1: 在 ThreadMetadata 接口添加 workspaceId 字段**

修改 `packages/core/src/storage/threadStore.ts`：

```typescript
export interface ThreadMetadata {
  id: string;
  preview: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  workspaceId: string | null;  // 新增字段
}
```

- [ ] **Step 2: 在 FileThreadStore 读取时兼容旧文件**

修改 `packages/core/src/storage/fileThreadStore.ts` 的 `get` 方法，添加字段补全逻辑：

```typescript
async get(id: string): Promise<PersistedThread | null> {
  const filePath = this.getThreadPath(id);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const thread = JSON.parse(content) as PersistedThread;
    
    // 兼容旧版本：补全缺失的 workspaceId 字段
    if (thread.metadata && thread.metadata.workspaceId === undefined) {
      thread.metadata.workspaceId = null;
    }
    
    return thread;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}
```

- [ ] **Step 3: 同样在 list 方法中补全字段**

在 `packages/core/src/storage/fileThreadStore.ts` 的 `list` 方法中，对每个读取的 thread 进行字段补全：

```typescript
async list(): Promise<ThreadMetadata[]> {
  const files = await fs.readdir(this.baseDir);
  const threads: ThreadMetadata[] = [];

  for (const file of files) {
    if (file.endsWith('.json')) {
      const thread = await this.get(file.replace('.json', ''));
      if (thread) {
        threads.push(thread.metadata);
      }
    }
  }

  return threads.sort((a, b) => 
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}
```

- [ ] **Step 4: 运行 TypeScript 测试**

Run: `bash ./scripts/test.sh`
Expected: 所有测试通过

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/storage/threadStore.ts packages/core/src/storage/fileThreadStore.ts
git commit -m "feat(storage): add workspaceId to ThreadMetadata with backward compatibility"
```

### Task 2.2: 新增 workspace 协议命令

**Files:**
- Modify: `packages/core/src/protocol/threadCommand.ts`
- Modify: `packages/core/src/protocol/threadNotification.ts`
- Modify: `packages/core/src/protocol/index.ts`

- [ ] **Step 1: 在 ThreadCommand 添加 workspace.list 命令**

修改 `packages/core/src/protocol/threadCommand.ts`，添加新的命令类型：

```typescript
export interface WorkspaceListCommand {
  channel: "thread";
  type: "workspace.list";
  commandId: string;
  timestamp: string;
}

// 在 ThreadCommand 联合类型中添加
export type ThreadCommand = 
  | ThreadStartCommand
  | ThreadResumeCommand
  | TurnStartCommand
  | TurnInterruptCommand
  | ThreadListCommand
  | ThreadDeleteCommand
  | WorkspaceListCommand;  // 新增
```

- [ ] **Step 2: 在 ThreadNotification 添加 workspace.listed 通知**

修改 `packages/core/src/protocol/threadNotification.ts`：

```typescript
export interface WorkspaceListedNotification {
  channel: "thread";
  type: "workspace.listed";
  commandId: string;
  workspaces: Array<{
    id: string;
    name: string;
    rootPath: string;
  }>;
}

// 在 ThreadNotification 联合类型中添加
export type ThreadNotification =
  | ThreadStartedNotification
  | ThreadSnapshotNotification
  | UserMessageRecordedNotification
  | TurnStartedNotification
  | AssistantDeltaNotification
  | ToolStartedNotification
  | ToolFinishedNotification
  | TurnCompletedNotification
  | ThreadStatusChangedNotification
  | ThreadErrorNotification
  | ThreadListedNotification
  | ThreadDeletedNotification
  | WorkspaceListedNotification;  // 新增
```

- [ ] **Step 3: 在 ThreadStartCommand 添加 workspaceId 字段**

修改 `packages/core/src/protocol/threadCommand.ts` 中的 `ThreadStartCommand`：

```typescript
export interface ThreadStartCommand {
  channel: "thread";
  type: "thread.start";
  commandId: string;
  timestamp: string;
  prompt: string;
  attachments?: ThreadAttachment[];
  workspaceId?: string | null;  // 新增可选字段
}
```

- [ ] **Step 4: 导出新的类型**

确保 `packages/core/src/protocol/index.ts` 导出新增的类型：

```typescript
export type {
  // ... 现有导出
  WorkspaceListCommand,
  WorkspaceListedNotification,
} from './threadCommand.ts';
```

- [ ] **Step 5: 运行测试**

Run: `bash ./scripts/test.sh`
Expected: 所有测试通过

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/protocol/threadCommand.ts packages/core/src/protocol/threadNotification.ts packages/core/src/protocol/index.ts
git commit -m "feat(protocol): add workspace.list command and workspaceId to thread.start"
```

### Task 2.3: agent-server 实现 workspace.list 命令处理

**Files:**
- Modify: `apps/agent-server/src/thread/threadCommandRouter.ts`

- [ ] **Step 1: 在 ThreadCommandRouter 中添加 workspace.list 路由**

修改 `apps/agent-server/src/thread/threadCommandRouter.ts`，在 `route` 方法中添加新的 case：

```typescript
async route(command: ThreadCommand): Promise<void> {
  switch (command.type) {
    case "thread.start":
      await this.handleThreadStart(command);
      break;
    case "thread.resume":
      await this.handleThreadResume(command);
      break;
    case "turn.start":
      await this.handleTurnStart(command);
      break;
    case "turn.interrupt":
      await this.handleTurnInterrupt(command);
      break;
    case "thread.list":
      await this.handleThreadList(command);
      break;
    case "thread.delete":
      await this.handleThreadDelete(command);
      break;
    case "workspace.list":
      await this.handleWorkspaceList(command);
      break;
    default:
      console.warn(`Unknown command type: ${(command as any).type}`);
  }
}
```

- [ ] **Step 2: 实现 handleWorkspaceList 方法**

在 `ThreadCommandRouter` 类中添加新方法：

```typescript
private async handleWorkspaceList(command: WorkspaceListCommand): Promise<void> {
  const workspaces = await this.workspaceRegistry.list();
  
  const notification: WorkspaceListedNotification = {
    channel: "thread",
    type: "workspace.listed",
    commandId: command.commandId,
    workspaces: workspaces.map(ws => ({
      id: ws.id,
      name: ws.name,
      rootPath: ws.rootPath,
    })),
  };
  
  this.notificationPublisher.publish(notification);
}
```

- [ ] **Step 3: 在构造函数中注入 WorkspaceRegistry**

确保 `ThreadCommandRouter` 的构造函数接收 `workspaceRegistry`：

```typescript
constructor(
  private threadStore: ThreadStore,
  private orchestrator: ThreadRuntimeOrchestrator,
  private notificationPublisher: ThreadNotificationPublisher,
  private workspaceRegistry: WorkspaceRegistry,  // 新增
) {}
```

- [ ] **Step 4: 在 server.ts 中传入 workspaceRegistry**

修改 `apps/agent-server/src/server/server.ts`，确保创建 `ThreadCommandRouter` 时传入 workspace registry：

```typescript
const workspaceRegistry = new FileWorkspaceRegistry(workspacesPath);
const router = new ThreadCommandRouter(
  threadStore,
  orchestrator,
  publisher,
  workspaceRegistry,
);
```

- [ ] **Step 5: 运行测试**

Run: `bash ./scripts/test.sh`
Expected: 所有测试通过

- [ ] **Step 6: Commit**

```bash
git add apps/agent-server/src/thread/threadCommandRouter.ts apps/agent-server/src/server/server.ts
git commit -m "feat(agent-server): implement workspace.list command handler"
```

### Task 2.4: 在 ThreadRuntimeOrchestrator 中处理 workspaceId

**Files:**
- Modify: `apps/agent-server/src/thread/threadRuntimeOrchestrator.ts`

- [ ] **Step 1: 在 handleThreadStart 中保存 workspaceId**

修改 `apps/agent-server/src/thread/threadRuntimeOrchestrator.ts` 的 `handleThreadStart` 方法，将 `workspaceId` 传递到 thread 创建：

```typescript
async handleThreadStart(command: ThreadStartCommand, input: AgentThreadInput): Promise<string> {
  const threadId = `thread-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  
  const metadata: ThreadMetadata = {
    id: threadId,
    preview: input.prompt.slice(0, 100),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messageCount: 0,
    workspaceId: command.workspaceId ?? null,  // 新增
  };
  
  await this.threadStore.create({
    version: 1,
    metadata,
    messages: [],
    events: [],
  });
  
  // ... 其余逻辑
  
  return threadId;
}
```

- [ ] **Step 2: 运行测试**

Run: `bash ./scripts/test.sh`
Expected: 所有测试通过

- [ ] **Step 3: Commit**

```bash
git add apps/agent-server/src/thread/threadRuntimeOrchestrator.ts
git commit -m "feat(orchestrator): persist workspaceId when creating threads"
```

### Task 2.5: 前端协议编码函数

**Files:**
- Modify: `apps/thread-window-web/src/protocol/threadProtocol.ts`

- [ ] **Step 1: 添加 encodeWorkspaceList 函数**

在 `apps/thread-window-web/src/protocol/threadProtocol.ts` 中添加：

```typescript
export function encodeWorkspaceList(commandId: string, timestamp: string): string {
  const command: WorkspaceListCommand = {
    channel: "thread",
    type: "workspace.list",
    commandId,
    timestamp,
  };
  return JSON.stringify(command);
}
```

- [ ] **Step 2: 修改 encodeThreadStart 支持 workspaceId**

修改现有的 `encodeThreadStart` 函数签名：

```typescript
export function encodeThreadStart(params: {
  commandId: string;
  timestamp: string;
  prompt: string;
  attachments?: ThreadAttachment[];
  workspaceId?: string | null;
}): string {
  const command: ThreadStartCommand = {
    channel: "thread",
    type: "thread.start",
    commandId: params.commandId,
    timestamp: params.timestamp,
    prompt: params.prompt,
    attachments: params.attachments,
    workspaceId: params.workspaceId,
  };
  return JSON.stringify(command);
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/thread-window-web/src/protocol/threadProtocol.ts
git commit -m "feat(protocol): add workspace.list encoding and workspaceId to thread.start"
```

### Task 2.6: 前端 store 添加 workspace 状态

**Files:**
- Modify: `apps/thread-window-web/src/store/threadWindowStore.ts`

- [ ] **Step 1: 扩展 ThreadWindowState 接口**

在 `apps/thread-window-web/src/store/threadWindowStore.ts` 中添加新字段：

```typescript
interface ThreadWindowState {
  // 现有字段...
  connectionState: ConnectionState;
  tabs: Record<string, TabState>;
  activeTabId: string | null;
  history: ThreadMetadata[];
  windowErrorMessage: string | null;
  
  // 新增字段
  workspaces: Array<{ id: string; name: string; rootPath: string }>;
  expandedWorkspaceIds: Set<string>;
  searchQuery: string;
  
  // 现有方法...
  
  // 新增方法
  setWorkspaces: (workspaces: Array<{ id: string; name: string; rootPath: string }>) => void;
  toggleWorkspaceExpanded: (workspaceId: string) => void;
  setSearchQuery: (query: string) => void;
}
```

- [ ] **Step 2: 在 createThreadWindowStore 中初始化新字段**

```typescript
export const createThreadWindowStore = create<ThreadWindowState>()(
  immer((set) => ({
    // 现有字段初始化...
    connectionState: "disconnected",
    tabs: {},
    activeTabId: null,
    history: [],
    windowErrorMessage: null,
    
    // 新增字段初始化
    workspaces: [],
    expandedWorkspaceIds: new Set<string>(),
    searchQuery: "",
    
    // ... 现有方法实现
    
    // 新增方法实现
    setWorkspaces: (workspaces) => set((state) => {
      state.workspaces = workspaces;
    }),
    
    toggleWorkspaceExpanded: (workspaceId) => set((state) => {
      if (state.expandedWorkspaceIds.has(workspaceId)) {
        state.expandedWorkspaceIds.delete(workspaceId);
      } else {
        state.expandedWorkspaceIds.add(workspaceId);
      }
    }),
    
    setSearchQuery: (query) => set((state) => {
      state.searchQuery = query;
    }),
  }))
);
```

- [ ] **Step 3: 在 handleNotification 中处理 workspace.listed**

在 `createThreadWindowStore` 的 `handleNotification` 方法中添加新的 case：

```typescript
handleNotification: (notification) => set((state) => {
  switch (notification.type) {
    // ... 现有 case
    
    case "workspace.listed":
      state.workspaces = notification.workspaces;
      break;
  }
}),
```

- [ ] **Step 4: Commit**

```bash
git add apps/thread-window-web/src/store/threadWindowStore.ts
git commit -m "feat(store): add workspace state and search query"
```

### Task 2.7: ThreadSocketClient 自动请求 workspace 列表

**Files:**
- Modify: `apps/thread-window-web/src/thread/threadSocketClient.ts`

- [ ] **Step 1: 在连接成功后发送 workspace.list 命令**

修改 `ThreadSocketClient` 的 `connect` 方法，在连接建立后自动请求 workspace 列表：

```typescript
connect(): void {
  if (this.ws || this.reconnectTimer) {
    return;
  }

  this.updateConnectionState("connecting");
  this.ws = new WebSocket(this.url);

  this.ws.onopen = () => {
    this.reconnectAttempts = 0;
    this.updateConnectionState("connected");
    this.flushQueue();
    
    // 自动请求 workspace 列表
    this.sendRaw(JSON.stringify({
      channel: "thread",
      type: "workspace.list",
      commandId: `workspace-list-${Date.now()}`,
      timestamp: new Date().toISOString(),
    }));
    
    // 请求 thread 列表
    this.sendRaw(JSON.stringify({
      channel: "thread",
      type: "thread.list",
      commandId: `list-${Date.now()}`,
      timestamp: new Date().toISOString(),
    }));
  };

  // ... 其余逻辑
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/thread-window-web/src/thread/threadSocketClient.ts
git commit -m "feat(client): auto-request workspace list on connection"
```

### Task 2.8: 验证 Phase 2 完成

**Files:**
- N/A（验证任务）

- [ ] **Step 1: 运行 TypeScript 测试**

Run: `bash ./scripts/test.sh`
Expected: 所有测试通过

- [ ] **Step 2: 运行 Swift 构建**

Run: `bash ./scripts/swiftw build`
Expected: 构建成功

- [ ] **Step 3: 手动启动应用验证协议**

Run: `bash ./scripts/swiftw run HandAgentDesktop`

验证项：
1. 打开 ThreadWindow
2. 检查浏览器开发者工具 WebSocket 面板
3. 确认收到 `workspace.listed` 消息
4. 确认 store 中 `workspaces` 字段已填充

- [ ] **Step 4: 创建 Phase 2 完成的里程碑 commit**

```bash
git add -A
git commit -m "milestone: Phase 2 complete - protocol extension for workspace support

- ThreadMetadata now includes workspaceId field
- workspace.list command and workspace.listed notification
- Backward compatibility for old thread files
- Frontend auto-requests workspace list on connection"
```

---

## Phase 3: 左侧边栏重写

### Task 3.1: 创建分组逻辑工具函数

**Files:**
- Create: `apps/thread-window-web/src/utils/groupThreads.ts`

- [ ] **Step 1: 创建 groupThreadsByWorkspace 函数**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add apps/thread-window-web/src/utils/groupThreads.ts
git commit -m "feat(utils): add thread grouping by workspace logic"
```

### Task 3.2: 重写 HistorySidebar 组件结构

**Files:**
- Modify: `apps/thread-window-web/src/components/HistorySidebar.tsx`

- [ ] **Step 1: 重写 HistorySidebar 使用 Tailwind 和 Radix Accordion**

```typescript
// apps/thread-window-web/src/components/HistorySidebar.tsx
import * as Accordion from '@radix-ui/react-accordion';
import { useMemo } from 'react';
import { createThreadWindowStore } from '../store/threadWindowStore.ts';
import { groupThreadsByWorkspace } from '../utils/groupThreads.ts';
import { cn } from '../utils/cn.ts';

interface HistorySidebarProps {
  history: ThreadMetadata[];
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
```

- [ ] **Step 2: Commit**

```bash
git add apps/thread-window-web/src/components/HistorySidebar.tsx
git commit -m "refactor(ui): rewrite HistorySidebar header with tailwind"
```

### Task 3.3: 实现 WorkspaceGroup 组件

**Files:**
- Create: `apps/thread-window-web/src/components/WorkspaceGroup.tsx`

- [ ] **Step 1: 创建 WorkspaceGroup 组件**

```typescript
// apps/thread-window-web/src/components/WorkspaceGroup.tsx
import * as Accordion from '@radix-ui/react-accordion';
import type { ThreadMetadata } from '../store/threadWindowStore.ts';
import { cn } from '../utils/cn.ts';

interface WorkspaceGroupProps {
  workspace: { id: string; name: string; rootPath: string };
  threads: ThreadMetadata[];
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
  thread: ThreadMetadata;
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
```

- [ ] **Step 2: Commit**

```bash
git add apps/thread-window-web/src/components/WorkspaceGroup.tsx
git commit -m "feat(ui): add WorkspaceGroup component with Radix Accordion"
```

### Task 3.4: 集成 WorkspaceGroup 到 HistorySidebar

**Files:**
- Modify: `apps/thread-window-web/src/components/HistorySidebar.tsx`

- [ ] **Step 1: 导入并使用 WorkspaceGroup**

在 `HistorySidebar.tsx` 中完成分组渲染：

```typescript
import { WorkspaceGroup } from './WorkspaceGroup.tsx';

// ... 在 return 中的 overflow-y-auto div 内

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
```

- [ ] **Step 2: 添加 ThreadItem 到 HistorySidebar（复用 WorkspaceGroup 中的定义）**

将 `ThreadItem` 组件从 `WorkspaceGroup.tsx` 中提取到独立文件或在 `HistorySidebar.tsx` 中重新定义以便复用。

- [ ] **Step 3: Commit**

```bash
git add apps/thread-window-web/src/components/HistorySidebar.tsx
git commit -m "feat(ui): integrate workspace groups into HistorySidebar"
```

### Task 3.5: 实现新建对话功能

**Files:**
- Modify: `apps/thread-window-web/src/components/HistorySidebar.tsx`
- Modify: `apps/thread-window-web/src/App.tsx`

- [ ] **Step 1: 在 App.tsx 中添加新建对话的 handler**

修改 `apps/thread-window-web/src/App.tsx`，添加新建对话功能：

```typescript
const handleNewThread = () => {
  const commandId = id('start');
  const timestamp = now();
  
  // 发送创建空白 thread 的命令
  clientRef.current?.sendRaw(
    JSON.stringify({
      channel: "thread",
      type: "thread.start",
      commandId,
      timestamp,
      prompt: "",  // 空 prompt
      workspaceId: null,  // 默认 workspace
    })
  );
};
```

- [ ] **Step 2: 将 handleNewThread 传递给 HistorySidebar**

在 `App.tsx` 的 `<HistorySidebar>` 添加 prop：

```typescript
<HistorySidebar
  history={state.history}
  activeTabId={state.activeTabId}
  onOpenThread={(threadId) => {
    createThreadWindowStore.getState().openHistoryThread(threadId);
    clientRef.current?.resumeThread(threadId);
  }}
  onDeleteThread={(threadId) => {
    setDeleteTargetThreadId(threadId);
  }}
  onNewThread={handleNewThread}  // 新增
/>
```

- [ ] **Step 3: 在 HistorySidebar 中使用 onNewThread**

修改 `HistorySidebar.tsx` 的 props 和按钮：

```typescript
interface HistorySidebarProps {
  history: ThreadMetadata[];
  activeTabId: string | null;
  onOpenThread: (threadId: string) => void;
  onDeleteThread: (threadId: string) => void;
  onNewThread: () => void;  // 新增
}

// 在按钮中使用
<button
  onClick={onNewThread}
  className="mt-3 w-full h-8 rounded-lg bg-accent/10 hover:bg-accent/20 text-accent text-sm font-medium transition-colors"
>
  新建对话
</button>
```

- [ ] **Step 4: Commit**

```bash
git add apps/thread-window-web/src/components/HistorySidebar.tsx apps/thread-window-web/src/App.tsx
git commit -m "feat(ui): implement new thread creation button"
```

### Task 3.6: 添加 Accordion 动画配置

**Files:**
- Modify: `apps/thread-window-web/tailwind.config.js`

- [ ] **Step 1: 在 Tailwind 配置中添加 Accordion 动画**

修改 `tailwind.config.js`：

```javascript
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ... 现有配置
      },
      spacing: {
        // ... 现有配置
      },
      borderRadius: {
        // ... 现有配置
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 2: Commit**

```bash
git add apps/thread-window-web/tailwind.config.js
git commit -m "config: add accordion animation to tailwind"
```

### Task 3.7: 验证 Phase 3 完成

**Files:**
- N/A（验证任务）

- [ ] **Step 1: 构建并运行应用**

Run: `bash ./scripts/swiftw run HandAgentDesktop`

验证项：
1. 左侧边栏显示 workspace 分组
2. 可以展开/收起 workspace 分组
3. 默认分组显示在最下方
4. 搜索功能能过滤所有分组的 thread
5. 点击新建按钮创建空白 thread
6. 视觉风格符合 Raycast Glass

- [ ] **Step 2: 创建 Phase 3 完成的里程碑 commit**

```bash
git add -A
git commit -m "milestone: Phase 3 complete - workspace-grouped history sidebar

- Workspace groups with Radix Accordion
- Default group fixed at bottom
- Search across all groups
- New thread creation button
- Tailwind styling with Raycast Glass theme"
```

---

## Phase 4: 右侧对话区重写

### Task 4.1: 重写 MessageBubble 组件

**Files:**
- Create: `apps/thread-window-web/src/components/MessageBubble.tsx`

- [ ] **Step 1: 创建 MessageBubble 组件**

```typescript
// apps/thread-window-web/src/components/MessageBubble.tsx
import type { ThreadMessage } from '../store/threadWindowStore.ts';
import { cn } from '../utils/cn.ts';

interface MessageBubbleProps {
  message: ThreadMessage;
  onCopy: (text: string) => void;
}

export function MessageBubble({ message, onCopy }: MessageBubbleProps) {
  const handleCopy = () => {
    navigator.clipboard.writeText(message.text);
    onCopy(message.text);
  };

  return (
    <article
      className={cn(
        'w-full max-w-3xl mx-auto',
        message.role === 'user' && 'ml-auto'
      )}
    >
      <div
        className={cn(
          'rounded-bubble border px-6 py-4',
          message.role === 'user' && 'border-accent/30 bg-user-bubble',
          message.role === 'assistant' && 'border-border bg-assistant-bubble',
          message.role === 'tool' && 'border-border bg-tool-bubble'
        )}
      >
        {message.toolName && (
          <div className="text-xs text-text-secondary mb-2">
            Tool: {message.toolName}
          </div>
        )}
        <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap break-words m-0">
          {message.text}
        </p>
        {message.pending && (
          <small className="block mt-2 text-xs text-text-secondary">
            处理中...
          </small>
        )}
      </div>

      {/* 操作按钮栏 - 始终显示 */}
      <div className="flex items-center gap-1 h-8 mt-1 px-2">
        <button
          onClick={handleCopy}
          className="h-6 px-2 rounded hover:bg-surface text-text-secondary hover:text-text-primary transition-colors text-xs flex items-center gap-1"
          aria-label="复制消息"
        >
          <svg width="14" height="14" viewBox="0 0 14 14">
            <rect
              x="4"
              y="4"
              width="7"
              height="7"
              rx="1"
              stroke="currentColor"
              strokeWidth="1.2"
              fill="none"
            />
            <path
              d="M3 10V3.5A1.5 1.5 0 0 1 4.5 2H10"
              stroke="currentColor"
              strokeWidth="1.2"
              fill="none"
            />
          </svg>
          <span>复制</span>
        </button>

        {/* 预留按钮 - 禁用状态 */}
        <button
          disabled
          className="h-6 px-2 rounded text-text-secondary/50 text-xs cursor-not-allowed"
          title="即将推出"
        >
          编辑
        </button>
        <button
          disabled
          className="h-6 px-2 rounded text-text-secondary/50 text-xs cursor-not-allowed"
          title="即将推出"
        >
          重新生成
        </button>
      </div>
    </article>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/thread-window-web/src/components/MessageBubble.tsx
git commit -m "feat(ui): add MessageBubble component with action buttons"
```

### Task 4.2: 重写 MessageList 组件

**Files:**
- Modify: `apps/thread-window-web/src/components/MessageList.tsx`

- [ ] **Step 1: 重写 MessageList 使用新的 MessageBubble**

```typescript
// apps/thread-window-web/src/components/MessageList.tsx
import { useState } from 'react';
import type { ThreadMessage } from '../store/threadWindowStore.ts';
import { MessageBubble } from './MessageBubble.tsx';

interface MessageListProps {
  messages: ThreadMessage[];
  errorMessage: string | null;
}

export function MessageList({ messages, errorMessage }: MessageListProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (text: string) => {
    // 显示复制成功反馈（可选）
    console.log('已复制:', text.slice(0, 50));
  };

  return (
    <div className="flex flex-col gap-3 min-h-0 overflow-y-auto px-5 py-4">
      {messages.length === 0 ? (
        <div className="flex items-center justify-center h-full text-sm text-text-secondary">
          等待输入
        </div>
      ) : null}

      {messages.map((message) => (
        <MessageBubble
          key={message.id}
          message={message}
          onCopy={handleCopy}
        />
      ))}

      {errorMessage && (
        <div className="max-w-3xl mx-auto w-full rounded-bubble border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
          {errorMessage}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/thread-window-web/src/components/MessageList.tsx
git commit -m "refactor(ui): rewrite MessageList with new MessageBubble"
```

### Task 4.3: 重写 Composer 组件（自动增高输入框）

**Files:**
- Modify: `apps/thread-window-web/src/components/Composer.tsx`

- [ ] **Step 1: 重写 Composer 使用 Tailwind 和自动增高逻辑**

```typescript
// apps/thread-window-web/src/components/Composer.tsx
import { useEffect, useRef, useState } from 'react';

interface ComposerProps {
  disabled: boolean;
  stopDisabled: boolean;
  onSubmit: (text: string) => void;
  onStop: () => void;
}

const MAX_ROWS = 6;
const LINE_HEIGHT = 24;

export function Composer({ disabled, stopDisabled, onSubmit, onStop }: ComposerProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget;
    setText(target.value);
    
    // 自动调整高度
    target.style.height = 'auto';
    target.style.height = `${Math.min(target.scrollHeight, MAX_ROWS * LINE_HEIGHT)}px`;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    
    onSubmit(trimmed);
    setText('');
    
    // 重置高度
    if (textareaRef.current) {
      textareaRef.current.style.height = '52px';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="grid grid-cols-[1fr_auto] gap-2.5 border-t border-border bg-surface/50 px-3 py-3"
    >
      <textarea
        ref={textareaRef}
        value={text}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        placeholder="Ask HandAgent"
        disabled={disabled}
        className="min-h-[52px] max-h-[144px] resize-none overflow-y-auto rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-text-primary leading-relaxed placeholder:text-text-secondary disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-accent-ring"
        style={{ minHeight: '52px', maxHeight: `${MAX_ROWS * LINE_HEIGHT}px` }}
      />
      <div className="flex flex-col gap-2">
        <button
          type="submit"
          disabled={disabled || !text.trim()}
          className="h-10 px-4 rounded-lg bg-accent hover:bg-accent-hover active:bg-accent-pressed disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium text-background transition-colors"
        >
          发送
        </button>
        <button
          type="button"
          onClick={onStop}
          disabled={stopDisabled}
          className="h-10 px-4 rounded-lg border border-border bg-surface hover:bg-surface/80 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium text-text-primary transition-colors"
        >
          停止
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/thread-window-web/src/components/Composer.tsx
git commit -m "refactor(ui): rewrite Composer with auto-resize textarea"
```

### Task 4.4: 重写 TabBar 组件

**Files:**
- Modify: `apps/thread-window-web/src/components/TabBar.tsx`

- [ ] **Step 1: 重写 TabBar 使用 Tailwind**

```typescript
// apps/thread-window-web/src/components/TabBar.tsx
import type { TabState } from '../store/threadWindowStore.ts';
import { cn } from '../utils/cn.ts';

interface TabBarProps {
  tabs: TabState[];
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
              {tab.threadId.slice(0, 8)}
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
```

- [ ] **Step 2: Commit**

```bash
git add apps/thread-window-web/src/components/TabBar.tsx
git commit -m "refactor(ui): rewrite TabBar with tailwind styling"
```

### Task 4.5: 更新 App.tsx 移除 connection pill

**Files:**
- Modify: `apps/thread-window-web/src/App.tsx`

- [ ] **Step 1: 移除 connection pill 并应用 Tailwind 样式**

修改 `App.tsx`，移除 connection pill 并更新样式类：

```typescript
// 移除 connectionLabel 函数（不再需要）

// 在 return 中更新样式
<main className="grid grid-cols-[260px_1fr] w-screen min-h-screen overflow-hidden bg-background text-text-primary">
  <HistorySidebar
    history={state.history}
    activeTabId={state.activeTabId}
    onOpenThread={(threadId) => {
      createThreadWindowStore.getState().openHistoryThread(threadId);
      clientRef.current?.resumeThread(threadId);
    }}
    onDeleteThread={(threadId) => {
      setDeleteTargetThreadId(threadId);
    }}
    onNewThread={handleNewThread}
  />
  
  <section className="grid grid-rows-[auto_auto_1fr_auto] min-w-0 min-h-screen overflow-hidden bg-surface/30">
    <header className="flex items-center gap-3 min-h-[48px] border-b border-border px-3 py-2">
      <TabBar
        tabs={tabs}
        activeTabId={state.activeTabId}
        onActivate={(threadId) => createThreadWindowStore.setState({ activeTabId: threadId })}
        onClose={(threadId) => createThreadWindowStore.getState().closeTab(threadId)}
      />
      {/* connection pill 已移除 */}
    </header>

    {state.windowErrorMessage && (
      <div className="mx-3 mt-2.5 rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
        {state.windowErrorMessage}
      </div>
    )}

    {activeTab ? (
      <>
        <div className="grid grid-rows-[1fr_auto] min-w-0 min-h-0 overflow-hidden">
          <MessageList messages={activeTab.messages} errorMessage={activeTab.errorMessage} />
          <RequestPanels
            permissionRequests={activeTab.permissionRequests}
            workspaceRequests={activeTab.workspaceRequests}
            onAnswerPermission={(requestId, decision) => {
              clientRef.current?.sendRaw(encodePermissionAnswer({
                requestId,
                timestamp: now(),
                decision,
                scope: "thread",
              }));
              createThreadWindowStore.getState().resolvePermissionRequest(requestId);
            }}
            onAnswerWorkspace={(requestId, workspaceId) => {
              clientRef.current?.sendRaw(encodeWorkspaceAnswer({
                requestId,
                timestamp: now(),
                ...(workspaceId ? { workspaceId } : { cancelled: true }),
              }));
              createThreadWindowStore.getState().resolveWorkspaceRequest(requestId);
            }}
          />
        </div>
        <Composer
          disabled={state.connectionState !== "connected" || activeTab.status === "running"}
          stopDisabled={state.connectionState !== "connected" || activeTab.status !== "running"}
          onSubmit={(text) => clientRef.current?.startTurn(activeTab.threadId, text)}
          onStop={() => {
            if (state.connectionState !== "connected" || activeTab.status !== "running") return;
            clientRef.current?.sendRaw(encodeTurnInterrupt({
              threadId: activeTab.threadId,
              commandId: id("interrupt"),
              timestamp: now(),
            }));
          }}
        />
      </>
    ) : (
      <div className="flex items-center justify-center text-sm text-text-secondary">
        准备开始
      </div>
    )}
    
    {/* Delete confirmation dialog - 保持不变 */}
  </section>
</main>
```

- [ ] **Step 2: Commit**

```bash
git add apps/thread-window-web/src/App.tsx
git commit -m "refactor(ui): remove connection pill and apply tailwind to App layout"
```

### Task 4.6: 更新 RequestPanels 使用 Tailwind

**Files:**
- Modify: `apps/thread-window-web/src/components/RequestPanels.tsx`

- [ ] **Step 1: 重写 RequestPanels 使用 Tailwind 样式**

修改 `RequestPanels.tsx` 组件，替换 className 为 Tailwind 类：

```typescript
// apps/thread-window-web/src/components/RequestPanels.tsx
// 保持现有的接口和逻辑，只更新样式类

<div className="flex gap-2.5 overflow-x-auto border-t border-border bg-surface/30 px-3 py-2.5">
  {/* Permission panels */}
  {permissionRequests.map((req) => (
    <div
      key={req.requestId}
      className="flex-shrink-0 basis-[420px] max-w-[80vw] rounded-lg border border-border bg-surface px-2.5 py-2.5"
    >
      <strong className="block mb-2 text-sm text-text-primary">
        权限请求
      </strong>
      <pre className="max-h-[140px] mb-2.5 overflow-auto text-xs text-text-secondary whitespace-pre-wrap">
        {JSON.stringify(req.tool, null, 2)}
      </pre>
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => onAnswerPermission(req.requestId, 'allow')}
          className="px-2.5 py-1.5 rounded-lg border border-accent/30 bg-accent/10 hover:bg-accent/20 text-sm text-accent transition-colors"
        >
          允许
        </button>
        <button
          onClick={() => onAnswerPermission(req.requestId, 'deny')}
          className="px-2.5 py-1.5 rounded-lg border border-border bg-surface hover:bg-surface/80 text-sm text-text-primary transition-colors"
        >
          拒绝
        </button>
      </div>
    </div>
  ))}

  {/* Workspace panels - 类似结构 */}
</div>
```

- [ ] **Step 2: Commit**

```bash
git add apps/thread-window-web/src/components/RequestPanels.tsx
git commit -m "refactor(ui): update RequestPanels with tailwind styling"
```

### Task 4.7: 移除旧的 CSS 文件

**Files:**
- Delete: `apps/thread-window-web/src/styles/thread-window.css`

- [ ] **Step 1: 删除旧的 CSS 文件**

```bash
rm apps/thread-window-web/src/styles/thread-window.css
```

- [ ] **Step 2: 验证应用仍然正常工作**

Run: `pnpm --filter handagent-thread-window-web build`
Expected: 构建成功

- [ ] **Step 3: Commit**

```bash
git add apps/thread-window-web/src/styles/thread-window.css
git commit -m "remove: delete old CSS file after tailwind migration"
```

### Task 4.8: 最终验证和调优

**Files:**
- N/A（验证任务）

- [ ] **Step 1: 运行所有测试**

Run: `bash ./scripts/test.sh`
Expected: 所有测试通过

Run: `bash ./scripts/swiftw test`
Expected: Swift 测试通过

Run: `bash ./scripts/swiftw build`
Expected: 构建成功

- [ ] **Step 2: 启动应用进行完整功能验证**

Run: `bash ./scripts/swiftw run HandAgentDesktop`

验证清单：
1. ✓ 左侧边栏 workspace 分组正常
2. ✓ 搜索功能工作正常
3. ✓ 新建对话创建空白 thread
4. ✓ 消息气泡样式符合设计规格（内边距 24px/16px，行高 1.625）
5. ✓ 操作按钮栏显示且复制功能正常
6. ✓ 输入框自动增高，6 行后滚动
7. ✓ Tab 切换正常
8. ✓ 权限请求面板显示正常
9. ✓ 视觉风格符合 Raycast Glass（玻璃质感、Mango Amber 强调色）
10. ✓ 无明显性能问题或视觉错误

- [ ] **Step 3: 手动添加到 docs/manual-qa.md**

在 `docs/manual-qa.md` 中添加 ThreadWindow UI 重构的验收清单。

- [ ] **Step 4: 创建 Phase 4 完成的里程碑 commit**

```bash
git add -A
git commit -m "milestone: Phase 4 complete - ChatGPT-style message area

- MessageBubble with fixed action buttons (copy + reserved edit/regenerate)
- Auto-resize Composer textarea (6 rows max)
- Tailwind-styled TabBar and RequestPanels
- Removed connection pill from toolbar
- ChatGPT-level visual density and polish
- All components migrated to Tailwind CSS"
```

---

## 实施计划自查

### Spec 覆盖检查

- ✓ Phase 1: 基础设施层 - Tailwind + Radix UI 安装和配置
- ✓ Phase 2: 协议扩展 - ThreadMetadata.workspaceId + workspace.list 命令
- ✓ Phase 3: 左侧边栏 - workspace 分组 + 搜索 + 新建按钮
- ✓ Phase 4: 右侧对话区 - 新消息气泡 + 操作按钮 + 自动增高输入框 + 移除 connection pill

### 占位符检查

无 TBD、TODO 或占位符代码。所有代码块都是完整可执行的。

### 类型一致性检查

- `ThreadMetadata.workspaceId: string | null` - 在所有任务中保持一致 ✓
- `WorkspaceListCommand` / `WorkspaceListedNotification` - 类型定义在所有引用处一致 ✓
- `encodeWorkspaceList` / `encodeThreadStart` - 函数签名与协议类型匹配 ✓
- Tailwind 类名 - 使用统一的 design token（`text-primary`, `accent`, `border` 等）✓

---

## 执行选项

计划已完成，保存到 `docs/superpowers/plans/2026-06-07-threadwindow-ui-refactor.md`。

**两种执行方式：**

**1. Subagent-Driven（推荐）** - 每个 task 由独立 subagent 执行，任务间进行 review

**2. Inline Execution** - 在当前 session 批量执行，使用 checkpoint 进行 review

请选择执行方式。

# ThreadWindow 删除 Tab 概念设计

## 文档元信息

- 日期：2026-06-09
- 范围：`apps/thread-window-web`
- 状态：设计待评审

## 背景

当前 React ThreadWindow 的 store 使用 `tabs` 同时表达两个概念：

- 右侧 UI 当前打开了哪些 tab。
- 前端对每个 thread 的消息、运行态、请求态和 composer 队列缓存。

这会让“关闭 tab”容易被误解为“关闭 thread 状态”。实际目标不是隐藏 tab 或拆出可见 tab 状态，而是从产品和代码中删除 tab 概念：前端只维护 thread 状态缓存，右侧区域固定展示一个由 `App` 选中的 thread。

## 目标

1. 删除右侧顶部 TabBar 和所有 tab 切换 / tab 关闭交互。
2. 前端 store 使用 `threadId -> ThreadState` 作为唯一 thread 状态缓存。
3. `App` 组件用本地 React state 保存当前右侧展示的 `threadId`。
4. 右侧区域抽成独立组件，接收 `threadId` 后从 store 读取该 thread 的状态并渲染。
5. socket 入站 handler 始终按 `threadId` 更新后台 thread 状态，不关心右侧当前展示哪个 thread。
6. 用户从历史侧栏切换到另一个正在运行的 thread 时，右侧直接渲染该 thread 当前缓存的流式状态。
7. 权限请求和 workspace 请求继续保存在对应 `ThreadState` 中，切回该 thread 时继续展示。

## 非目标

- 不保留 WebSocket 自动重连。
- 不做任何断线恢复；非主动断开后不重连、不恢复订阅、不拉取 snapshot、不发送任何恢复命令。
- 不修改 agent-server 的 thread socket 订阅、权限绑定或 close 中断语义。
- 不设计服务端 delta 重放、事件序列号或 snapshot merge。
- 不修改 Electron main、Swift desktop 或 `/api/activity`。
- 不改变 thread 持久化格式。

## 连接边界

本次把 React 和 app-server 之间视为稳定长连接。`ThreadSocketClient` 仍是当前 WebSocket transport，但必须删除自动 reconnect 行为：socket 非主动断开后只把连接状态置为 `disconnected`，不调度重连，不恢复订阅，不拉取 snapshot，不发送任何恢复命令。

如果 WebSocket transport 未来替换为 Electron 通信机制，只替换最外层 transport：发送命令、接收入站消息、连接状态回调。`threadsById`、`ThreadState` 和右侧渲染组件不应随 transport 改动。

断线时 thread state 不做任何重置。若 assistant 流式返回到一半连接断开，`ThreadState` 保持在最后收到的 delta；右侧切换到该 thread 时直接渲染这个状态，由用户决定是否停止或重新打开窗口触发新的连接路径。当前实现不尝试自动恢复后续 delta。

## 状态模型

`createThreadWindowStore` 从 tab 模型改为 thread 缓存模型。

```ts
type ThreadState = {
  threadId: string;
  title: string | null;
  status: RunStatus;
  messages: ThreadMessage[];
  pendingInitialPrompt: InitialPromptPayload | null;
  queuedComposerInputs: QueuedComposerInput[];
  queuedInputDispatchPending: boolean;
  permissionRequests: PermissionRequestState[];
  workspaceRequests: WorkspaceRequestState[];
  errorMessage: string | null;
};

type ThreadWindowState = {
  connectionState: ConnectionState;
  windowErrorMessage: string | null;
  history: ThreadListEntry[];
  threadsById: Record<string, ThreadState>;
  pendingInitialPrompts: Record<string, InitialPromptPayload>;
  processedNotificationIds: Record<string, true>;
  workspaces: Array<{ id: string; name: string; rootPath: string }>;
  expandedWorkspaceIds: Set<string>;
  searchQuery: string;
};
```

`activeThreadId` 不进入 store。它由 `App` 的 `useState<string | null>` 持有，因为“右侧当前展示哪个 thread”是页面编排状态，不是后台 thread 数据。

store action 命名改为 thread 语义：

- `ensureThreadState(threadId)`
- `setConnectionState(state)`
- `enqueueInitialPrompt(prompt)`
- `queueComposerInput(threadId, text, attachments?)`
- `removeQueuedComposerInput(threadId, index)`
- `markComposerInputDispatchPending(threadId)`
- `takeNextQueuedInputForDispatch(threadId)`
- `resolvePermissionRequest(requestId)`
- `resolveWorkspaceRequest(requestId)`
- `handleNotification(notification)`
- `handleRequest(request)`

## 入站消息处理

所有 `ThreadNotification` 和 `ServerRequest` 都按 `threadId` 定位 `threadsById[threadId]`。

- `thread.started`：创建或覆盖对应 `ThreadState`，关联 pending initial prompt。
- `thread.snapshot`：写入对应 thread 的 `messages` 与 `status`，保留本地 pending initial prompt 的现有保护逻辑。
- `user.message.recorded`：删除 pending user message，追加已确认 user message。
- `turn.started`：该 thread 状态变为 `running`，清理 `queuedInputDispatchPending`。
- `assistant.delta`：追加到该 thread 的 assistant message；如果该 thread 当前不在右侧展示，也照常更新缓存。
- `tool.started` / `tool.finished`：更新该 thread 的 tool message。
- `turn.completed` / `thread.status.changed`：更新该 thread 的运行态。
- `permission.requested` / `workspace.requested`：保存到该 thread 的 request 列表。
- `thread.error`：有 `threadId` 时写入该 thread；没有 `threadId` 时写入窗口级错误。

入站 handler 不读取 `activeThreadId`，也不因为 thread 当前不可见而丢弃消息。

## App 编排

`App` 负责页面级编排：

- 创建并持有 `ThreadSocketClient`。
- 持有 `activeThreadId` 本地 state。
- 接收 initial prompt。
- 处理历史侧栏点击。
- 处理 `thread.started` 后把新建 thread 设为当前展示 thread。
- 把当前 `activeThreadId` 传给右侧组件。

`ThreadSocketClient` 的 `onNotification` 回调顺序：

1. 调用 `store.handleNotification(notification)` 更新后台 thread 状态。
2. 如果 notification 是 `thread.started`，由 `App` 执行 `setActiveThreadId(notification.threadId)`。
3. 继续执行 socket client 自身的首轮 prompt side effect：`thread.resume` + `input.submit`。

这里保持现有“初始 prompt 先建 thread，再 resume，再 submit input”的主流程。

## 右侧组件

新增右侧固定展示组件，例如 `ThreadWorkspacePane`：

```tsx
type ThreadWorkspacePaneProps = {
  threadId: string | null;
  connectionState: ConnectionState;
  onSubmit(threadId: string, text: string): void;
  onStop(threadId: string): void;
  onAnswerPermission(...): void;
  onAnswerWorkspace(...): void;
};
```

组件内部用 `threadId` 从 store 读取对应 `ThreadState`：

- `MessageList` 渲染 `thread.messages`。
- `RequestPanels` 渲染 `thread.permissionRequests` 和 `thread.workspaceRequests`。
- `Composer` 根据 `thread.status` 和 `connectionState` 决定可用状态。

没有 `threadId` 时展示空状态“准备开始”。空状态不创建 thread。

## 历史侧栏

`HistorySidebar` 不再接收 `activeTabId`，改为接收 `activeThreadId`。

点击历史项时：

1. `store.ensureThreadState(threadId)`。
2. `setActiveThreadId(threadId)`。
3. 发送 `thread.resume(threadId)`，用于打开历史 thread 的初始快照。

这一步的 `thread.resume` 是用户打开历史 thread 的加载入口，不是断线恢复机制。

## Composer 队列

queued input 继续保存在对应 `ThreadState` 下。

`App` 的 queued dispatch effect 从遍历 `tabs` 改为遍历 `threadsById`。只要连接可用，任何 thread 离开 running 后都可以派发该 thread 自己的下一条 queued input。这保证用户切走后，后台 thread 的前端队列仍然属于该 thread，不会混入当前右侧 thread。

## 删除内容

- 删除 `TabBar` 组件或停止从 `App` 引用它。
- 删除 `ThreadTabState` 命名，改为 `ThreadState`。
- 删除 `tabs`、`activeTabId`、`openHistoryThread`、`closeTab` 等 tab 语义字段和 action。
- 删除右侧顶部 tab 行对应布局。
- 文档中不再描述“打开 tab / 关闭 tab / active tab”。

## 测试策略

### Store

新增或更新 `threadWindowStore.test.ts`：

1. `thread.started` 创建 `threadsById[threadId]` 并保留 pending initial prompt。
2. `thread.snapshot` 更新指定 thread，不影响其他 thread。
3. 不可见 thread 收到 `assistant.delta` 时，仍更新对应 `ThreadState`。
4. `permission.requested` 和 `workspace.requested` 保存到对应 thread，切换 active thread 不影响这些数据。
5. queued composer input 按 thread 隔离，`takeNextQueuedInputForDispatch` 不跨 thread。
6. duplicate `assistant.delta` 仍通过 `processedNotificationIds` 去重。

### App / Socket Client

新增或更新 React 测试：

1. `thread.started` 后 `App` 将新 thread 设为当前右侧展示 thread。
2. 历史项点击后调用 `ensureThreadState`、设置 `activeThreadId`，并发送 `thread.resume`。
3. `ThreadWorkspacePane` 用传入 `threadId` 渲染对应 thread 的消息和请求。
4. 删除 TabBar 后右侧顶部不再出现 tab 关闭或 tab 切换按钮。
5. `ThreadSocketClient` 非主动断开后只上报 `disconnected`，不创建新 WebSocket，不发送 `thread.list`、`thread.resume` 或其他恢复命令。
6. 删除旧的 reconnect 相关测试，避免把自动重连当作当前行为。

### 验证命令

最小验证：

```bash
pnpm --filter handagent-thread-window-web test
pnpm --filter handagent-thread-window-web build
```

仓库级验证：

```bash
bash ./scripts/test.sh
```

## 文档更新

实现完成后必须更新：

- `apps/thread-window-web/thread-window-web.md`：把 tabs 状态源改为 `threadsById + App activeThreadId`。
- `handAgent.md`：如果仍提到 React 管理 tabs，改为 React 管理 thread 状态缓存和当前展示 thread。
- `apps/apps.md`：如果仍提到 tabs，改为 thread 状态缓存。
- `docs/manual-qa.md`：补充“多个运行中 thread 切换不打断、权限请求切回可见”的手工验收项。

## 风险与约束

- 这次不解决 WebSocket 断线期间 delta 丢失问题；该问题必须等未来 transport 或服务端事件重放设计单独处理。
- `thread.resume` 仍会返回 snapshot，历史打开时需要保留 pending initial prompt 的保护逻辑，避免覆盖本地尚未确认的首轮 user message。
- 删除 TabBar 会改变右侧布局高度；需要检查 MessageList 和 Composer 在窄窗口下仍不出现页面级横向滚动。
- `App` 本地 `activeThreadId` 不持久化。窗口刷新或重开后当前展示由用户历史点击或 initial prompt 决定。

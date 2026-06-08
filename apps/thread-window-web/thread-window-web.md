# thread-window-web

`apps/thread-window-web` 是 React ThreadWindow 前端。默认路径由 Swift `WKWebView` 承载；Phase 0 Electron flag 路径也会用隐藏 `BrowserWindow` 预热同一 bundle，但尚未接管真实 PromptPanel submit。本文只记录修改本目录代码前必须知道的包内前提；整体调用链和 apps 层职责见上级文档。

## 目录职责

| 路径 | 职责 |
|------|------|
| `src/App.tsx` | ThreadWindow 根组件，创建 `ThreadSocketClient`，安装初始 prompt receiver，连接 store 与 UI。 |
| `src/protocol/threadProtocol.ts` | Web 侧协议编码、类型导出和入站类型守卫；类型来源是 `@handagent/core/protocol/*`。 |
| `src/thread/threadSocketClient.ts` | `/api/thread` WebSocket client，负责连接、重连、发送队列、初始 prompt 首轮流程和入站消息分派。 |
| `src/store/threadWindowStore.ts` | `zustand + immer` store，是 tabs、历史、消息、请求、workspace 列表和窗口错误的状态源。 |
| `src/native/nativeConfig.ts` | 读取 Swift 注入的 thread WebSocket URL，安装 `window.handAgentReceiveInitialPrompt`。 |
| `src/components/` | ThreadWindow UI 组件：历史侧栏、tabs、消息列表、composer、权限与 workspace 请求面板。 |
| `src/utils/` | 纯函数工具：workspace 分组、侧栏响应式布局、className 合并。 |
| `tests/` | Vitest 测试，覆盖协议守卫、socket client、store、native config、侧栏布局和设计 token。 |

`dist/` 与 `node_modules/` 是生成或安装产物，不作为文档索引维护对象。

## 运行边界

- React 直接持有 `/api/thread` WebSocket；Swift 不解析 `ThreadNotification`，也不发送 `ThreadCommand`。
- 默认路径下 Swift 负责加载 Web bundle、注入配置和初始 prompt；Phase 0 Electron hidden prewarm 只提前加载同一 bundle，不改变 React 直接连接 `/api/thread` 的职责。平台 tool 走独立 `/api/platform`。
- `ThreadSocketClient` 只处理收发、重连、发送队列和通知副作用，不直接写 UI；UI 状态由 store action 更新。
- 组件只通过明确 props、store action 或根组件 callback 触发行为，不应绕过根组件直接操作 WebSocket。
- 当前不把 ThreadWindow tabs、消息或历史同步给 Swift `ThreadRegistry` / StatusBubble。

## Thread 协议前提

Web 侧命令和通知类型以 `packages/core/src/protocol/` 为真相，`src/protocol/threadProtocol.ts` 只做本包需要的 encode / guard 封装。

当前 Web 包必须覆盖这些协议点：

- 出站 `ThreadCommand`：`thread.start`、`thread.resume`、`thread.list`、`thread.delete`、`input.submit`、`turn.interrupt`、`workspace.list`。
- 入站 `ThreadNotification`：消息流、tool 流、状态变化、`thread.listed`、`thread.deleted`、`thread.error`、`workspace.listed`。
- 入站 `ServerRequest`：`permission.requested` 与 `workspace.requested`。
- 出站 `ClientResponse`：`permission.answered` 与 `workspace.answered`。

`workspace.listed` 已在协议守卫和 store 中覆盖：socket 连接成功后发送 `workspace.list`，store 收到后写入 `workspaces`，历史侧栏再按 `ThreadListEntry.workspaceId` 分组。修改 workspace 相关 UI 或协议时，必须同步检查 `src/protocol/threadProtocol.ts`、`src/store/threadWindowStore.ts`、`src/utils/groupThreads.ts` 和对应测试。

## 初始 Prompt 流程

Swift 在 document start 注入：

- `window.handAgentThreadWindowConfig.threadWebSocketURL`
- 临时 `window.handAgentReceiveInitialPrompt`
- `window.handAgentPendingInitialPrompts`

React `App` 挂载后通过 `installInitialPromptReceiver` 替换正式 receiver，并 flush 早到的 pending prompt。

首轮消息流程先建 thread，再提交首轮输入：

1. `App` 收到 `InitialPromptPayload` 后先写入 store 的 `pendingInitialPrompts`。
2. `ThreadSocketClient.startInitialPrompt` 发送 `thread.start`，`commandId` 使用 `clientRequestId`，并携带 `actionBinding`。
3. 收到匹配 `commandId` 的 `thread.started` 后，store 创建并激活 tab，socket client 自动发送 `thread.resume`，再发送首轮 `input.submit` 和 attachments。
4. 若收到匹配 `commandId` 的 `thread.error`，socket client 清理 pending prompt，store 暴露窗口级错误，不再补发 `input.submit`。

这个顺序同时保护“先建 thread 再补首轮输入”和“WebSocket 未 open 时排队发送”的场景；相关测试在 `tests/nativeConfig.test.ts`、`tests/threadSocketClient.test.ts`、`tests/threadWindowStore.test.ts`。

## Store 与 UI 状态

`createThreadWindowStore` 管理以下用户可见状态：

- 连接状态：`disconnected`、`connecting`、`connected`、`reconnecting`。
- 历史：`history` 来自 `thread.listed`。
- tabs：每个 tab 持有 `threadId`、title、run status、messages、pending initial prompt、权限请求、workspace 请求和 tab 级错误。
- 请求面板：`permission.requested` / `workspace.requested` 按 `threadId` 放到当前 tab；用户回答后根组件发送 response 并调用显式 resolve action 移除请求。
- workspace：`workspaces` 来自 `workspace.listed`，`expandedWorkspaceIds` 和 `searchQuery` 驱动历史侧栏。
- 去重：`processedNotificationIds` 防止重复处理同一 notification，特别是 streaming delta。

恢复历史 thread 时，`HistorySidebar` 先调用 `openHistoryThread(threadId)` 创建或激活 tab，再由根组件调用 `resumeThread(threadId)` 等待 `thread.snapshot` 回填消息。

## 布局与组件约束

- 左侧历史侧栏宽度由 `getThreadWindowSidebarLayout` 计算：窗口宽度 `< 760px` 时隐藏；否则取窗口宽度 30%，限制在 220px 到 320px。
- 历史侧栏使用 `groupThreadsByWorkspace` 将 `workspaceId: null` 的 thread 归入“默认对话”，并固定放在 workspace 分组之后。
- `WorkspaceGroup` 当前使用 Radix `Accordion.Item/Header/Trigger/Content`，但父级 `HistorySidebar` 没有包 `Accordion.Root`；不要把它当作完整 Radix Accordion 状态模型。
- `Composer` 只负责提交文本和停止当前 running turn；附件按钮、编辑和重新生成仍是 UI 占位，不能在文档或代码中当作已完成能力。

## 样式前提

- 样式系统是 Tailwind CSS，主题 token 在 `tailwind.config.js`。
- `tests/designTokens.test.ts` 会校验关键 token，避免回退到旧的单一 dark-only 配色。
- 新 UI 应优先复用现有 token 和组件密度，不在组件内散落协议状态字符串或重复色值。

## 常用命令

```bash
pnpm --filter handagent-thread-window-web test
pnpm --filter handagent-thread-window-web build
```

仓库级 TypeScript 验证仍可用：

```bash
bash ./scripts/test.sh
```

## 相关文档

- Swift WebView host：[ThreadWindow](/Users/mu9/proj/handAgent/apps/desktop/Sources/ThreadWindow/thread-window.md)
- agent-server socket：[server](/Users/mu9/proj/handAgent/apps/agent-server/src/server/server.md)
- protocol DTO：[protocol](/Users/mu9/proj/handAgent/packages/core/src/protocol/protocol.md)

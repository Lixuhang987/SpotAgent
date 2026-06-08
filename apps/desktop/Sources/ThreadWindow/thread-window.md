# ThreadWindow

`ThreadWindow` 目录只保留 Swift 侧的 WKWebView host。它服务默认路径；当 `HANDAGENT_ELECTRON_SHELL=1` 时，真实 ThreadWindow host 由 `apps/electron-shell` 的 Electron `BrowserWindow` 承载。ThreadWindow 的 UI 状态、历史、tabs、消息、请求面板和 composer 都由 `apps/thread-window-web` 的 React 前端管理。

## 文件

| 文件 | 职责 |
|------|------|
| `ThreadWindowWebHost.swift` | 保存 web app URL、`/api/thread` WebSocket URL 和待注入的 initial prompt 队列；配置脚本会在 document start 安装 early receiver，避免 React 尚未挂载时丢失 initial prompt |
| `ThreadWindowWebView.swift` | 创建 `WKWebView`，注入 `window.handAgentThreadWindowConfig`，页面加载完成后调用 `window.handAgentReceiveInitialPrompt(...)` |
| `UserMessageAttachmentPayload.swift` | Swift 到 React initial prompt attachment DTO |

## 数据流

```mermaid
sequenceDiagram
  participant Coord as AppCoordinator
  participant Life as ThreadWindowLifecycle
  participant Host as ThreadWindowWebHost
  participant View as ThreadWindowWebView
  participant React as apps/thread-window-web
  participant Server as agent-server

  Coord->>Life: submit prompt
  Life->>Host: enqueueInitialPrompt(...)
  Life->>View: present WKWebView
  View->>React: load web bundle
  View->>React: handAgentReceiveInitialPrompt(payload)
  React->>Server: /api/thread ThreadCommand
  Server-->>React: ThreadNotification / ServerRequest
```

Swift 在 `WKUserScript.atDocumentStart` 注入 `window.handAgentThreadWindowConfig` 时，也会初始化 `window.handAgentPendingInitialPrompts` 和临时 `window.handAgentReceiveInitialPrompt`。如果 `WKNavigationDelegate.didFinish` 早于 React `useEffect` 安装正式 receiver，初始 prompt 会先进入 pending 队列；React 启动后由 `installInitialPromptReceiver` flush，再发送 `thread.start` 和首轮 `input.submit`。改动这个桥时必须同时覆盖 Swift 配置脚本和 React native config 测试。

## 调试前提

- 默认路径下，仅通过全局快捷键打开 `PromptPanel`，**不会**触发 Swift `ThreadWindow` 创建或 `WKWebView` 加载。Electron flag 路径下，PromptPanel show/toggle 也不会请求 ThreadWindow 预热；hidden `BrowserWindow` 由 Electron main 在 agent-server ready 后主动预热。
- `ThreadWindow` 的加载链路只会在以下入口触发：
  - 用户在 `PromptPanel` 中输入内容并提交（回车）；
  - Coordinator 显式调用历史入口 `openOrFocusHistory(...)`。
- 因此排查 `ThreadWindow` 白屏、`WKWebView` 导航、React 首屏渲染等问题时，必须先完成一次真实提交，或明确走历史入口；不要把“`PromptPanel` 已打开”误判为“`ThreadWindow` 已开始加载”。

## 边界

- Swift 不再持有 ThreadWindow tab/message/history 状态。
- Swift 不发送 `ThreadCommand`，不解析 `ThreadNotification`，不回执 `ClientResponse`。
- 本目录只负责默认路径的 `NSWindow` 生命周期、`WKWebView` 加载、注入配置和 initial prompt。
- Electron flag 路径不使用本目录创建 ThreadWindow；Swift 只通过 Coordinator/AppServices 的 `ThreadWindowManaging` 与 `ThreadWindowCommanding` 发送 Electron command。
- 默认加载入口是 `http://127.0.0.1:4317/thread-window/index.html`。本地 React 静态资源由 `agent-server` 在同端口按 `/thread-window/*` 提供，避免 `file://` 下 `type="module"` bundle 在 `WKWebView` 中不执行导致白屏。
- React 直接连接 `/api/thread` 并持有 ThreadWindow 状态源。
- 默认路径的 Swift StatusBubble 仍从 Swift `ThreadRegistry` 派生，当前没有接入 React / agent-server 的实时 thread 摘要；`HANDAGENT_ELECTRON_SHELL=1` 路径由 Electron ActivityWindow 的 React StatusBubble 订阅 `/api/activity`。

## 编辑此目录的约束

- 不要重新引入旧 Swift ThreadWindow view、view model、reducer、event bus 或 Swift thread protocol client。
- 新增 Swift 代码只能服务 WebView host、资源加载、initial prompt 注入或窗口生命周期。
- 改动初始 prompt payload 时，同时更新 `apps/thread-window-web/src/protocol/threadProtocol.ts` 和相关测试。
- 改动 WebView 注入配置时，运行 `bash ./scripts/swiftw test --filter ThreadWindowWebHostTests`，并运行 `pnpm --filter handagent-thread-window-web test nativeConfig.test.ts`。

## 相关文档

- React 前端：[apps/thread-window-web/thread-window-web.md](/Users/mu9/proj/handAgent/apps/thread-window-web/thread-window-web.md)
- Swift AppServer：[agent-server.md](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/AgentServer/agent-server.md)
- 平台桥：[platform-bridge.md](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/PlatformBridge/platform-bridge.md)

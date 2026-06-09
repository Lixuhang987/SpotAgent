# AgentServer 模块

本目录不再由 Swift 启动 agent-server。agent-server 进程由 `apps/electron-shell` 监督；Swift 只保留健康状态协议、平台桥 WebSocket client，以及 Electron launch 所需的仓库根定位器。

## 文件

| 文件 | 职责 |
|------|------|
| `AppServer.swift` | `AppServerManaging` 协议与 `PlatformBridgeConnectionClient`；后者连接 `/api/platform`，发送 `platform_bridge_hello`，处理 `platform_request` 并回写 `platform_response` |
| `AgentServerHealth.swift` | 主线程健康状态桥：订阅 `AppServerManaging` 可用性与 fatal error，向 PromptPanel 暴露可提交状态，并在需要时调用原生 fatal alert |
| `AgentServerRuntimeMode.swift` | 读取 bundle resource marker 与环境变量，决定 Electron supervisor 是否注入 `HANDAGENT_LLM_MODE=mock` |
| `AgentServerRepositoryRootLocator.swift` | 用于 Electron launch config 定位 worktree 或 packaged resources |
| `AppServerConnection.swift` | 单条 WebSocket 连接抽象：处理 connect / reconnect / receive loop / 原始文本收发 |

## 职责

1. Swift 通过 `PlatformBridgeConnectionClient` 连接 `ws://127.0.0.1:4317/api/platform`。
2. 连接成功后发送 `channel: "platform"` 的 `platform_bridge_hello`。
3. 收到 `platform_request` 后交给 `PlatformBridgeService`，再通过同一 socket 回写 `platform_response`。
4. `AgentServerHealth` 只观察 `ElectronBackedAppServer` 暴露的 availability/fatal 状态，不直接启动或停止 Node 子进程。

桌面端不持有 `/api/thread` client，也不订阅 `/api/activity`。ThreadWindow 的 thread 协议由 React 前端通过 `/api/thread` 处理；StatusBubble 的 activity 协议由 Electron ActivityWindow renderer 通过 `/api/activity` 处理。

## 编辑此目录的约束

- 除 `AgentServerHealth.swift` 作为健康状态与原生 fatal alert 的桥接外，不要在此处新增 `SwiftUI` / `AppKit` 依赖。
- 不要重新引入 Swift 侧 agent-server 子进程启动器或 `/api/activity` subscriber。
- 修改 TS 源码后必须重启 desktop app 才能让 Electron 监督的 agent-server 重新加载。

## 与其他模块的关系

- [Coordinator](/Users/mu9/proj/handAgent/apps/desktop/Sources/Coordinator/coordinator.md) 在 `bootstrap()` 调 `start()`，在 `shutdown()` 调 `stop()`；订阅 `onAvailabilityChange` 与 `onFatalError`。
- [ElectronShell](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/ElectronShell/electron-shell.md) 通过 `ElectronBackedAppServer` 暴露 app-server health、ThreadWindow command client 和 ActivityWindow command client。
- [PlatformBridge](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/PlatformBridge/platform-bridge.md) 走独立 `/api/platform` WebSocket，通过 `channel: "platform"` 处理平台 RPC。

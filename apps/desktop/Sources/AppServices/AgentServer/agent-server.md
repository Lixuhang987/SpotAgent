# AgentServer 模块

管理本地 agent-server 进程的生命周期。

## 文件

| 文件 | 职责 |
|------|------|
| `AgentServerService.swift` | 定位仓库根目录与 Node.js，启动 / 停止 agent-server 子进程；记录启动错误 |
| `AgentServerHealth.swift` | 主线程健康状态桥：订阅 `AppServerManaging` 可用性与 fatal error，向 PromptPanel 暴露可提交状态，并在需要时调用原生 fatal alert |
| `AgentServerRuntimeMode.swift` | 读取 bundle resource marker 与环境变量，决定 agent-server 子进程是否注入 `HANDAGENT_LLM_MODE=mock` |
| `AppServerConnection.swift` | 单条 WebSocket 连接抽象：处理 connect / reconnect / receive loop / 原始文本收发 |
| `AppServer.swift` | AppServer 宿主内核与 `PlatformBridgeConnectionClient`：启动子进程、维护可用性状态、建立 `/api/platform` 连接并转发平台请求 |

## 职责

1. 优先从进程当前工作目录向上查找仓库根目录；若当前目录不是仓库，再回退 Bundle 路径（双重验证：`Package.swift` + `apps/agent-server/src/server/server.ts` 同时存在）。这样从 `.worktrees/<name>/` 执行 `bash ./scripts/swiftw run HandAgentDesktop` 时，agent-server 会使用同一 worktree 的源码。
2. 在 PATH、`/opt/homebrew/bin`、`/usr/local/bin` 中定位 `node` 可执行文件。
3. 设置 `NODE_PATH`，确保 `node_modules` 与 `apps/agent-server/node_modules` 都被解析。
4. 读取 `Contents/Resources/HandAgentRuntimeMode.json`；当 `llmMode` 为 `mock` 时向子进程环境注入 `HANDAGENT_LLM_MODE=mock`。
5. 启动 `node --experimental-transform-types --experimental-specifier-resolution=node apps/agent-server/src/server/server.ts`。
6. 记录 `lastStartupError` 供 UI 展示。
7. 子进程启动后连接 `ws://127.0.0.1:4317/api/platform`，发送 `platform_bridge_hello` 并处理 `PlatformBridgeMessage`。

桌面端 `AppServer` 不再持有 `/api/thread` client，也不维护 ThreadWindow tabs/messages/history。
它不发送 `ThreadCommand`，不解析 `ThreadNotification`；ThreadWindow 的 thread 协议由 React 前端通过 `/api/thread` 处理。

## 设计备注

- 非 `@MainActor`（`@unchecked Sendable`），进程管理在后台执行；回调通过 `DispatchQueue.main.async` 切回主线程，`AppCoordinator` 再用 `Task { @MainActor in ... }` 二次切回。
- 使用 `--experimental-transform-types` 直接运行 TypeScript，无需编译步骤。
- 进程 stdout/stderr 通过 Pipe 捕获但当前未暴露到 UI（仅防止 fd 泄漏）。
- QA 可通过 `bash ./scripts/package-app.sh --mock-llm` 生成带 `HandAgentRuntimeMode.json` 的 `.app`，启动后 agent-server 使用 `MockLLMClient`，不访问真实 LLM 端点。
- **错误恢复**：子进程非零退出码触发自动重启，指数退避 `2^n` 秒（封顶 30s），最多 `maxRestartAttempts = 5` 次；
  - 重启次数超限时通过 `onFatalError(message)` 通知 Coordinator，弹原生 `NSAlert`（"确定" / "查看日志"，后者打开 `~/.spotAgent/`）。
  - `userRequestedStop`（来自 `stop()`）与 `exitCode == 0` 都不会触发重启。
  - 可用性变化通过 `onAvailabilityChange(Bool)` 暴露给 `AgentServerHealth`；`AgentServerHealth.onAvailabilityChange(Bool, String?)` 再把可提交状态同步给 PromptPanel。
  - server 不可用期间 PromptPanel 阻止新 prompt 提交并保留草稿；server 恢复可用后自动解除阻止。

## 编辑此目录的约束

- 除 `AgentServerHealth.swift` 作为健康状态与原生 fatal alert 的桥接外，不要在此处新增 `SwiftUI` / `AppKit` 依赖。
- 启动错误对外只暴露 `lastStartupError: String?` 与 `fatalErrorMessage: String?`；不要直接调 UI。
- 修改 TS 源码后必须重启 desktop app 才能生效（无 hot reload）。

## 与其他模块的关系

- [Coordinator](/Users/mu9/proj/handAgent/apps/desktop/Sources/Coordinator/coordinator.md) 在 `bootstrap()` 调 `start()`，在 `shutdown()` 调 `stop()`；订阅 `onAvailabilityChange` 与 `onFatalError`。
- [ThreadWindow](/Users/mu9/proj/handAgent/apps/desktop/Sources/ThreadWindow/thread-window.md) 只通过 `ThreadWindowWebHost` 接收 Swift 注入的 web app URL、`/api/thread` URL 和初始 prompt。
- [PlatformBridge](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/PlatformBridge/platform-bridge.md) 走独立 `/api/platform` WebSocket，通过 `channel: "platform"` 处理平台 RPC。
- 启动错误传递给 `AgentServerHealth`，由 Coordinator 阻止 PromptPanel 提交并在需要时展示原生 fatal alert。

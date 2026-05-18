# AppServices 层

跨模块共享的应用服务：进程管理、设置存储、会话注册、热键名、激活策略。所有服务都由 [Coordinator](/Users/mu9/proj/handAgent/apps/desktop/Sources/Coordinator/coordinator.md) 持有并通过依赖注入传给上层模块，自身不感知 UI 与窗口。

## 子模块

| 目录 | 文档 | 职责 |
|------|------|------|
| `AgentServer/` | [agent-server.md](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/AgentServer/agent-server.md) | 启动、停止 node 子进程；指数退避重启（最多 5 次）；崩溃过限通过 `onFatalError` 上抛 Coordinator |
| `AgentSettings/` | [agent-settings.md](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/AgentSettings/agent-settings.md) | `~/.spotAgent/settings.json` 读写 + 500ms 轮询；模型配置 UI |
| `Hotkey/` | [hotkey.md](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/Hotkey/hotkey.md) | 全局快捷键名定义（`showPromptPanel` / `captureSelection` / `captureRegion`）；PromptAction 快捷键命名规则 |
| `Lifecycle/` | [lifecycle.md](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/Lifecycle/lifecycle.md) | 根据 SessionWindow / SettingsWindow 计数切换激活策略 |
| `PlatformBridge/` | [platform-bridge.md](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/PlatformBridge/platform-bridge.md) | 反向 IPC：把 macOS 原生能力（剪贴板 / 前台 App / 窗口列表 / ScreenCaptureKit 截图等）通过 WebSocket 暴露给 agent-server |
| `SelectionCapture/` | [selection-capture.md](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/SelectionCapture/selection-capture.md) | 文本选区采集（osascript Cmd-C）+ 用户主动区域截图（保留 `screencapture -i`），由 Coordinator 在 `captureSelection` / `captureRegion` 热键路径调用 |
| `Session/` | [session.md](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/Session/session.md) | 会话摘要注册表；驱动 StatusBubble |

## 文件

| 文件 | 职责 |
|------|------|
| `AppServices.swift` | DI 容器：持有 `agentServer` / `sessionRegistry` / `settingsStore` / `agentServerURL` / `platformBridgeFactory` / `hotkeyRegistrar` / `sessionWindowPresenter` / `settingsWindowPresenter` / `fatalAlertPresenter` / `setActivationPolicy` / `showsStatusBubble`。生产由 `init()` 默认参数装配，测试用 `AppServices.testing()` 注入 nop 替身。同文件还定义 `SessionWindowPresenting` / `SettingsWindowPresenting` / `HotkeyRegistering` / `FatalAlertPresenting` 协议与 `Nop*` 测试替身 |
| `AppServicesProductionImpls.swift` | 生产实现：`ProductionHotkeyRegistrar`（绑定 `KeyboardShortcuts.Name`）+ `ProductionSessionWindowPresenter` / `ProductionSettingsWindowPresenter`（构建 `NSWindow` + `NSHostingController` + 关闭通知监听）+ `ProductionFatalAlertPresenter` |

## DI 协议

| 协议 | 生产实现 | 测试替身 |
|------|---------|---------|
| `AgentServerStarting`（在 `AgentServer/AgentServerService.swift`）| `AgentServerService` | `NopAgentServerService` |
| `PlatformBridgeRunning`（在 `PlatformBridge/PlatformBridgeService.swift`）| `PlatformBridgeService` | 工厂返回 `nil` |
| `HotkeyRegistering` | `ProductionHotkeyRegistrar` | `NopHotkeyRegistrar` |
| `SessionWindowPresenting` | `ProductionSessionWindowPresenter` | `NopSessionWindowPresenter` |
| `SettingsWindowPresenting` | `ProductionSettingsWindowPresenter` | `NopSettingsWindowPresenter` |
| `FatalAlertPresenting` | `ProductionFatalAlertPresenter` | `NopFatalAlertPresenter` |

## 编辑此层的约束

- **服务与 presenter 分层**：`AgentServer` / `AgentSettingsStore` / `SessionRegistry` 等服务保持 UI 无关；生产 window presenter 可以 `import AppKit/SwiftUI`，但只能负责窗口构造与关闭回调，不写业务逻辑。
- **`@Observable` 优先**：`SessionRegistry` / `AgentSettingsStore` 已迁到 `@Observable`；新建状态类不要再用 `ObservableObject` / `@Published` / Combine。
- **依赖通过 init 注入**：`AgentSettingsStore(homeDirectoryURL:)` 这样允许测试注入临时目录；不要在服务内直接读 `FileManager.default.homeDirectoryForCurrentUser` 之外的全局状态。
- **Main actor 隔离**：UI 相关的 `@Observable` class（`SessionRegistry` / `AgentSettingsStore`）标 `@MainActor`，进程 / IO 类（`AgentServerService`）保持非 MainActor。
- **错误对外暴露规则**：服务内部捕获错误后写 `xxxErrorMessage` 字段供 UI 读，不要直接 `fatalError` 或抛到 Coordinator。

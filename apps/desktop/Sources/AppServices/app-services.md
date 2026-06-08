# AppServices 层

跨模块共享的应用服务：AppServer 内核、设置存储、thread 注册、热键名、激活策略。所有服务都由 [Coordinator](/Users/mu9/proj/handAgent/apps/desktop/Sources/Coordinator/coordinator.md) 持有并通过依赖注入传给上层模块，自身不感知 UI 与窗口。

## 子模块

| 目录 | 文档 | 职责 |
|------|------|------|
| `AgentServer/` | [agent-server.md](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/AgentServer/agent-server.md) | `AppServer` 统一内核：启动 node 子进程、维护 `/api/platform` WebSocket、协调平台桥接与健康状态 |
| `ElectronShell/` | [electron-shell.md](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/ElectronShell/electron-shell.md) | feature flag 路径下的 Swift 到 Electron 进程桥、event 解码和 app-server 可用性门控 |
| `AgentSettings/` | [agent-settings.md](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/AgentSettings/agent-settings.md) | `~/.spotAgent/settings.json` 读写 + 500ms 轮询；模型配置 UI |
| `Hotkey/` | [hotkey.md](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/Hotkey/hotkey.md) | 固定系统入口快捷键（`showPromptPanel` / `captureSelection` / `captureRegion`）与 manifest Action 全局快捷键注册 |
| `Lifecycle/` | [lifecycle.md](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/Lifecycle/lifecycle.md) | 根据 ThreadWindow / SettingsWindow 计数切换激活策略 |
| `PlatformBridge/` | [platform-bridge.md](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/PlatformBridge/platform-bridge.md) | 反向 IPC：把 macOS 原生能力（剪贴板 / 前台 App / 窗口列表 / ScreenCaptureKit 截图等）通过 `/api/platform` 暴露给 agent-server |
| `SelectionCapture/` | [selection-capture.md](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/SelectionCapture/selection-capture.md) | 文本选区采集（osascript Cmd-C）+ 用户主动区域截图（保留 `screencapture -i`），由 Coordinator 在 `captureSelection` / `captureRegion` 热键路径调用 |
| `Thread/` | [thread.md](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/Thread/thread.md) | Swift 侧 Thread 摘要注册表与本地历史文件读取；StatusBubble 从注册表派生展示，React ThreadWindow 历史列表不走这里 |

## 文件

| 文件 | 职责 |
|------|------|
| `AppServices.swift` | DI 容器：持有 `appServer` / `threadWindowCommandClient` / `activityWindowCommandClient` / `threadRegistry` / `settingsStore` / `threadHistoryStore` / `actionManifestStore` / `appServerURL` / `platformServerURL` / `threadWindowWebAppURL` / `hotkeyRegistrar` / `threadWindowPresenter` / `settingsWindowPresenter` / `fatalAlertPresenter` / `setActivationPolicy` / `showsStatusBubble` / `showsFatalAlert`。`appServerURL` 是 React ThreadWindow 使用的 `/api/thread` URL，`platformServerURL` 是 Swift 平台桥使用的 `/api/platform` URL，`threadWindowWebAppURL` 是 WKWebView 加载的 React 入口。`showsStatusBubble` 只控制默认路径的 Swift StatusBubble；`showsFatalAlert` 控制 agent-server fatal alert。Electron flag 路径下 `activityWindowCommandClient` 存在，因此 Swift StatusBubble 默认关闭，但 fatal alert 仍保持开启。生产由 `init()` 默认参数装配；`defaultRuntime` 在 `HANDAGENT_ELECTRON_SHELL=1` 时选择 `ElectronBackedAppServer` 作为 app-server、ThreadWindow command client 和 ActivityWindow command client，否则选择默认 `AppServer`。Electron launch config 中 `HANDAGENT_ELECTRON_MAIN` 显式覆盖优先，packaged app 其次使用 `Contents/Resources/ElectronShell/dist/main/main.js` 并通过 `HANDAGENT_ELECTRON_BINARY` 或 PATH 中的 `electron` 启动，开发态再回退到 worktree dist。测试用 `AppServices.testing()` 注入 nop 替身。同文件还定义 `ThreadWindowPresenting` / `SettingsWindowPresenting` / `HotkeyRegistering` / `FatalAlertPresenting` 协议与 `Nop*` 测试替身；`ThreadWindowPresenting` 拆分为 `makeWindow` 和 `show`，确保窗口创建与真实显示/激活分离 |
| `AppServicesProductionImpls.swift` | 生产实现：`ProductionHotkeyRegistrar` / `ProductionThreadWindowPresenter` / `ProductionSettingsWindowPresenter` / `ProductionFatalAlertPresenter`；window presenter 通过 `WindowCloseObservation` 持有和释放关闭通知 token。ThreadWindow presenter 创建阶段不显示窗口，`show(window:)` 才 `makeKeyAndOrderFront` 与激活 App |

`ProductionThreadWindowPresenter` 只负责构建承载 React ThreadWindow 的 `NSWindow` + `NSHostingController`，不持有 thread 协议状态；视觉由 WKWebView 内 React 前端负责。隐藏预热阶段只执行 `makeWindow`，不显示窗口、不激活 App。

`ProductionSettingsWindowPresenter` 构建 Settings `NSWindow` + `NSHostingController`，只有 Settings window 固定浅色 `NSAppearance(.aqua)` 以匹配 warm-canvas 主题。

## DI 协议

| 协议 | 生产实现 | 测试替身 |
|------|---------|---------|
| `AppServerManaging`（在 `AgentServer/AppServer.swift`）| `AppServer` | `NopAppServer` |
| `ElectronShellProcessing`（在 `ElectronShell/ElectronShellProcess.swift`）| `ElectronShellProcess` | 测试内 recording shell |
| `ThreadWindowCommanding`（在 `ElectronShell/ThreadWindowCommanding.swift`）| `ElectronBackedAppServer` | 测试内 recording command client |
| `ActivityWindowCommanding`（在 `ElectronShell/ActivityWindowCommanding.swift`）| `ElectronBackedAppServer` | 测试内 recording command client |
| `HotkeyRegistering` | `ProductionHotkeyRegistrar` | `NopHotkeyRegistrar` |
| `ThreadWindowPresenting` | `ProductionThreadWindowPresenter` | `NopThreadWindowPresenter` |
| `SettingsWindowPresenting` | `ProductionSettingsWindowPresenter` | `NopSettingsWindowPresenter` |
| `FatalAlertPresenting` | `ProductionFatalAlertPresenter` | `NopFatalAlertPresenter` |

## 编辑此层的约束

- **服务与 presenter 分层**：`AppServer` / `AgentSettingsStore` / `ThreadRegistry` 等服务保持 UI 无关；生产 window presenter 可以 `import AppKit/SwiftUI`，但只能负责窗口构造与关闭回调，不写业务逻辑。
- **ThreadWindow 预热边界**：`ThreadWindowPresenting.makeWindow` 只构建隐藏窗口并触发布局加载，不能调用 `makeKeyAndOrderFront` / `NSApp.activate`；真实展示必须走 `show(window:)`，由 `ThreadWindowLifecycle` 决定何时计入激活策略。
- **SettingsWindowPresenting 只注入 ViewModel**：Settings 的 Plugin / Append Prompt / MCP 页面各自直接读写 `~/.spotAgent/plugins` 或 `~/.spotAgent/mcp.json`；presenter 只把 ViewModel 交给 `SettingsView`，不解析配置文件。
- **`@Observable` 优先**：`ThreadRegistry` / `AgentSettingsStore` 已迁到 `@Observable`；新建状态类不要再用 `ObservableObject` / `@Published` / Combine。
- **依赖通过 init 注入**：`AgentSettingsStore(homeDirectoryURL:)` 这样允许测试注入临时目录；不要在服务内直接读 `FileManager.default.homeDirectoryForCurrentUser` 之外的全局状态。
- **Main actor 隔离**：UI 相关的 `@Observable` class（`ThreadRegistry` / `AgentSettingsStore`）标 `@MainActor`，进程 / IO 类（`AgentServerService`）保持非 MainActor。
- **错误对外暴露规则**：服务内部捕获错误后写 `xxxErrorMessage` 字段供 UI 读，不要直接 `fatalError` 或抛到 Coordinator。

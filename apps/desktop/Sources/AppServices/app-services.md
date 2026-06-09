# AppServices 层

跨模块共享的应用服务：Electron shell runtime、平台桥、设置存储、热键名、激活策略。所有服务都由 [Coordinator](/Users/mu9/proj/handAgent/apps/desktop/Sources/Coordinator/coordinator.md) 持有并通过依赖注入传给上层模块，自身不感知 UI 与窗口。

## 子模块

| 目录 | 文档 | 职责 |
|------|------|------|
| `AgentServer/` | [agent-server.md](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/AgentServer/agent-server.md) | `AppServerManaging` health 协议、`/api/platform` WebSocket client、Electron launch 所需仓库根定位 |
| `ElectronShell/` | [electron-shell.md](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/ElectronShell/electron-shell.md) | Swift 到 Electron 进程桥、event 解码、app-server 可用性门控、ThreadWindow/ActivityWindow command client |
| `AgentSettings/` | [agent-settings.md](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/AgentSettings/agent-settings.md) | `~/.spotAgent/settings.json` 读写 + 500ms 轮询；模型配置 UI |
| `Appearance/` | [appearance.md](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/Appearance/appearance.md) | Swift 宿主主题偏好、解析后主题和传给 Electron/React 的 theme payload |
| `Hotkey/` | [hotkey.md](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/Hotkey/hotkey.md) | 固定系统入口快捷键（`showPromptPanel` / `captureSelection` / `captureRegion`）与 manifest Action 全局快捷键注册 |
| `Lifecycle/` | [lifecycle.md](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/Lifecycle/lifecycle.md) | 根据 Electron ThreadWindow / SettingsWindow 计数切换激活策略 |
| `PlatformBridge/` | [platform-bridge.md](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/PlatformBridge/platform-bridge.md) | 反向 IPC：把 macOS 原生能力（剪贴板 / 前台 App / 窗口列表 / ScreenCaptureKit 截图等）通过 `/api/platform` 暴露给 agent-server |
| `SelectionCapture/` | [selection-capture.md](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/SelectionCapture/selection-capture.md) | 文本选区采集（osascript Cmd-C）+ 用户主动区域截图（保留 `screencapture -i`），由 Coordinator 在 `captureSelection` / `captureRegion` 热键路径调用 |

## 文件

| 文件 | 职责 |
|------|------|
| `AppServices.swift` | DI 容器：持有 `appServer` / `threadWindowCommandClient` / `activityWindowCommandClient` / `settingsStore` / `appearanceThemeService` / `appearanceChangeObserver` / `actionManifestStore` / `platformServerURL` / `hotkeyRegistrar` / `settingsWindowPresenter` / `fatalAlertPresenter` / `setActivationPolicy` / `terminateApplication` / `showsFatalAlert` / `promptPanelPresentationMode`。生产 `defaultRuntime` 始终选择 `ElectronBackedAppServer` 作为 app-server health source、ThreadWindow command client 和 ActivityWindow command client；`AppearanceThemeService` 负责宿主主题解析和同步 payload，`SystemAppearanceChangeObserver` 负责监听 macOS 外观变化。测试用 `AppServices.testing()` 注入 nop 替身，并让 PromptPanel controller 创建 panel 但不把窗口展示到屏幕 |
| `AppServicesProductionImpls.swift` | 生产实现：`ProductionHotkeyRegistrar` / `ProductionSettingsWindowPresenter` / `ProductionFatalAlertPresenter`；Settings window presenter 通过 `WindowCloseObservation` 持有和释放关闭通知 token |

## DI 协议

| 协议 | 生产实现 | 测试替身 |
|------|---------|---------|
| `AppServerManaging`（在 `AgentServer/AppServer.swift`）| `ElectronBackedAppServer` | `NopAppServer` / 测试内 recording server |
| `ElectronShellProcessing`（在 `ElectronShell/ElectronShellProcess.swift`）| `ElectronShellProcess` | 测试内 recording shell |
| `ThreadWindowCommanding`（在 `ElectronShell/ThreadWindowCommanding.swift`）| `ElectronBackedAppServer` | `NopThreadWindowCommandClient` / 测试内 recording command client |
| `ActivityWindowCommanding`（在 `ElectronShell/ActivityWindowCommanding.swift`）| `ElectronBackedAppServer` | 测试内 recording command client |
| `AppearanceChangeObserving`（在 `Appearance/AppearanceChangeObserver.swift`）| `SystemAppearanceChangeObserver` | `NopAppearanceChangeObserver` / 测试内 recording observer |
| `HotkeyRegistering` | `ProductionHotkeyRegistrar` | `NopHotkeyRegistrar` |
| `SettingsWindowPresenting` | `ProductionSettingsWindowPresenter` | `NopSettingsWindowPresenter` |
| `FatalAlertPresenting` | `ProductionFatalAlertPresenter` | `NopFatalAlertPresenter` |

## 编辑此层的约束

- **服务与 presenter 分层**：`ElectronBackedAppServer` / `AgentSettingsStore` 等服务保持 UI 无关；生产 window presenter 只能负责窗口构造与关闭回调，不写业务逻辑。
- **Electron-only UI shell**：agent-server supervisor、ThreadWindow、StatusBubble 与 `/api/activity` subscriber 由 Electron/React 路径承载。
- **SettingsWindowPresenting 只注入 ViewModel**：Settings 的 Plugin / Append Prompt / MCP 页面各自直接读写 `~/.spotAgent/plugins` 或 `~/.spotAgent/mcp.json`；presenter 只把 ViewModel 交给 `SettingsView`，不解析配置文件。
- **`@Observable` 优先**：新建状态类使用 `@Observable`，View 使用 `@Bindable` / `@State`。
- **依赖通过 init 注入**：`AgentSettingsStore(homeDirectoryURL:)` 这样允许测试注入临时目录；不要在服务内直接读 `FileManager.default.homeDirectoryForCurrentUser` 之外的全局状态。
- **错误对外暴露规则**：服务内部捕获错误后写 `xxxErrorMessage` 字段供 UI 读，不要直接 `fatalError` 或抛到 Coordinator。
- **宿主退出边界**：Electron clean exit 只能通过 `AppServerManaging.onHostTerminationRequest` 上报给 Coordinator，再由注入的 `terminateApplication` 调用 `NSApplication.terminate`；不要在服务层直接退出 Swift 宿主。

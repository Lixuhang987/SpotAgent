# ElectronShell 模块

`ElectronShell` 是 Phase 0 的可选运行时桥。只有 `HANDAGENT_ELECTRON_SHELL=1` 时，`AppServices.defaultAppServer` 才会使用 `ElectronBackedAppServer`。

## 职责

- 启动 Electron 子进程。
- 通过 stdio newline-delimited JSON 发送 `ElectronShellCommand`，接收 `ElectronShellEvent`。
- 在 `agent_server.health available=true` 与 `thread_window.prepared` 同时成立后，向 `AgentServerHealth` 暴露可提交状态。
- 在 Electron feature flag 路径下连接 `/api/platform`，继续由 Swift `PlatformBridgeService` 执行 macOS 原生能力。
- 当 Electron 退出、renderer crash 或隐藏 ThreadWindow 预热失败时，把错误通过 `startupErrorMessage`、`onAvailabilityChange` 或 `onFatalError` 传给 `AgentServerHealth`。

## 边界

- 不持有 ThreadWindow tabs/messages/history 状态。
- 不解析 `/api/thread` 的 `ThreadNotification`。
- 不执行 ScreenCaptureKit、Accessibility、NSWorkspace、NSPasteboard 以外的新平台能力迁移。
- 不替换默认 `AppServer` 路径；默认路径仍由 Swift 直接启动 agent-server。

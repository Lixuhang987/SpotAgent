# ElectronShell 模块

`ElectronShell` 是 Phase 1 的可选运行时桥。只有 `HANDAGENT_ELECTRON_SHELL=1` 时，`AppServices.defaultRuntime` 才会使用 `ElectronBackedAppServer` 作为 app-server health source 和 Electron ThreadWindow command client。

## 职责

- 启动 Electron 子进程；未设置 `HANDAGENT_ELECTRON_BINARY` 时，默认通过 `pnpm --filter handagent-electron-shell exec electron apps/electron-shell/dist/main/main.js` 从当前 worktree 启动。
- 通过 stdio newline-delimited JSON 发送 `ElectronShellCommand`，接收 `ElectronShellEvent`。
- 主动停机时先发送 `shutdown` command 并关闭子进程 stdin；Electron 未在 2 秒内退出时才兜底 `terminate()`，主动停机不作为 fatal termination 上报。
- 在 `agent_server.health available=true` 与 `thread_window.prepared` 同时成立后，向 `AgentServerHealth` 暴露可提交状态。
- 作为 `ThreadWindowCommanding` 实现，接收 Coordinator 的 prepare/openInitialPrompt/openHistory/focus 意图，并编码为 Electron shell command。
- 在 Electron feature flag 路径下连接 `/api/platform`，继续由 Swift `PlatformBridgeService` 执行 macOS 原生能力。
- visible Electron ThreadWindow 关闭时，通过 `onThreadWindowClosed` 通知 Coordinator 清理打开状态；隐藏预热窗口关闭只影响可提交 gate。
- 当 Electron 退出、renderer crash、隐藏 ThreadWindow 预热失败或隐藏 ThreadWindow 关闭时，把错误通过 `startupErrorMessage`、`onAvailabilityChange` 或 `onFatalError` 传给 `AgentServerHealth`；`thread_window.closed` 的用户可见错误文案是 `Electron ThreadWindow 已关闭，正在重新预热…`。

## 边界

- 不持有 ThreadWindow tabs/messages/history 状态。
- 不解析 `/api/thread` 的 `ThreadNotification`。
- 不执行 ScreenCaptureKit、Accessibility、NSWorkspace、NSPasteboard 以外的新平台能力迁移。
- 不替换默认 `AppServer` 路径；默认路径仍由 Swift 直接启动 agent-server。
- 不承载 PromptPanel、Settings、Hotkey 或焦点恢复；这些仍由 Swift 宿主负责。

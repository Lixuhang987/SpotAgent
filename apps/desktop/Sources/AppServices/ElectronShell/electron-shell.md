# ElectronShell 模块

`ElectronShell` 是 Phase 3 的可选运行时桥。只有 `HANDAGENT_ELECTRON_SHELL=1` 时，`AppServices.defaultRuntime` 才会使用 `ElectronBackedAppServer` 作为 app-server health source、Electron ThreadWindow command client 和 ActivityWindow command client。

## 职责

- 启动 Electron 子进程；`HANDAGENT_ELECTRON_BINARY` 可覆盖 Electron binary，`HANDAGENT_ELECTRON_MAIN` 可覆盖 main entry。未显式覆盖 main entry 时，packaged app 优先使用 `Contents/Resources/ElectronShell/dist/main/main.js`，并通过 `HANDAGENT_ELECTRON_BINARY` 或 PATH 中的 `electron` 启动；开发态回退为 `pnpm --filter handagent-electron-shell exec electron apps/electron-shell/dist/main/main.js`。
- Swift 启动 Electron 时把子进程 stdin 指向 `/dev/null`，避免 Electron CLI 在 pipe stdin 未 EOF 时阻塞加载 main entry；`ElectronShellCommand` 通过 `HANDAGENT_ELECTRON_COMMAND_SOCKET` 指向的本地 Unix domain socket 发送。
- Electron -> Swift 的 `ElectronShellEvent` 仍通过 stdout newline-delimited JSON 回传。
- 主动停机时先通过 command socket 发送 `shutdown` command；Electron 未在 2 秒内退出时才兜底 `terminate()`，主动停机不作为 fatal termination 上报。
- 在 `agent_server.health available=true` 与 `thread_window.prepared` 同时成立后，向 `AgentServerHealth` 暴露可提交状态。
- 作为 `ThreadWindowCommanding` 实现，只接收 Coordinator 的 openInitialPrompt/openHistory/focus 意图；不再接收 prepare 意图。
- 作为 `ActivityWindowCommanding` 实现，接收 Coordinator 的 showActivityWindow 意图，并编码为 `activity_window.show`。
- 在 Electron feature flag 路径下连接 `/api/platform`，继续由 Swift `PlatformBridgeService` 执行 macOS 原生能力。
- visible Electron ThreadWindow 关闭时，通过 `onThreadWindowClosed` 通知 Coordinator 清理打开状态；隐藏预热窗口关闭只影响可提交 gate。
- PromptPanel show/toggle 不触发 ThreadWindow 预热；Electron main 在启动阶段负责 hidden ThreadWindow 预热。
- Electron StatusBubble 点击且无法聚焦 ThreadWindow 时，通过 `prompt_panel.show_requested` 让 Coordinator 打开 Swift PromptPanel。
- 当 Electron 退出、renderer crash、隐藏 ThreadWindow 预热失败或隐藏 ThreadWindow 关闭时，把错误通过 `startupErrorMessage`、`onAvailabilityChange` 或 `onFatalError` 传给 `AgentServerHealth`；`thread_window.closed` 的用户可见错误文案是 `Electron ThreadWindow 已关闭，正在重新预热…`。

## Phase 3 ActivityWindow commands

Swift 通过 `ActivityWindowCommanding.showActivityWindow()` 发送 `activity_window.show`。Electron ack 后只表示窗口 show command 已执行，不代表 `/api/activity` 已产生非 idle 状态。

Electron StatusBubble 点击且无法聚焦 ThreadWindow 时，会发送 `prompt_panel.show_requested`；Swift 只负责打开 PromptPanel，不解析 activity 状态。

## 文件

| 文件 | 职责 |
|------|------|
| `ElectronShellProcess.swift` | 启动 Electron 子进程、通过 Unix socket 写入 command JSON line、读取 stdout event JSON line、处理主动停机和非主动退出 |
| `ElectronShellProtocol.swift` | Swift 端 command/event DTO，必须与 TS `electronShellProtocol.ts` 字段一致 |
| `ElectronBackedAppServer.swift` | Electron flag 路径下的 app-server health gate、ThreadWindow command client、ActivityWindow command client 和 platform bridge 连接管理 |
| `ThreadWindowCommanding.swift` | Coordinator 面向 ThreadWindow 的 command 抽象：open initial prompt、open history、focus |
| `ActivityWindowCommanding.swift` | Coordinator 面向 Electron ActivityWindow 的 show command 抽象 |

## 可用性 gate

- `ElectronBackedAppServer.isAvailable` 必须同时满足 `agent_server.health available=true`、`thread_window.prepared`、没有 agent-server/thread-window 错误。
- `thread_window.prepare_failed` 或 hidden/visible ThreadWindow closed 都会让 `hasPreparedThreadWindow=false`，并发布 unavailable。
- `agent_server.health available=false` 会断开 `/api/platform`；重新 available 后才连接 `PlatformBridgeConnectionClient`。
- visible ThreadWindow closed 才调用 `onThreadWindowClosed`；hidden prewarm 关闭只影响可提交状态。
- ActivityWindow renderer crash 不改变 app-server availability；ThreadWindow renderer crash 会按 fatal 处理。

## 边界

- 不持有 ThreadWindow tabs/messages/history 状态。
- 不解析 `/api/thread` 的 `ThreadNotification`。
- 不订阅 `/api/activity`，不 mirror Electron StatusBubble 状态。
- 不执行 ScreenCaptureKit、Accessibility、NSWorkspace、NSPasteboard 以外的新平台能力迁移。
- 不替换默认 `AppServer` 路径；默认路径仍由 Swift 直接启动 agent-server。
- 不承载 PromptPanel、Settings、Hotkey 或焦点恢复；这些仍由 Swift 宿主负责。

## 修改约束

- 新增或改名 Electron command/event 时，先改 `ElectronShellProtocol.swift`，再同步 `apps/electron-shell/src/main/protocol/electronShellProtocol.ts` 和双方测试。
- 不把 `ThreadCommand` / `ThreadNotification` 引入本目录；Swift 只传 initial prompt payload 和窗口 command。
- `ElectronShellProcess` 的 stdout 只能解析 event；stderr 作为 diagnostic 日志原样转发到宿主 stderr，支持 packaged app stdout/stderr 重定向观察。不要把 Electron diagnostic 写到 stdout。
- Swift->Electron command socket 路径必须保持短路径；macOS `sockaddr_un.sun_path` 长度有限，当前使用 `/tmp/hae-<uuid>.sock`。
- `stop()` 必须清理 callbacks、pending command kind、platform client 和 shell handlers，避免旧 Electron 事件影响下一次 start。

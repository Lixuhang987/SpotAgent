# main

`src/main` 是 Electron main process 源码层。它只负责进程和窗口编排：接收 Swift command、监督 agent-server、创建 Electron 窗口、回报事件。

## 直接子节点

| 子节点 | 子文档 | 职责 |
|------|------|------|
| `protocol/` | [protocol/protocol.md](/Users/mu9/proj/handAgent/apps/electron-shell/src/main/protocol/protocol.md) | Swift <-> Electron JSON command / event 类型与运行时校验 |
| `serverSupervisor/` | [serverSupervisor/serverSupervisor.md](/Users/mu9/proj/handAgent/apps/electron-shell/src/main/serverSupervisor/serverSupervisor.md) | agent-server 后台进程 supervisor，包含 utilityProcess 候选与 Node fallback |
| `swiftBridge/` | [swiftBridge/swiftBridge.md](/Users/mu9/proj/handAgent/apps/electron-shell/src/main/swiftBridge/swiftBridge.md) | stdio newline-delimited JSON bridge |
| `windows/` | [windows/windows.md](/Users/mu9/proj/handAgent/apps/electron-shell/src/main/windows/windows.md) | ThreadWindow hidden prewarm 与 ActivityWindow 控制器 |
| `main.ts` | 无独立文档 | Electron process 入口，组装 bridge、runtime、supervisor、window controllers 和 IPC |
| `electronShellRuntime.ts` | 无独立文档 | 可测试的 command / health / prewarm 状态机 |
| `activityWindowIpc.ts` | 无独立文档 | 只接收 ActivityWindow renderer 发出的 `focusThread` IPC |
| `macosBackgroundApp.ts` | 无独立文档 | macOS accessory activation policy 与 Dock 隐藏 |

## 运行时分层

- `main.ts` 是组合根：读取 env、创建 `JsonLineBridge`、`AgentServerSupervisor`、`ThreadWindowPrewarmer`、`ActivityWindowController`，在 `app.whenReady()` 后应用 macOS 后台 activation policy，再把进程和窗口对象交给 `ElectronShellRuntime`。
- `ElectronShellRuntime` 不直接 import Electron API；它只依赖 `prewarmer`、`activityWindow`、`send`、`stopSupervisor`、`quit` 这组接口，便于测试 command ack、health gate、ActivityWindow native focus 释放 / 点击兜底、host theme fan-out 和预热重入。
- `activityWindowIpc.ts` 必须校验 IPC sender 等于当前 ActivityWindow `webContents`，并只接受 `string | null` thread id；不要让其他 renderer 能通过该 IPC 操作 main。

## 状态机前提

- `agent_server.health available=true` 到达后，runtime 才主动调用 `prewarmer.prepare()`；Swift 不发送 `thread_window.prepare`。
- `theme.changed` command 必须同时调用 ThreadWindow prewarmer 和 ActivityWindow controller 的 `updateTheme()`；Electron main 保存并下发的是 Swift 已解析的 host theme，不在 renderer 侧持久化偏好。
- `prewarmAfterServerReadyPromise` 用来合并并发预热；改动预热流程时必须保持只发一次对应的 prepared / prepare_failed 结果。
- visible ThreadWindow 关闭会先销毁并重新创建 ActivityWindow，再发 `thread_window.closed wasVisible=true`；如果窗口曾 prepared 且 agent-server 仍 available，runtime 会再次主动预热。
- ActivityWindow 点击只尝试聚焦 visible ThreadWindow。没有可聚焦 ThreadWindow 时，main 不创建 PromptPanel，也不回告 Swift 打开 PromptPanel；native focus / native mouse down 兜底同样只做聚焦尝试。
- `shutdown` command 要先 ack，再停止 supervisor 并退出 Electron；关闭 ThreadWindow 或 ActivityWindow 不能停止 agent-server。

## 输出规则

- stdout 只写给 Swift 的 JSON event line；普通日志写 stderr。
- agent-server stdout/stderr 会被 supervisor 加前缀后写 stderr，不能混入 stdout，否则 Swift decoder 会尝试当作事件解析。

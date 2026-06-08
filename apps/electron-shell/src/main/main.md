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

## 运行时分层

- `main.ts` 是组合根：读取 env、创建 `JsonLineBridge`、`AgentServerSupervisor`、`ThreadWindowPrewarmer`、`ActivityWindowController`，再把它们交给 `ElectronShellRuntime`。
- `ElectronShellRuntime` 不直接 import Electron API；它只依赖 `prewarmer`、`activityWindow`、`send`、`stopSupervisor`、`quit` 这组接口，便于测试 command ack、health gate、ActivityWindow native focus 释放 / 点击兜底和预热重入。
- `activityWindowIpc.ts` 必须校验 IPC sender 等于当前 ActivityWindow `webContents`，并只接受 `string | null` thread id；不要让其他 renderer 能通过该 IPC 操作 main。

## 状态机前提

- `agent_server.health available=true` 到达后，runtime 才主动调用 `prewarmer.prepare()`；Swift 不发送 `thread_window.prepare`。
- `prewarmAfterServerReadyPromise` 用来合并并发预热；改动预热流程时必须保持只发一次对应的 prepared / prepare_failed 结果。
- visible ThreadWindow 关闭会先让 ActivityWindow `hide()` 后 `showInactive()`，再发 `thread_window.closed wasVisible=true`；如果窗口曾 prepared 且 agent-server 仍 available，runtime 会再次主动预热。
- ActivityWindow 点击无法聚焦 ThreadWindow 时，main 只发送 `prompt_panel.show_requested` 给 Swift，不自己创建 PromptPanel。该点击入口包括 renderer IPC，也包括 packaged macOS 下 ActivityWindow native focus 已发生但 renderer IPC 未送达的兜底。
- `shutdown` command 要先 ack，再停止 supervisor 并退出 Electron；关闭 ThreadWindow 或 ActivityWindow 不能停止 agent-server。

## 输出规则

- stdout 只写给 Swift 的 JSON event line；普通日志写 stderr。
- agent-server stdout/stderr 会被 supervisor 加前缀后写 stderr，不能混入 stdout，否则 Swift decoder 会尝试当作事件解析。

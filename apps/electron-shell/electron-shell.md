# electron-shell

`apps/electron-shell` 是 Phase 3 Electron UI shell。只有 `HANDAGENT_ELECTRON_SHELL=1` 时由 Swift 启动；默认路径仍由 Swift `WKWebView` 承载 ThreadWindow，并显示 Swift StatusBubble。

## Phase 3 职责

- 通过 stdio newline-delimited JSON 接收 Swift command，回写 Electron event。
- 作为 feature flag 路径下唯一的 agent-server supervisor。
- 在 agent-server 可用后创建隐藏 ThreadWindow `BrowserWindow` 并加载现有 React bundle。
- 处理 `thread_window.open_initial_prompt`、`thread_window.open_history` 和 `thread_window.focus`；`thread_window.prepare` 不再是 Swift command。
- 处理 `activity_window.show`，创建并展示 React StatusBubble ActivityWindow。
- visible ThreadWindow 关闭后回报 `thread_window.closed wasVisible=true`，并在 agent-server 仍可用时重新预热隐藏窗口。
- 向 Swift 回报 `electron.ready`、`agent_server.health`、`thread_window.prepared`、`thread_window.prepare_failed`、`thread_window.closed`、`prompt_panel.show_requested`、`renderer.crashed` 和 `command.ack`。
- 使用 `contextIsolation: true` 与 preload，把 React 需要的 `handAgentThreadWindowConfig` 和初始 prompt receiver 安装到 renderer main world。

## Phase 3 supervisor

- Electron main 在 `app.whenReady()` 后启动唯一 agent-server supervisor。
- supervisor 优先使用 `utilityProcess` 的构建后 JS entry；当前没有 `apps/agent-server/dist/server/server.js` 时，使用 Node child process，并在启动日志中记录 blocker。
- `utilityProcess` supervisor 候选与 Node child fallback 都承载同一套语义：等待 agent-server ready 后发 health、转写 stdout/stderr、非主动退出后指数退避重启、最多 5 次重启后上报最终 unavailable 诊断，Electron shutdown 时停止后台服务且不再调度重启。
- agent-server 是唯一承载 `packages/core` thread/runtime/tool 循环的后台进程。
- 关闭 ThreadWindow 或 ActivityWindow 不停止 agent-server；只有 Electron shutdown 会停止后台服务。
- hidden ThreadWindow 预热由 Electron main 在 agent-server ready 后主动执行。

## Phase 3 StatusBubble

- `ActivityWindowController` 创建 frameless/transparent Electron `BrowserWindow`，加载 `dist/activity-window/index.html`。
- ActivityWindow 使用 `showInactive()` 非激活展示，窗口 `focusable: false`、`skipTaskbar: true`、`alwaysOnTop: true`。
- activity renderer 直接连接 `ws://127.0.0.1:4317/api/activity`，只消费 `AgentActivityEvent`。
- ActivityWindow 的 `webPreferences` 固定为 `contextIsolation: true`、`nodeIntegration: false`。
- preload 只暴露 activity WebSocket URL 和 `focusThread(threadId)`；renderer 不获得 Node/Electron 全量能力。
- 点击气泡后 Electron main 优先聚焦 visible ThreadWindow；如果没有可聚焦窗口，发送 `prompt_panel.show_requested` 给 Swift。

## Phase 3 边界

- 不替换默认 Swift `AppServer` 路径；只有 `HANDAGENT_ELECTRON_SHELL=1` 才启用。
- 不迁移 PromptPanel、Settings、Hotkey、焦点恢复或 macOS platform bridge；这些仍由 Swift 宿主负责。
- 不实现 macOS 原生 platform 能力，平台能力仍走 Swift `/api/platform`。
- 不让 renderer 直接执行 runtime 或平台 tool；React ThreadWindow 仍直接连接 `/api/thread`。
- 不把完整 thread 状态 mirror 到 Electron main；StatusBubble renderer 只订阅 `/api/activity`。

## 验证命令

```bash
pnpm --filter handagent-electron-shell test
pnpm --filter handagent-electron-shell build
```

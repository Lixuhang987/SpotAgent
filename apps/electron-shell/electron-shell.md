# electron-shell

`apps/electron-shell` 是 Phase 1 Electron UI shell。当前只在 `HANDAGENT_ELECTRON_SHELL=1` 时由 Swift 启动。

## Phase 1 职责

- 通过 stdio newline-delimited JSON 接收 Swift command，回写 Electron event。
- 作为 feature flag 路径下唯一的 agent-server supervisor。
- 在 agent-server 可用后创建隐藏 ThreadWindow `BrowserWindow` 并加载现有 React bundle。
- 处理 `thread_window.prepare`、`thread_window.open_initial_prompt`、`thread_window.open_history` 和 `thread_window.focus`。
- visible ThreadWindow 关闭后回报 `thread_window.closed wasVisible=true`，并在 agent-server 仍可用时重新预热隐藏窗口。
- 向 Swift 回报 `electron.ready`、`agent_server.health`、`thread_window.prepared`、`thread_window.prepare_failed`、`thread_window.closed`、`renderer.crashed` 和 `command.ack`。
- 使用 `contextIsolation: true` 与 preload，把 React 需要的 `handAgentThreadWindowConfig` 和初始 prompt receiver 安装到 renderer main world。

## Phase 1 边界

- 不替换默认 Swift `AppServer` 路径；只有 `HANDAGENT_ELECTRON_SHELL=1` 才启用。
- 不迁移 PromptPanel、Settings、Hotkey、焦点恢复或 macOS platform bridge；这些仍由 Swift 宿主负责。
- 不新增 `/api/activity`。
- 不实现 macOS 原生 platform 能力，平台能力仍走 Swift `/api/platform`。
- 不让 renderer 直接执行 runtime 或平台 tool；React ThreadWindow 仍直接连接 `/api/thread`。

## 验证命令

```bash
pnpm --filter handagent-electron-shell test
pnpm --filter handagent-electron-shell build
```

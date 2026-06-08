# electron-shell

`apps/electron-shell` 是 Phase 0 新增的 Electron UI shell。当前只在 `HANDAGENT_ELECTRON_SHELL=1` 时由 Swift 启动。

## Phase 0 职责

- 通过 stdio newline-delimited JSON 接收 Swift command，回写 Electron event。
- 作为 feature flag 路径下唯一的 agent-server supervisor。
- 在 Electron `app.whenReady()` 后等待 agent-server 端口真实可用，再创建隐藏 ThreadWindow `BrowserWindow` 并加载现有 `apps/thread-window-web` bundle。
- 向 Swift 回报 `electron.ready`、`agent_server.health`、`thread_window.prepared`、`thread_window.prepare_failed`、`thread_window.closed`、`renderer.crashed` 和 `command.ack`。
- 使用 `contextIsolation: true` 与 preload，把 React 需要的 `handAgentThreadWindowConfig` 和初始 prompt receiver 安装到 renderer main world。

## Phase 0 边界

- 不替换默认 Swift `AppServer` 路径；只有 `HANDAGENT_ELECTRON_SHELL=1` 才启用。
- 不迁移真实 PromptPanel submit，默认仍打开 Swift `WKWebView` ThreadWindow。
- 不新增 `/api/activity`。
- 不实现 macOS 原生 platform 能力，平台能力仍走 Swift `/api/platform`。

## 验证命令

```bash
pnpm --filter handagent-electron-shell test
pnpm --filter handagent-electron-shell build
```

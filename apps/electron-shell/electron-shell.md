# electron-shell

`apps/electron-shell` 是 Phase 0 新增的 Electron UI shell workspace。Task 1 只建立 package、TypeScript 构建和 Vitest 骨架；Electron main 当前仍是占位入口。

## Phase 0 目标职责

- 通过 stdio newline-delimited JSON 接收 Swift command，回写 Electron event。
- 作为 feature flag 路径下唯一的 agent-server supervisor。
- 在 Electron `app.whenReady()` 后创建隐藏 ThreadWindow `BrowserWindow`，加载现有 `apps/thread-window-web` bundle。
- 向 Swift 回报 `electron.ready`、`agent_server.health`、`thread_window.prepared`、`renderer.crashed` 和 `command.ack`。

这些能力由后续 Phase 0 任务逐步落地；当前骨架提交尚未被 Swift 启动，也尚未监督 agent-server。

## Phase 0 边界

- 不替换默认 Swift `AppServer` 路径。
- 不迁移真实 PromptPanel submit。
- 不新增 `/api/activity`。
- 不实现 macOS 原生 platform 能力，平台能力仍走 Swift `/api/platform`。

## 验证命令

```bash
pnpm --filter handagent-electron-shell test
pnpm --filter handagent-electron-shell build
```

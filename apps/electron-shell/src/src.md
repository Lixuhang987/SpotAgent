# src

`apps/electron-shell/src` 是 Electron shell 源码层。这里按 Electron 进程边界拆分：main process、preload scripts、ActivityWindow renderer。

## 直接子目录

| 子目录 | 子文档 | 职责 |
|------|------|------|
| `main/` | [main/main.md](/Users/mu9/proj/handAgent/apps/electron-shell/src/main/main.md) | Electron main process：Swift bridge、agent-server supervisor、窗口生命周期和 command 路由 |
| `preload/` | [preload/preload.md](/Users/mu9/proj/handAgent/apps/electron-shell/src/preload/preload.md) | ThreadWindow / ActivityWindow 的受控 renderer globals 与 IPC 暴露 |
| `activity-window/` | [activity-window/activity-window.md](/Users/mu9/proj/handAgent/apps/electron-shell/src/activity-window/activity-window.md) | React StatusBubble renderer，订阅 `/api/activity` 并请求聚焦 ThreadWindow |

## 进程边界

- `main/` 可以使用 Electron main API、Node API 和 stdio，但不直接 import 或 new `AgentRuntime`、`ToolRegistry`、`LLMClient` 等 core runtime 对象。
- `preload/` 是 renderer 能力边界，只能通过 `contextBridge` 暴露显式字段或 IPC 方法；不要开启 `nodeIntegration`，不要把 `ipcRenderer` 原样暴露出去。
- `activity-window/` 是 browser/React 代码，只消费 `AgentActivityEvent`；不要在这里连接 `/api/thread`、解析完整 thread 消息或调用 Electron API。
- ThreadWindow renderer 复用 `apps/thread-window-web`，不在本目录复制 ThreadWindow React UI。

## 验证

- 改 main、preload、ActivityWindow renderer 任一目录后，至少运行 `pnpm --filter handagent-electron-shell test`。
- 改 main/preload 或 package 路径后，还要运行 `pnpm --filter handagent-electron-shell build`，确认 `dist/main/main.js` 与 preload 输出存在。

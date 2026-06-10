# electron-shell

`apps/electron-shell` 是桌面端唯一 Electron UI shell。Swift 启动它后，由它监督 agent-server，承载 Electron ThreadWindow 和 React StatusBubble。

## 职责

- 通过 command socket 接收 Swift command，通过 stdout newline-delimited JSON 回写 Electron event。
- 作为唯一的 agent-server supervisor。
- 在 agent-server 可用后创建隐藏 ThreadWindow `BrowserWindow` 并加载现有 React bundle。
- 处理 `thread_window.open_initial_prompt`、`thread_window.open_history` 和 `thread_window.focus`；`thread_window.prepare` 不是 Swift command。
- 处理 Swift 宿主发送的 `theme.changed`，保存当前 host theme，并广播给已准备好的 ThreadWindow renderer。
- 同一 `theme.changed` 还会同步给 ActivityWindow renderer；StatusBubble 不持久化主题，只跟随 Electron main 保存的当前 host theme。
- 处理 `activity_window.show`，创建并展示 React StatusBubble ActivityWindow。
- visible ThreadWindow 关闭后回报 `thread_window.closed wasVisible=true`，并在 agent-server 仍可用时重新预热隐藏窗口。
- 向 Swift 回报 `electron.ready`、`agent_server.health`、`thread_window.prepared`、`thread_window.prepare_failed`、`thread_window.closed`、`renderer.crashed` 和 `command.ack`。
- 使用 `contextIsolation: true` 与 preload，把 React 需要的 `handAgentThreadWindowConfig`、`handAgentTheme`、theme change subscription 和初始 prompt receiver 安装到 renderer main world。
- macOS 下 Electron main 以 accessory activation policy 运行并隐藏 Dock 图标；Electron 只作为后台 UI shell 预热，不应在 Dock / app switcher 中作为独立前台 app 出现。

## Supervisor

- Electron main 在 `app.whenReady()` 后先应用 macOS 后台 activation policy，再启动唯一 agent-server supervisor。
- supervisor 优先使用 `utilityProcess` 的构建后 JS entry；当前没有 `apps/agent-server/dist/server/server.js` 时，使用 Node child process，并在启动日志中记录 blocker。
- `utilityProcess` supervisor 候选与 Node child fallback 都承载同一套语义：等待 agent-server ready 后发 health、转写 stdout/stderr、非主动退出后指数退避重启、最多 5 次重启后上报最终 unavailable 诊断，Electron shutdown 时停止后台服务且不再调度重启。
- agent-server 是唯一承载 `packages/core` thread/runtime/tool 循环的后台进程。
- 关闭 ThreadWindow 或 ActivityWindow 不停止 agent-server；只有 Electron shutdown 会停止后台服务。
- hidden ThreadWindow 预热由 Electron main 在 agent-server ready 后主动执行。
- ThreadWindow 创建时通过 preload `additionalArguments` 获得当前 host theme；后续 `theme.changed` 通过 `handagent:theme-changed` IPC 推送给同一个 renderer。

## StatusBubble

- `ActivityWindowController` 创建 frameless/transparent Electron `BrowserWindow`，加载 `dist/activity-window/index.html`。
- ActivityWindow 使用 `showInactive()` 非激活展示，窗口 `focusable: true`、`acceptFirstMouse: true`、`skipTaskbar: true`、`alwaysOnTop: true`。
- activity renderer 直接连接 `ws://127.0.0.1:4317/api/activity`，只消费 `AgentActivityEvent`。
- ActivityWindow 的 `webPreferences` 固定为 `contextIsolation: true`、`nodeIntegration: false`。
- preload 暴露 activity WebSocket URL、当前 host theme、过滤后的 theme change subscription 和 `focusThread(threadId)`；renderer 不获得 Node/Electron 全量能力。
- 点击气泡后 Electron main 只尝试聚焦 visible ThreadWindow；如果没有可聚焦窗口，点击不再唤起 Swift PromptPanel。

## 边界

- 不迁移 PromptPanel、Settings、Hotkey、焦点恢复或 macOS platform bridge；这些仍由 Swift 宿主负责。
- 不实现 macOS 原生 platform 能力，平台能力仍走 Swift `/api/platform`。
- 不让 renderer 直接执行 runtime 或平台 tool；React ThreadWindow 仍直接连接 `/api/thread`。
- 不把完整 thread 状态 mirror 到 Electron main；StatusBubble renderer 只订阅 `/api/activity`。

## 直接子节点

| 子节点 | 文档 | 职责 |
|------|------|------|
| `src/` | [src/src.md](/Users/mu9/proj/handAgent/apps/electron-shell/src/src.md) | Electron main、preload、ActivityWindow renderer 源码 |
| `tests/` | [tests/tests.md](/Users/mu9/proj/handAgent/apps/electron-shell/tests/tests.md) | Electron shell 的 Vitest 单元测试 |
| `package.json` | 无独立文档 | workspace 包声明；`build` 同时编译 main/preload 并打包 activity renderer |
| `tsconfig.json` | 无独立文档 | main 与 preload 的 NodeNext TypeScript 编译，输出到 `dist/` |
| `tsconfig.activity-window.json` | 无独立文档 | ActivityWindow renderer 的 React/Vite TypeScript 检查，不直接输出 |
| `vite.activity-window.config.ts` | 无独立文档 | 以 `src/activity-window` 为 root，输出 `dist/activity-window` |
| `vitest.config.ts` | 无独立文档 | Node 环境运行 `tests/**/*.test.ts` |
| `dist/` | 不纳入仓库文档 | build 产物；packaged app 会复制其中 `main/main.js` |
| `node_modules/` | 不纳入仓库文档 | pnpm 安装产物 |

## 构建约束

- `pnpm --filter handagent-electron-shell build` 先用 `tsc -p tsconfig.json` 编译 main/preload 到 `dist/`，再用 `tsc -p tsconfig.activity-window.json` 检查 ActivityWindow renderer，最后用 Vite 输出 `dist/activity-window`。
- Swift packaged app 路径依赖 `dist/main/main.js`；修改 main/preload 后必须重新 build，不能只跑 ActivityWindow Vite。
- `src/activity-window` 可以使用 React 和 browser API；`src/main` 可以使用 Electron/Node；`src/preload` 只能暴露受控 globals，不把 Node/Electron 全量能力泄漏给 renderer。

## 验证命令

```bash
pnpm --filter handagent-electron-shell test
pnpm --filter handagent-electron-shell build
```

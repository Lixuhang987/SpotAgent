# windows

`windows/` 封装 Electron main process 中的窗口生命周期。它不持有 thread 消息状态，也不订阅 `/api/activity`；renderer 自己连接对应 WebSocket。

## 文件

| 文件 | 职责 |
|------|------|
| `threadWindowPrewarmer.ts` | 全局唯一 ThreadWindow `BrowserWindow` 的 hidden prewarm、initial prompt 注入、show/focus 和 close 状态 |
| `activityWindowController.ts` | React StatusBubble ActivityWindow 的创建、定位、非激活展示、host theme 下发和 renderer crash 回调 |

## ThreadWindow 前提

- `prepare()` 创建 `show: false` 的 `BrowserWindow`，启用 `contextIsolation: true`、`nodeIntegration: false`，并加载 `/thread-window/index.html`。
- `prepare()` 必须等待 `did-finish-load` 或 `loadURL` promise 成功后才把 `prepared` 置 true；加载失败或窗口关闭必须 reject。
- `openInitialPrompt()` 会先确保 prepared，再通过 `executeJavaScript("window.handAgentReceiveInitialPrompt(...)")` 注入 initial prompt，最后才 show/focus。
- initial prompt JSON 注入前会把 `<` 转义为 `\u003c`，避免脚本上下文中出现 HTML 结束标签风险。
- `focus()` 只有窗口存在且已经 visible 时才返回 true；不可用时 runtime 不再请求 Swift 打开 PromptPanel。
- `closed` 事件要回传 `wasPrepared` 和 `wasVisible`，让 runtime 区分 hidden prewarm 失败和用户可见窗口关闭。

## ActivityWindow 前提

- ActivityWindow 是 frameless、transparent、alwaysOnTop、skipTaskbar、focusable true、acceptFirstMouse true、resizable false 的小窗；`showInactive()` 负责初始非激活展示，`focusable` 不能设为 false，否则 macOS packaged CGEvent 点击可能只激活 Electron 而不触发 StatusBubble renderer IPC。
- `show()` 每次都会按 primary work area 重新计算右下角 bounds，再用 `showInactive()` 显示，避免抢焦点。
- ActivityWindow 只 load `dist/activity-window/index.html`；状态数据由 renderer 通过 `/api/activity` 获取。
- ActivityWindow controller 保存当前 host theme；新建窗口时通过 preload `additionalArguments` 传入初始 theme，窗口已加载后通过 `handagent:theme-changed` IPC 推送后续 theme。
- ActivityWindow 的 native `focus` 和 `before-mouse-event` 左键 `mouseDown` 要作为 renderer click IPC 的兜底上报给 runtime：如果 visible ThreadWindow 可聚焦则聚焦 ThreadWindow，否则不做 PromptPanel 回退。`before-mouse-event` 兜底要阻止对应 page mouse event，避免 renderer click IPC 再次发送同一点击意图。
- visible ThreadWindow 关闭后，runtime 会让 ActivityWindow 销毁旧 `BrowserWindow` 并重新创建一个 `showInactive()` 窗口，用新的 native window identity 释放旧窗口的 native focus / AXMain 状态，让下一次点击重新产生 focus 或 mouse event；这不会直接触发 PromptPanel。
- renderer crash 只上报 `renderer.crashed window: "activity"`；不回退到 Swift StatusBubble，也不代表 agent-server 不可用。

## 修改约束

- 不在窗口控制器里解析 `ThreadCommand`、`ThreadNotification` 或 `AgentActivityEvent`。
- 改 BrowserWindow security 选项时，必须同时检查 `src/preload/preload.md` 中的暴露边界。
- 改窗口 close/prewarm 语义时，同步更新 `tests/windows/threadWindowPrewarmer.test.ts` 和 `tests/main/electronShellRuntime.test.ts`。

# preload

`preload/` 是 Electron renderer 的能力边界。ThreadWindow 和 ActivityWindow 都在 `contextIsolation: true`、`nodeIntegration: false` 下运行，只能使用这里显式暴露的 globals。

## 文件

| 文件 | 职责 |
|------|------|
| `threadWindowPreload.ts` | 向 ThreadWindow main world 注入 `/api/thread` URL、pending initial prompt 队列和临时 receiver |
| `activityWindowPreload.ts` | 向 ActivityWindow main world 注入 `/api/activity` URL，并暴露 `focusThread(threadId)` IPC |

## ThreadWindow preload

- 通过 `contextBridge.executeInMainWorld()` 写入 `window.handAgentThreadWindowConfig.threadWebSocketURL`。
- 初始化 `window.handAgentPendingInitialPrompts`，并在 React receiver 尚未安装时提供临时 `window.handAgentReceiveInitialPrompt(payload)`。
- 如果 React 已经安装正式 receiver，preload 必须保留它，不覆盖。
- `handAgentElectron` 只暴露轻量 feature marker，不提供 Electron 或 Node 能力。

## ActivityWindow preload

- 通过 `contextBridge.executeInMainWorld()` 写入 `window.handAgentActivityWindowConfig.activityWebSocketURL`。
- 通过 `contextBridge.exposeInMainWorld()` 暴露 `handAgentActivityWindow.focusThread(threadId)`。
- `focusThread` 只发送 `"activity-window:focus-thread"` IPC；main 侧仍要校验 sender 和参数类型。

## 修改约束

- 不暴露 `ipcRenderer`、`require`、文件系统、process env 或任意 Node/Electron 对象。
- 新增 renderer 能力必须是最小函数或只读 config，并在 main 侧做 sender / payload 校验。
- 改 window global 名称时，必须同步更新对应 React renderer、`apps/thread-window-web` native config 测试，以及 `tests/preload/*`。

# activity-window

`activity-window/` 是 Electron ActivityWindow 的 React renderer。它只负责 StatusBubble UI 展示和点击请求，不参与 ThreadWindow 的完整 thread 协议。

## 文件

| 文件 | 职责 |
|------|------|
| `App.tsx` | 创建 `ActivitySocketClient`，把 activity state 映射成按钮 UI，点击时请求 main 聚焦 thread |
| `activitySocketClient.ts` | `/api/activity` WebSocket client，解析 `AgentActivityEvent`、忽略非法消息、断线后有限重连 |
| `activityState.ts` | 将 `activity.snapshot` / `activity.changed` 规约成 renderer state 和展示文案 |
| `main.tsx` | React root 挂载入口 |
| `index.html` | Vite ActivityWindow HTML entry |
| `styles.css` | 透明窗口里的 272x76 StatusBubble 样式 |

## 数据边界

- WebSocket URL 来自 preload 注入的 `window.handAgentActivityWindowConfig.activityWebSocketURL`，默认 fallback 是 `ws://127.0.0.1:4317/api/activity`。
- 本目录只接受 `AgentActivityEvent`，不解析 `ThreadNotification`、`ServerRequest`、`ThreadCommand` 或 `ClientResponse`。
- `reduceActivityEvent()` 直接用最新 event 覆盖当前 state；activity snapshot 与 changed 使用同一套字段。
- `ActivitySocketClient` 会忽略 malformed JSON、错误 channel、非法 status/waitingRequest；不要把 parser 放宽到完整 thread 消息。
- 断线重连默认 1 秒间隔，最多 20 次；手动 `close()` 必须取消 timer 并关闭 socket。

## 交互边界

- 点击气泡只调用 `window.handAgentActivityWindow.focusThread(activeThreadId ?? null)`；renderer 不直接调用 Electron API。
- `focusThread` 最终由 main 校验 sender 后处理。没有 active thread 或无法聚焦时，由 main 请求 Swift 打开 PromptPanel。
- ActivityWindow 自身是 `focusable: false`，UI 不能依赖键盘焦点常驻；可访问性文案应放在按钮文本中。

## 修改约束

- 不在本目录实现 tool、permission、workspace 回执；这些仍属于 React ThreadWindow 的 `/api/thread` UI。
- 不引入 Node/Electron import；renderer 能力只能来自 preload 暴露的 `window.handAgentActivityWindow*`。
- 改 activity 字段或状态枚举时，先更新 `packages/core/src/protocol/AgentActivity.ts`，再更新 parser、state reducer 和 `tests/activity-window/*`。

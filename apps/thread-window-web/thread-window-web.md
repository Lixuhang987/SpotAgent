# thread-window-web

`apps/thread-window-web` 是 ThreadWindow 的 React 前端。它由 Swift `WKWebView` 加载，直接连接 `ws://127.0.0.1:4317/api/thread`，管理 thread 历史、tabs、消息、请求回执和 composer。

## 目录职责

| 路径 | 职责 |
|------|------|
| `src/protocol/` | ThreadCommand / ThreadNotification / ServerRequest / ClientResponse 的 TS 编码与类型守卫 |
| `src/thread/` | WebSocket client、重连、命令发送 |
| `src/store/` | `zustand + immer` ThreadWindow 状态源 |
| `src/components/` | 历史侧栏、tab、消息、请求面板、输入区 |
| `src/styles/` | Tailwind CSS 样式入口 |
| `src/native/` | Swift 注入配置和初始 prompt 接收 |

## 边界

- React 直接持有 `/api/thread` socket。
- socket client 只负责收发、重连和回调派发，不直接改 UI 状态。
- UI 状态以 `zustand + immer` store 为唯一状态源。
- 组件只调用明确 action 或上层 callback，不直接写 WebSocket。
- Swift 不解析 thread notification，不发送 thread command。
- platform tool 仍由 Swift 通过 `/api/platform` 处理。
- 首版不做 StatusBubble 摘要同步。

## 常用命令

```bash
pnpm --filter handagent-thread-window-web test
pnpm --filter handagent-thread-window-web build
```

## 相关文档

- Swift WebView host：[ThreadWindow](/Users/mu9/proj/handAgent/apps/desktop/Sources/ThreadWindow/thread-window.md)
- agent-server socket：[server](/Users/mu9/proj/handAgent/apps/agent-server/src/server/server.md)
- protocol DTO：[protocol](/Users/mu9/proj/handAgent/packages/core/src/protocol/protocol.md)

# ThreadWindow ChatGPT 风格 UI 历史记录

> **状态：历史废弃。**
> 本文件路径来自早期命名；历史旧称 `SessionWindow` 当前已更名为 `ThreadWindow`。
> 本文件不再作为当前实施依据，不应按旧 Swift 视图方案继续开发。

## 当前实施依据

- React ThreadWindow 前端：[apps/thread-window-web/thread-window-web.md](/Users/mu9/proj/handAgent/apps/thread-window-web/thread-window-web.md)
- Swift WKWebView host：[apps/desktop/Sources/ThreadWindow/thread-window.md](/Users/mu9/proj/handAgent/apps/desktop/Sources/ThreadWindow/thread-window.md)
- 手工验收入口：[docs/manual-qa.md](/Users/mu9/proj/handAgent/docs/manual-qa.md)

## 当前边界

- ThreadWindow UI 已迁移为 `apps/thread-window-web` React 前端。
- Swift 只负责 `WKWebView` 宿主、窗口生命周期、资源加载配置和 initial prompt 注入。
- React 直接连接 `/api/thread`，发送 `ThreadCommand`，接收 `ThreadNotification` / `ServerRequest`，并负责 tabs、历史侧栏、消息流、权限面板、workspace 面板和 composer 渲染。
- Swift 不再发送 `ThreadCommand`，不再渲染 assistant bubbles，也不再持有 ThreadWindow 的 tab/message/history 状态。

## 保留原因

本文件仅用于追溯 2026-06-08 ChatGPT 风格 UI 诉求的历史来源。当前开发、验收和文档更新必须以 `apps/thread-window-web/thread-window-web.md` 与 `apps/desktop/Sources/ThreadWindow/thread-window.md` 为准。

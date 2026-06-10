# main

`tests/main` 覆盖 Electron main process 的纯状态机和 IPC sender 校验。

## 文件

| 文件 | 覆盖对象 |
|------|------|
| `electronShellRuntime.test.ts` | `src/main/electronShellRuntime.ts` 的 command ack、health gate、startup prewarm、theme fan-out、window close 和 shutdown |
| `activityWindowIpc.test.ts` | `src/main/activityWindowIpc.ts` 的 sender 校验与 `string | null` thread id 限制 |
| `macosBackgroundApp.test.ts` | `src/main/macosBackgroundApp.ts` 的 macOS accessory activation policy 与 Dock 隐藏 |

## 测试前提

- 不创建真实 `BrowserWindow` 或 Electron app；runtime 测试通过 fake `prewarmer`、fake `activityWindow`、fake `send` 验证事件。
- 改 `agent_server.health`、`thread_window.prepared`、`thread_window.prepare_failed`、`thread_window.closed`、`theme.changed`、ActivityWindow native focus 释放、native focus / mouse down 兜底或 StatusBubble 点击聚焦语义时，优先在 `electronShellRuntime.test.ts` 加断言。
- ActivityWindow IPC 测试必须覆盖非当前 renderer sender 被忽略，避免任意 renderer 触发 focus/prompt 行为。

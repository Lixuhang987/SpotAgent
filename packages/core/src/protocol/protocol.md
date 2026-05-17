# protocol

desktop ↔ agent-server 的 WebSocket 协议。所有跨进程消息走 `SessionMessage`（17 个变体的判别联合）。这是 TS / Swift 双侧对齐的唯一来源。

## 文件

| 文件 | 职责 |
|------|------|
| `SessionMessage.ts` | `SessionMessage`（判别联合）/ `SessionListEntry` / `UserMessageAttachment` / `PlatformResponsePayload` |

## 消息分类

| 分类 | 类型 | 方向 |
|------|------|------|
| 会话生命周期 | `open_session` | desktop → server |
| | `user_message` | desktop → server |
| | `assistant_message_start` / `_delta` / `_end` | server → desktop |
| | `tool_message`（`SessionManager` 把 `tool_call` → `running`，`tool_result` → `completed`/`failed`） | server → desktop |
| | `status` | server → desktop |
| | `interrupt` | desktop → server（当前未处理） |
| | `session_snapshot` | server → desktop |
| | `error` | server → desktop |
| 历史读写 | `list_sessions_request` / `_response` | desktop ↔ server |
| | `load_session_request` / `_response` | desktop ↔ server |
| | `delete_session_request` | desktop → server |
| 权限审批 | `permission_request` | server → desktop |
| | `permission_response` | desktop → server |
| 平台反向 IPC | `platform_bridge_hello` | desktop → server（标识此 socket 是 bridge 通道） |
| | `platform_request` | server → desktop |
| | `platform_response` | desktop → server |

每条消息共享外层骨架：

```ts
{
  type: <字面量>,
  sessionId: string,    // 平台 RPC 用魔法值 "_platform"
  messageId: string,
  timestamp: string,    // ISO 8601
  payload: <按 type 分支>,
}
```

## 附件

`UserMessageAttachment` 当前两类：

- `text_selection`：纯文本选区。
- `image`：base64 图片（`image/png | image/jpeg | image/webp`）。

注：当前 `SessionManager.composeUserContent` 把 `image` 附件展平为字符串占位 `[图片附件: image/png (id)]`，**LLM 实际看不到原始图像字节**（架构改进项）。

## 平台 RPC 帧

```json
// platform_request
{
  "type": "platform_request",
  "sessionId": "_platform",
  "messageId": "...",
  "timestamp": "...",
  "payload": {
    "requestId": "...",
    "method": "screen.capture",
    "args": {...},
    "timeoutMs": 15000
  }
}

// platform_response
{
  "type": "platform_response",
  "sessionId": "_platform",
  "messageId": "...",
  "timestamp": "...",
  "payload": {
    "requestId": "...",
    "status": "ok",
    "result": {...}
  }
}
```

## 编辑此目录的约束

- 协议是合约，desktop（Swift）与 agent-server（TS）必须严格对齐字段。**改这里就要同时改 [SessionSocketClient](/Users/mu9/proj/handAgent/apps/desktop/Sources/SessionWindow/session-window.md) 与 [SessionManager](/Users/mu9/proj/handAgent/apps/agent-server/agent-server.md)**。
- 新增 type 时考虑：是否同时影响 `SessionStore` 持久化、`ConversationMessage` UI、`SessionEvent` 审计三处。
- 协议字段保持平铺，不要嵌套 anyJson 黑洞，让两边 codec 都能强类型化。
- `sessionId` 当前承担两个角色：会话标识 + 平台 RPC magic（`"_platform"`）。这是已知 smell，新流量不要再叠加角色。

## 相关文档

- TS 处理方：[apps/agent-server/agent-server.md](/Users/mu9/proj/handAgent/apps/agent-server/agent-server.md)
- Swift 处理方：[apps/desktop/Sources/SessionWindow/session-window.md](/Users/mu9/proj/handAgent/apps/desktop/Sources/SessionWindow/session-window.md) / [PlatformBridge](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/PlatformBridge/platform-bridge.md)
- 平台 RPC 接口：[platform/platform.md](/Users/mu9/proj/handAgent/packages/core/src/platform/platform.md)
- UI 模型：[conversation/conversation.md](/Users/mu9/proj/handAgent/packages/core/src/conversation/conversation.md)

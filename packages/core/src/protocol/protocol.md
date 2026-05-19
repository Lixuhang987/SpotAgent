# protocol

desktop ↔ agent-server 的 WebSocket 协议。会话流量走 `SessionMessage`，平台反向 RPC 走 `PlatformBridgeMessage`。两个 union 共享同一 WebSocket 入口，但平台帧用 `channel: "platform"` 显式分流，不再复用会话 `sessionId`。

## 文件

| 文件 | 职责 |
|------|------|
| `SessionMessage.ts` | `SessionMessage`（会话、历史、权限审批帧）/ `SessionListEntry` / `UserMessageAttachment` |
| `PlatformBridgeMessage.ts` | `PlatformBridgeMessage`（平台反向 RPC 帧）/ `PlatformResponsePayload` |

## 消息分类

| 分类 | 类型 | 方向 |
|------|------|------|
| 会话生命周期 | `open_session` | desktop → server（首次连接 / 重连订阅） |
| | `user_message` | desktop → server |
| | `assistant_message_start` / `_delta` / `_end` | server → desktop |
| | `tool_message`（`MessageTranslator` 把 `tool_call` → `running`，`tool_result` → `completed`/`failed`） | server → desktop |
| | `status` | server → desktop |
| | `interrupt` | desktop → server（当前未处理） |
| | `session_snapshot` | server → desktop |
| | `error` | server → desktop |
| 历史读写 | `list_sessions_request` / `_response` | desktop ↔ server |
| | `load_session_request` / `_response` | desktop ↔ server |
| | `delete_session_request` | desktop → server |
| 权限审批 | `permission_request` | server → desktop |
| | `permission_response` | desktop → server |
| 平台反向 IPC | `platform_bridge_hello` | desktop → server（`channel: "platform"`，标识此 socket 是 bridge 通道） |
| | `platform_request` | server → desktop（`channel: "platform"`） |
| | `platform_response` | desktop → server（`channel: "platform"`） |

会话消息共享外层骨架：

```ts
{
  type: <字面量>,
  sessionId: string,
  messageId: string,
  timestamp: string,    // ISO 8601
  payload: <按 type 分支>,
}
```

平台消息共享外层骨架：

```ts
{
  channel: "platform",
  type: "platform_bridge_hello" | "platform_request" | "platform_response",
  messageId: string,
  timestamp: string,
  payload: <按 type 分支>,
}
```

## 会话恢复握手

- SessionWindow 首次连接和 socket 断线重连后都会发送 `open_session`。
- agent-server 若在 store 中找到对应 `sessionId`，会返回 `session_snapshot`，用于恢复窗口内的消息列表和状态。
- 如果 session 不存在，`open_session` 不创建新会话；首次用户输入仍由 `user_message` 创建并触发 runtime。

## 附件

`UserMessageAttachment` 当前两类：

- `text_selection`：纯文本选区。
- `image`：base64 图片（`image/png | image/jpeg | image/webp`）。

注：`MessageTranslator.composeUserContent` 会把 `image` 附件写入 BlobStore，并在持久化 user message 中插入空 body 的 image STUB；原始 base64 不进入会话历史。agent-server 在调用 runtime 前会把 image STUB 展开为 `{ type: "image"; blobId; mimeType }`，由 LLM adapter 按需读取 blob 并发送多模态消息。

## 平台 RPC 帧

```json
// platform_request
{
  "channel": "platform",
  "type": "platform_request",
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
  "channel": "platform",
  "type": "platform_response",
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

- 协议是合约，desktop（Swift）与 agent-server（TS）必须严格对齐字段。**改这里就要同时改 [SessionSocketClient](/Users/mu9/proj/handAgent/apps/desktop/Sources/SessionWindow/session-window.md) 与 [SessionRouter / MessageTranslator](/Users/mu9/proj/handAgent/apps/agent-server/agent-server.md)**。
- 新增 type 时考虑：是否同时影响 `SessionStore` 持久化、`ConversationMessage` UI、`SessionEvent` 审计三处。
- 协议字段保持平铺，不要嵌套 anyJson 黑洞，让两边 codec 都能强类型化。
- 平台 RPC 不带 `sessionId`；server 只通过 `channel: "platform"` 分派平台帧。

## 相关文档

- TS 处理方：[apps/agent-server/agent-server.md](/Users/mu9/proj/handAgent/apps/agent-server/agent-server.md)
- Swift 处理方：[apps/desktop/Sources/SessionWindow/session-window.md](/Users/mu9/proj/handAgent/apps/desktop/Sources/SessionWindow/session-window.md) / [PlatformBridge](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/PlatformBridge/platform-bridge.md)
- 平台 RPC 接口：[platform/platform.md](/Users/mu9/proj/handAgent/packages/core/src/platform/platform.md)
- UI 模型：[conversation/conversation.md](/Users/mu9/proj/handAgent/packages/core/src/conversation/conversation.md)

# protocol

`packages/core/src/protocol` 定义 desktop、app-server、core 之间的跨进程协议边界。当前主路径是三层单向流转：

- desktop 只提交 `SessionCommand`，并回覆 `ClientResponse`
- app-server / core 只向 desktop 推送 `SessionEvent`，并在需要用户决定时发 `ServerRequest`
- 平台 RPC 独立于会话主路径，继续走 `PlatformBridgeMessage`

旧 `SessionMessage` 仍保留在仓库里，仅用于迁移兼容，不再代表当前主协议。

## 文件

| 文件 | 职责 |
|------|------|
| `SessionCommand.ts` | 新命令协议：`session_create` / `session_subscribe` / `turn_start` / `turn_interrupt` / `sessions_list` / `session_delete` |
| `SessionEvent.ts` | 新事件协议：`session_created` / `session_snapshot` / `turn_started` / `assistant_delta` / `tool_started` / `turn_completed` 等 |
| `ServerRequest.ts` | 新待回执请求：`permission_ask` / `workspace_ask` |
| `ClientResponse.ts` | 新回执协议：`permission_answer` / `workspace_answer` |
| `SessionProtocolShared.ts` | 共享类型：`RunStatus` / `SessionListEntry` / `WorkspaceAskCandidate` / `UserMessageAttachment` |
| `SessionMessage.ts` | 旧单 union 协议；仅迁移兼容 |
| `PlatformBridgeMessage.ts` | `PlatformBridgeMessage`（平台反向 RPC 帧）/ `PlatformResponsePayload` |

## 单向边界

```mermaid
flowchart LR
  A[desktop] -->|SessionCommand| B[app-server]
  B -->|submit| C[core AgentSessionHandle]
  C -->|SessionEvent| B
  B -->|SessionEvent| A
  B -->|ServerRequest| A
  A -->|ClientResponse| B
  B -->|PlatformBridgeMessage| A
```

- desktop 不直接驱动 `AgentRuntime`，只发命令、收事件。
- app-server 负责 socket、订阅路由、持久化、权限 / workspace 回执桥接。
- core 负责把命令转成 runtime 执行，并把执行结果归一化成稳定事件流。

## 主协议分类

### `SessionCommand`

- `session_create`
- `session_subscribe`
- `session_unsubscribe`
- `turn_start`
- `turn_interrupt`
- `sessions_list`
- `session_delete`

### `SessionEvent`

- `session_created`
- `session_snapshot`
- `user_message_recorded`
- `turn_started`
- `assistant_delta`
- `tool_started`
- `tool_finished`
- `turn_completed`
- `session_status_changed`
- `sessions_listed`
- `session_deleted`
- `session_error`

### `ServerRequest` / `ClientResponse`

- `permission_ask` <-> `permission_answer`
- `workspace_ask` <-> `workspace_answer`

这两组消息只用于“server 发起问题，等待 UI 回执”的少量交互，不承担普通会话流。

## 单连接订阅模型

- desktop 进程固定只有一条到 `app-server` 的长连接。
- tab 打开时发送 `session_subscribe(sessionId)`，关闭时发送 `session_unsubscribe(sessionId)`。
- `session_subscribe` 的结果是 `session_snapshot`，不是新建 socket，也不是额外握手通道。
- 所有 `SessionEvent` 与 `ServerRequest` 都带 `sessionId`，由 desktop 本地总线按会话分发。

## core 侧消费方式

- `AgentSessionHandle.submit(command)` 当前只消费 runtime 相关命令：`turn_start`、`turn_interrupt`。
- `AgentSessionHandle.nextEvent()` 顺序吐出 `SessionEvent`，由 app-server 转发给 desktop。
- `AgentRuntimeEvent` 到 `SessionEvent` 的归一化在 core 内完成，app-server 不再把 runtime 内部事件直接暴露给 UI。

## 兼容层：`SessionMessage`

迁移完成前，旧 `SessionMessage` 仍存在，供旧链路兼容。它不再是当前推荐的协议模型。

### 旧消息分类

| 分类 | 类型 | 方向 |
|------|------|------|
| 会话生命周期 | `create_session_request` / `_response` | desktop ↔ server（创建新 session，可携带 initialText / attachments / actionBinding） |
| | `open_session` | desktop → server（首次连接 / 重连订阅） |
| | `user_message` | desktop → server |
| | `assistant_message_start` / `_delta` / `_end` | server → desktop |
| | `tool_message`（`MessageTranslator` 把 `tool_call` → `running`，`tool_result` → `completed`/`failed`） | server → desktop |
| | `status` | server → desktop |
| | `interrupt` | desktop → server（中断当前 session run） |
| | `session_snapshot` | server → desktop |
| | `error` | server → desktop |
| 历史读写 | `list_sessions_request` / `_response` | desktop ↔ server |
| | `load_session_request` / `_response` | desktop ↔ server |
| | `delete_session_request` | desktop → server |
| 权限审批 | `permission_request` | server → desktop |
| | `permission_response` | desktop → server |
| Workspace 选择 | `workspace_ask_request` | server → desktop |
| | `workspace_ask_response` | desktop → server |
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

- 旧链路下，SessionWindow 首次连接和 socket 断线重连后都会发送 `open_session`。
- agent-server 若在 store 中找到对应 `sessionId`，会返回 `session_snapshot`，用于恢复窗口内的消息列表和状态。
- 如果 session 不存在，`open_session` 不创建新会话；首次用户输入仍由 `user_message` 创建并触发 runtime。

## Action Binding

新协议下，plugin action 绑定信息位于 `session_create.payload.actionBinding`。app-server 会重新读取本地 manifest，确认该 prompt 是可绑定的 plugin action，解析并持久化 session metadata 的 `actionBinding.mcpServerIds`，随后只在该 session 的 runtime 前组合对应 MCP tools。`kind: "skill"` 的 action 只提交渲染后的普通 prompt，不携带 action binding。

普通 `turn_start` 不携带 action binding；一个 session 的 MCP scope 由创建时 metadata 决定，不随后续消息变化。

## 会话中断

- 主路径下，SessionWindow 运行态 Stop 控件发送 `turn_interrupt`，不会断开 socket。
- core handle 在中断后输出 `turn_completed(status: "interrupted")` 与 `session_status_changed(value: "interrupted")`。
- 已中断 run 的后续 assistant delta、tool result 与最终 runtime result 不再继续产出新事件。

## 附件

`UserMessageAttachment` 当前两类：

- `text_selection`：纯文本选区。
- `image`：base64 图片（`image/png | image/jpeg | image/webp`）。

注：`MessageTranslator.composeUserContent` 会把 `image` 附件写入 BlobStore，并在持久化 user message 中插入空 body 的 image STUB；原始 base64 不进入会话历史。agent-server 在调用 runtime 前会把 image STUB 展开为 `{ type: "image"; blobId; mimeType }`，由 LLM adapter 按需读取 blob 并发送多模态消息。

## Workspace 选择

`workspace.askUser` 通过 `ServerRequest` / `ClientResponse` 向当前 SessionWindow 发起内联选择，而不是复用平台 RPC。

```json
{
  "type": "workspace_ask",
  "requestId": "...",
  "sessionId": "...",
  "timestamp": "...",
  "payload": {
    "toolCallId": "...",
    "prompt": "请选择 workspace",
    "candidates": [
      { "id": "docs", "name": "文档", "description": "产品文档", "isDefault": false }
    ],
    "timeoutMs": 60000
  }
}
```

桌面端回复：

```json
{
  "type": "workspace_answer",
  "requestId": "...",
  "timestamp": "...",
  "payload": {
    "workspaceId": "docs",
    "cancelled": false
  }
}
```

用户取消、超时、会话关闭或没有活动 SessionWindow 时，tool 返回 `{ "cancelled": true }`。

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

- 协议是合约，desktop（Swift）与 app-server（TS）必须严格对齐字段。迁移期间，新旧协议都要明确各自的消费者，不要出现“新类型已定义但仍被旧实现误消费”的半状态。
- 新增 type 时考虑：是否同时影响 `SessionStore` 持久化、`ConversationMessage` UI、`SessionEvent` 审计三处。
- 协议字段保持平铺，不要嵌套 anyJson 黑洞，让两边 codec 都能强类型化。
- 平台 RPC 不带 `sessionId`；server 只通过 `channel: "platform"` 分派平台帧。

## 相关文档

- TS 处理方：[apps/agent-server/agent-server.md](/Users/mu9/proj/handAgent/apps/agent-server/agent-server.md)
- Swift 处理方：[apps/desktop/Sources/SessionWindow/session-window.md](/Users/mu9/proj/handAgent/apps/desktop/Sources/SessionWindow/session-window.md) / [PlatformBridge](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/PlatformBridge/platform-bridge.md)
- 平台 RPC 接口：[platform/platform.md](/Users/mu9/proj/handAgent/packages/core/src/platform/platform.md)
- UI 模型：[conversation/conversation.md](/Users/mu9/proj/handAgent/packages/core/src/conversation/conversation.md)

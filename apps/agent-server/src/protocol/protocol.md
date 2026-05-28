# protocol

## 目录职责

`protocol/` 是 agent-server 内部的翻译层。它把 core runtime 事件翻译成 desktop 能渲染的 `SessionMessage`，把 runtime 事件翻译成持久化审计 `SessionEvent`，并处理用户附件与持久化 STUB 的双向转换。

## 文件

| 文件 | 职责 |
|------|------|
| `MessageTranslator.ts` | `AgentRuntimeEvent` ↔ `SessionMessage` / `SessionEvent` 翻译；`AgentMessage` ↔ `ConversationMessage` 映射；user attachment 入库；image STUB 进入 runtime 前展开为多模态 image part |

## 运行位置

- 上游：`session/SessionRuntimeOrchestrator.ts` 在 runtime event 回调中调用 `toSessionMessage()` 和 `toAuditEvent()`。
- 下游：desktop `SessionWindow` 消费 `assistant_message_*`、`tool_message`、`error` 等协议帧；`SessionStore` 持久化 `SessionEvent`。
- 旁路：`session/SessionPersistence.ts` 调 `composeUserContent()` 和 `agentMessagesToConversation()`。

## 关键机制

### Runtime event 到 UI message

```ts
case "tool_result":
  return {
    type: "tool_message",
    sessionId,
    messageId: `${sessionId}-${event.toolCallId}`,
    timestamp,
    payload: {
      name: event.toolName,
      text: event.output,
      status: event.status === "success" ? "completed" : "failed",
    },
  };
```

core runtime 只知道 `tool_result` 成功或失败；desktop UI 需要的是 `tool_message(status)`。这个映射集中在这里，新增 tool bubble 展示状态时只改一个地方。

### Runtime event 到审计事件

```ts
case "permission_decision":
  return {
    type: "permission_request",
    timestamp,
    toolName: event.toolName,
    action: event.decision,
    granted: event.decision === "allow",
  };
```

审计事件不是 UI 消息。权限决策不会直接发给桌面消息列表，但会落进 session `events`，供后续排查 tool 调用和权限记忆行为。

### 图片附件先落 Blob，再保存 STUB

```ts
const record = await blobStore.put({
  kind: "image",
  bytes: Buffer.from(attachment.base64, "base64"),
  extension: imageExtension(attachment.mimeType),
});
parts.push(renderStub({
  id: record.id,
  kind: record.kind,
  size: record.size,
  path: record.path,
}));
```

用户主动提交的图片不会直接塞入 session JSON。`composeUserContent()` 先把 bytes 写入 BlobStore，再把可恢复的 STUB 文本写入 user message。进入下一轮 runtime 前，`agentMessagesToRuntimeMessages()` 会解析 STUB 并转成 `{ type: "image", blobId, mimeType }`。

## 数据边界

- `ConversationMessage` 是 UI/快照视角；`AgentMessage` 是 LLM/runtime 视角。
- `SessionEvent` 是审计视角；不要把它当作 UI 消息源。
- STUB 是持久化占位，不是 LLM 最终输入；真正 LLM 请求前才展开成多模态 content part。

## 编辑约束

- 新增 `AgentRuntimeEvent` 类型时，必须同时判断是否需要更新 `toSessionMessage()` 与 `toAuditEvent()`。
- 新增用户附件类型时，必须同时处理 `composeUserContent()`、持久化表达和进入 runtime 前的展开逻辑。
- 不在这里读写真实文件路径；BlobStore 由 `session/SessionPersistence` 或 `server/startDefaultServer` 注入。

## 下一步阅读

- core 协议定义：[packages/core/src/protocol/protocol.md](/Users/mu9/proj/handAgent/packages/core/src/protocol/protocol.md)
- core runtime 事件：[packages/core/src/runtime/runtime.md](/Users/mu9/proj/handAgent/packages/core/src/runtime/runtime.md)

# protocol

## 目录职责

`protocol/` 是 agent-server 内部的翻译层。它不定义跨进程协议 DTO，只把 core runtime 事件翻译成 React ThreadWindow 消费的 `ThreadNotification`、把 runtime 事件翻译成持久化审计 `ThreadAuditEvent`，并处理用户附件与持久化 STUB 的双向转换。

## 文件

| 文件 | 职责 |
|------|------|
| `MessageTranslator.ts` | `AgentRuntimeEvent -> ThreadNotification / 审计 ThreadAuditEvent` 翻译；`AgentMessage` ↔ `ConversationMessage` 映射；user attachment 入库；image STUB 进入 runtime 前展开为多模态 image part |

## 运行位置

- 上游：Agent 内部的 `thread/ThreadRuntimeOrchestrator.ts` 在 runtime event 回调中调用 `toThreadNotification()` 和 `toAuditEvent()`。
- 下游：React ThreadWindow store 消费 `assistant.delta`、`tool.started`、`tool.finished`、`thread.error` 等 `ThreadNotification`；`ThreadStore` 持久化审计 `ThreadAuditEvent`。
- 旁路：`thread/ThreadPersistence.ts` 调 `composeUserContent()` 和 `agentMessagesToConversation()`。
- 不处理：`permission.requested` / `workspace.requested` 由 `bridges/` 构造；`workspace.listed` 由 `thread/ThreadCommandRouter` 构造；`PlatformBridgeMessage` 由 `server/` 与 `bridges/WebSocketPlatformBridge.ts` 处理。

## 关键机制

### Runtime event 到 `ThreadNotification`

```ts
case "assistant_message_delta":
  return {
    type: "assistant.delta",
    threadId,
    notificationId: `${threadId}-${event.messageId}-${timestamp}-${notificationSequence}-delta`,
    turnId,
    itemId: `${threadId}-${turnId}-${event.messageId}`,
    timestamp,
    payload: { text: event.payload.text },
  };

case "tool_result":
  return {
    type: "tool.finished",
    threadId,
    notificationId: `${threadId}-${event.toolCallId}-${timestamp}-${notificationSequence}-finish`,
    turnId,
    itemId: `${threadId}-${event.toolCallId}`,
    timestamp,
    payload: {
      name: event.toolName,
      status: event.status === "success" ? "completed" : "failed",
      output: event.output,
      durationMs: event.durationMs,
    },
  };
```

`AgentRuntime` 的 assistant `messageId` 只保证单次 run 内部递增；同一 thread 后续 turn 可能再次出现 `assistant-1`。因此 `assistant.delta.itemId` 必须拼入 `turnId`，保证 React `ThreadWindow` 的 message identity 在多轮会话中稳定唯一。`notificationId` 还必须包含 active run 内单调递增的 `notificationSequence`，避免多段 `assistant_message_delta` 在同一毫秒内共用同一个 ID，被 React store 的重复通知保护误判为重复消息。

core runtime 只知道 `tool_result` 成功或失败；React UI 需要的是 `tool.finished(status)`。这个映射集中在这里，新增工具事件字段时只改一个地方。

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

审计事件不是 UI 事件。权限决策不会直接变成桌面消息流，但会落进 thread `events`，供后续排查 tool 调用和权限记忆行为。

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

用户主动提交的图片不会直接塞入 thread JSON。`composeUserContent()` 先把 bytes 写入 BlobStore，再把可恢复的 STUB 文本写入 user message。进入下一轮 runtime 前，`agentMessagesToRuntimeMessages()` 会解析 STUB 并转成 `{ type: "image", blobId, mimeType }`。

## 数据边界

- `ConversationMessage` 是快照视角；`AgentMessage` 是 LLM/runtime 视角。
- core 协议里的 `ThreadNotification` 是 thread 通知主干；storage 里的 `ThreadAuditEvent` 是审计事件，两者职责不同。
- STUB 是持久化占位，不是 LLM 最终输入；真正 LLM 请求前才展开成多模态 content part。
- `ThreadNotification`、`ServerRequest`、`ClientResponse`、`PlatformBridgeMessage` 的类型真相在 `packages/core/src/protocol/`；本目录只引用和适配。

## 编辑约束

- 新增 `AgentRuntimeEvent` 类型时，必须同时判断是否需要更新 `toThreadNotification()` 与 `toAuditEvent()`。
- 新增用户附件类型时，必须同时处理 `composeUserContent()`、持久化表达和进入 runtime 前的展开逻辑。
- 不在这里读写真实文件路径；BlobStore 由 `thread/ThreadPersistence` 或 `server/startDefaultServer` 注入。

## 下一步阅读

- core 协议定义：[packages/core/src/protocol/protocol.md](/Users/mu9/proj/handAgent/packages/core/src/protocol/protocol.md)
- core runtime 事件：[packages/core/src/runtime/runtime.md](/Users/mu9/proj/handAgent/packages/core/src/runtime/runtime.md)

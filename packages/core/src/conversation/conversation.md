# conversation

UI / 持久化用的消息模型，**不是** LLM 面向的消息。LLM 视角是 `runtime/AgentMessage`；UI 视角是 `ConversationMessage`。两者的翻译由 agent-server 的 `MessageTranslator.agentMessagesToConversation` 维护，流式事件管道由 `SessionRuntimeOrchestrator` 触发。

## 文件

| 文件 | 职责 |
|------|------|
| `ConversationMessage.ts` | `ConversationMessage`（id / role / text / status / createdAt / updatedAt / toolCall? / error?）+ `ConversationMessageStatus`（`streaming \| running \| completed \| failed`）+ `ToolMessageStatus` |

## 与 AgentMessage 的关系

| 维度 | `AgentMessage`（runtime） | `ConversationMessage`（UI） |
|------|---------------------------|------------------------------|
| 受众 | LLM | SwiftUI |
| 字段 | role / content / toolCalls? / toolCallId / name | id / role / text / status / 时间戳 / toolCall? / error? |
| 状态 | 隐式（一次完整文本） | 显式（`streaming → completed`） |
| 序列 | 严格按 LLM 调用顺序 | UI 列表顺序，可能合并 / 重排 |

## 状态流

```
user → 立即 completed
assistant → streaming（assistant_message_start）
        → streaming（assistant_message_delta，逐段拼接）
        → completed（assistant_message_end）
tool → running（tool_call）→ completed | failed（tool_result.status）
system → 立即 completed
```

## 编辑此目录的约束

- 不要把 LLM 内部字段（如 `toolCalls` 列表）平铺到 `ConversationMessage`；UI 只关心一段文本 + 一个 toolCall 元信息。
- 新增 status 时要同时考虑：runtime 事件 → MessageTranslator 翻译 → SwiftUI 渲染三处。
- `toolCall.name` 是 UI 显示用，不是 ID；如需要联动 audit 审计请通过 `SessionEvent.toolCallId`。
- `ConversationMessage` 是协议字段（被 `session_snapshot` / `load_session_response` 引用），改动时务必同步 [protocol/protocol.md](/Users/mu9/proj/handAgent/packages/core/src/protocol/protocol.md)。

## 相关文档

- 协议引用：[protocol/protocol.md](/Users/mu9/proj/handAgent/packages/core/src/protocol/protocol.md)
- LLM 视角：[runtime/runtime.md](/Users/mu9/proj/handAgent/packages/core/src/runtime/runtime.md)
- 翻译实现：[apps/agent-server/agent-server.md](/Users/mu9/proj/handAgent/apps/agent-server/agent-server.md)
- 渲染端：[apps/desktop/Sources/SessionWindow/session-window.md](/Users/mu9/proj/handAgent/apps/desktop/Sources/SessionWindow/session-window.md)

# runtime

会话循环、消息模型、tool call 编排。是整个 Agent 的"主心脏"。

## 文件

| 文件 | 职责 |
|------|------|
| `AgentMessage.ts` | LLM 面向的消息判别联合：`user / assistant(+toolCalls?) / tool / system` |
| `ToolCallEnvelope.ts` | `{ id, name, arguments }` 三元组，连接 LLM 输出与 ToolRegistry |
| `AgentSession.ts` | 把 `AgentSessionInput`（prompt + 可选选区）归一化为首轮 user message；当前未在 agent-server 主链路使用，仅作为脚本入口 |
| `AgentRuntime.ts` | 主循环：调 `LLMClient.complete` → 写 assistant 消息 → 检查 toolCalls → 走权限策略 → 调 `ToolRegistry` → 把 tool 结果回灌成 tool message，循环 ≤ `maxTurns` |
| `Stub.ts` | 统一渲染 / 解析 `[STUB ...]...[/STUB]` 文本，占位引用 Blob 内容 |
| `TurnSummarizer.ts` | turn 结束后压缩 `cached=turn` 的 tool message，写回 Blob summary 并重渲染消息 |

## 主循环

```mermaid
flowchart TD
  A[runWithMessages(messages, onEvent, {sessionId})] --> A1[await pending turn summaries]
  A1 --> B[turn ← 0]
  B --> C[LLMClient.complete(messages, registry.list())]
  C --> D[push assistant message]
  D --> E{toolCalls.length > 0?}
  E -- 否 --> S[start async TurnSummarizer]
  S --> F[return AgentRunResult]
  E -- 是 --> G[for each toolCall]
  G --> H[PermissionPolicy.check]
  H --> I{decision}
  I -- ask --> J[resolveAsk + remember]
  I -- deny --> K[push tool message (拒绝文案)]
  I -- allow --> L[ToolRegistry.get(name).call(arguments)]
  L --> M[push tool message (序列化结果或错误)]
  K --> N[turn ← turn + 1]
  M --> N
  J --> I
  N --> O{turn < maxTurns}
  O -- 是 --> C
  O -- 否 --> P[throw exceeded maxTurns]
```

## 事件

`AgentRuntimeEvent` 是回调流，供 agent-server 翻译成 `SessionMessage`：

- `assistant_message_start | assistant_message_delta | assistant_message_end`：当前是"伪流式"，一次性把整段文本作为单 delta 发出（详见 [docs/architecture-review.md](/Users/mu9/proj/handAgent/docs/architecture-review.md)）。
- `tool_call`：tool 调用前埋点。
- `tool_result`：成功 / 失败 + 序列化输出（`MAX_OUTPUT_BYTES = 8 KiB` 截断）+ duration。
- `permission_decision`：进入 `ask` 路径后的解析结果。
- `runtime_error`：仅类型预留，目前未在循环内主动 emit；外层捕获 throw 后由 `SessionManager` 翻译。

## 默认策略

- `maxTurns = 8`：防失控循环。
- `permissionPolicy = AllowAllPermissionPolicy()`：仅在测试 / 脚本场景默认放行；生产由 `agent-server` 注入 `FilePermissionPolicy(askResolver)`。
- `serializeToolResult` 把非字符串结果用 `JSON.stringify`，循环引用降级为 `[unserializable tool result]`。
- 带 `stubByDefault` 的 tool 若输入里显式传 `cached=turn|persist`，runtime 会把序列化结果写入注入的 `BlobStore`，并把 tool message content 渲染成 STUB。
- `cached=turn` 的 tool message 在本 turn 内保留完整 body；turn 自然结束后 `TurnSummarizer` 异步压缩，下一次 LLM 调用前 `waitForPendingSummaries()` 会等待并应用 summary。
- `truncateOutput` 按 UTF-8 字节判长度，但截断时按 JS 字符索引切片（已知潜在 bug，见架构改进）。

## 编辑此目录的约束

- 不要在 runtime 里 `import` 任何 `node:fs` / `ai` / `@ai-sdk/*`，保持纯逻辑层。
- BlobStore 与 TurnSummarizer 由组合根注入；runtime 不创建磁盘 store、不选择具体模型。
- 不要把 stream / SSE 的 fan-out 写进 `AgentRuntime`，应改 `LLMClient` 接口。
- tool 调用以 `ToolRegistry.get(name)` 为唯一入口，不允许直接 `import` builtin tool。
- 新增事件类型时，`SessionManager.toSessionMessage` 必须同步更新（目前只翻译 assistant 三事件，其余被丢）。

## 相关文档

- 上游接口：[llm/llm.md](/Users/mu9/proj/handAgent/packages/core/src/llm/llm.md)
- 下游接口：[tools/tools.md](/Users/mu9/proj/handAgent/packages/core/src/tools/tools.md) / [permission/permission.md](/Users/mu9/proj/handAgent/packages/core/src/permission/permission.md)
- 协议翻译：[apps/agent-server/agent-server.md](/Users/mu9/proj/handAgent/apps/agent-server/agent-server.md)

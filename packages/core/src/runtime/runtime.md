# runtime

会话循环、消息模型、tool call 编排。是整个 Agent 的"主心脏"。

## 文件

| 文件 | 职责 |
|------|------|
| `AgentMessage.ts` | LLM 面向的消息判别联合：`user / assistant(+toolCalls?) / tool / system`；user content 支持字符串或 `text/image` 多模态 parts |
| `ToolCallEnvelope.ts` | `{ id, name, arguments }` 三元组，连接 LLM 输出与 ToolRegistry |
| `AgentSession.ts` | 把 `AgentSessionInput`（prompt + 可选选区）归一化为首轮 user message；当前未在 agent-server 主链路使用，仅作为脚本入口 |
| `AgentRuntime.ts` | 主循环：消费 `LLMClient.stream` → 按 delta 发 assistant 事件 → 收集 toolCalls → 逐个交给 `handleToolCall` 处理权限、执行、结果回灌；同一次用户输入内最多循环 `maxTimes` 次；支持 `AbortSignal` 中断 |
| `SystemPrompt.ts` | system prompt 分段组装器：以 `SystemPromptSection[]` 表达默认策略，按 LLM 请求临时解析成 `system` messages，不写回会话历史 |
| `Stub.ts` | 统一渲染 / 解析 `[STUB ...]...[/STUB]` 文本，占位引用 Blob 内容 |
| `TurnSummarizer.ts` | turn 结束后压缩 `cached=turn` 的 tool message，写回 Blob summary 并重渲染消息 |

## 主循环

```mermaid
flowchart TD
  A[runWithMessages(messages, onEvent, {sessionId, signal?})] --> A1[await pending turn summaries]
  A1 --> B0[time ← 0]
  B0 --> B1[SystemPrompt sections + messages -> LLM messages]
  B1 --> C[LLMClient.stream(llmMessages, registry.list(), {blobStore?})]
  C --> C1[emit assistant start / delta / end]
  C1 --> D[push assistant message]
  D --> E{toolCalls.length > 0?}
  E -- 否 --> S[start async TurnSummarizer]
  S --> F[return AgentRunResult.messages]
  E -- 是 --> G[for each toolCall]
  G --> H[PermissionPolicy.check]
  H --> I{decision}
  I -- ask --> J[resolveAsk + remember]
  I -- deny --> K[push tool message (拒绝文案)]
  I -- allow --> L[ToolRegistry.get(name).call(arguments)]
  L --> M[push tool message (序列化结果或错误)]
  K --> G1[all tool calls handled]
  M --> G1
  J --> I
  G1 --> N[time ← time + 1]
  N --> O{time < maxTimes}
  O -- 是 --> C
  O -- 否 --> P[throw exceeded maxTimes]
```

## 事件

`AgentRuntimeEvent` 是回调流，供 agent-server 翻译成 `SessionMessage`：

- `assistant_message_start | assistant_message_delta | assistant_message_end`：由 `LLMStreamEvent.text_delta` 逐段转发；legacy `complete()` client 会经 `streamLLM()` 兼容层退化为单段 delta；中断时 `_end` status 为 `interrupted`。
- `tool_call`：tool 调用前埋点；agent-server 会翻译成 `tool_message(status: "running")`。
- `tool_result`：成功 / 失败 + 序列化输出（`MAX_OUTPUT_BYTES = 8 KiB` 截断）+ duration；agent-server 会翻译成 `tool_message(status: "completed" | "failed")`。
- `permission_decision`：进入 `ask` 路径后的解析结果；用于审计事件，不直接发 UI 消息。
- `runtime_error`：仅类型预留，目前未在循环内主动 emit；外层捕获 throw 后由 `SessionRuntimeOrchestrator` 通过 `MessageTranslator.toErrorMessage` 翻译。

## meta-tool 激活分支

`AgentRuntime.handleToolCall` 在分派 tool call 前先检查 tool name 是否等于 `META_TOOL_NAME`（`"use_tools"`）：

- 命中时跳过 `PermissionPolicy.check`，直接触发激活回调，不走普通 tool 执行路径。
- 两个可选回调由 agent-server 注入：
  - `onMetaToolActivate(sessionId)`：激活时通知 `SessionScopedToolRegistry` 扩展工具集。
  - `isSessionActivated(sessionId)`：每次 LLM 请求前判断当前 session 是否已激活，用于决定传入完整工具集还是仅 meta-tool。
- tool-use-policy system prompt section 仅在 `hasRealTools`（registry 中存在非 meta-tool）为真时出现；未激活 session 不注入该 section，避免引导模型调用尚不存在的工具。



- `maxTimes = 100`：限制一次用户输入内的 LLM/tool 循环次数，防止无限循环；这里的 times 不是产品语义上的 turn，产品语义里的 turn 是“一次用户输入到本次运行自然结束”。
- `permissionPolicy = AllowAllPermissionPolicy()`：仅在测试 / 脚本场景默认放行；生产由 `agent-server` 注入 `FilePermissionPolicy(askResolver)`。
- `systemPromptSections = buildDefaultSystemPromptSections()`：默认包含 tool-use policy section；当 `ToolRegistry` 中存在可用 tool 时，每次 LLM 请求前临时前置 system message，要求模型在需要外部状态或多步流程时返回结构化 tool call，而不是只用 assistant 文本描述计划。该 system message 只进入本次 LLM 输入，不进入 `AgentRunResult.messages`，因此不会被 UI 或会话持久化重复保存。
- `serializeToolResult` 把非字符串结果用 `JSON.stringify`，循环引用降级为 `[unserializable tool result]`。
- 带 `stubByDefault` 的 tool 若输入里显式传 `cached=turn|persist`，runtime 会把序列化结果写入注入的 `BlobStore`，并把 tool message content 渲染成 STUB。
- runtime 不解析持久化 image STUB；agent-server 会在调用 runtime 前把用户主动提交的 image STUB 转成多模态 image part，runtime 只负责把注入的 `BlobStore` 继续透传给 `LLMClient`。
- `cached=turn` 的 tool message 在本 turn 内保留完整 body；turn 自然结束后 `TurnSummarizer` 异步压缩，下一次 LLM 调用前 `waitForPendingSummaries()` 会等待并应用 summary。
- 单个 tool call 的处理拆在 `handleToolCall` / `resolveToolPermission` / `callTool` / `appendDeniedToolResult` 内：主循环只负责 turn 推进与消息顺序，权限记忆、拒绝回灌、执行计时和错误序列化各自独立。
- `truncateOutput` 按 UTF-8 字节判长度，但截断时按 JS 字符索引切片（已知潜在 bug，见架构改进）。
- `runOptions.signal` 被 abort 后，runtime 抛 `AbortError`，停止后续 assistant / tool 事件与消息追加；无法硬取消的 tool 返回后也不会再写入本 run。

## 编辑此目录的约束

- 不要在 runtime 里 `import` 任何 `node:fs` / `ai` / `@ai-sdk/*`，保持纯逻辑层。
- BlobStore 与 TurnSummarizer 由组合根注入；runtime 不创建磁盘 store、不选择具体模型。
- 不要把 provider 私有 stream / SSE 细节写进 `AgentRuntime`，provider 必须先归一化成 `LLMStreamEvent`。
- tool 调用以 `ToolRegistry.get(name)` 为唯一入口，不允许直接 `import` builtin tool。
- 新增 system prompt 规则时优先放入 `SystemPrompt.ts` 的 section builder，不要在 `AgentRuntime.completeAssistantResponse()` 里直接拼接策略字符串。
- 新增事件类型时，`apps/agent-server/src/protocol/MessageTranslator.ts` 的 `toSessionMessage` / `toAuditEvent` 必须同步更新。

## 相关文档

- 上游接口：[llm/llm.md](/Users/mu9/proj/handAgent/packages/core/src/llm/llm.md)
- 下游接口：[tools/tools.md](/Users/mu9/proj/handAgent/packages/core/src/tools/tools.md) / [permission/permission.md](/Users/mu9/proj/handAgent/packages/core/src/permission/permission.md)
- 协议翻译：[apps/agent-server/agent-server.md](/Users/mu9/proj/handAgent/apps/agent-server/agent-server.md)

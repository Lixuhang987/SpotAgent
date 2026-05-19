# llm

LLMClient 抽象 + `LLMClientFactory` provider 分发；生产实现包含 OpenAI 兼容路径（`VercelClient`）与 Anthropic 路径，日常 QA 使用 `MockLLMClient`。

## 文件

| 文件 | 职责 |
|------|------|
| `LLMClient.ts` | `LLMClient.stream(messages, tools, options?): AsyncIterable<LLMStreamEvent>`；`text_delta / tool_call / message_end` 三类事件统一 provider 输出；`complete()` 是可选兼容接口，`completeLLM()` / `collectLLMStream()` 用于聚合流 |
| `OpenAIConfig.ts` | `resolveOpenAIApiKey` / `resolveOpenAIBaseURL`：从环境或入参里取，缺 `apiKey` 时抛带中文文案的明确错误（指向 settings 页） |
| `LLMClientFactory.ts` | 根据 `ModelSettings.provider` 创建 provider client，并显式声明 `streaming / toolCalling / multimodal` capability；对不支持图片的 provider 请求提前抛错，对不支持 tool calling 的路径传空 tools 降级 |
| `VercelAdapters.ts` | 内部 `AgentMessage[]` ↔ Vercel AI SDK `ModelMessage[]` 翻译；把 user image part 的 blobId 读取成 SDK image part；`sanitizeToolName` 把 `file.read` → `file_read`（OpenAI 网关不允许点号） |
| `VercelClient.ts` | 实例化 `@ai-sdk/openai` provider，按 `api ∈ {responses, chat, completion}` 选择 model；可注入 `NetworkLogger` 把请求 / 响应 JSONL 落盘 |
| `MockLLMClient.ts` | 日常 QA 的固定触发词 LLM 实现；`mockLLMScenarios` 是 mock 场景唯一真源，覆盖普通回复、tool call、tool result、错误、慢响应与异常 tool 等路径 |

## 调用关系

```
AgentRuntime
  └─ LLMClient.stream(messages, registry.list(), {blobStore?})
       └─ SettingsBackedLLMClient
            └─ LLMClientFactory(settings)
                 ├─ provider=openai-compatible → VercelClient
                 └─ provider=anthropic → AI SDK Anthropic streaming client
            ├─ toVercelMessages(messages, {blobStore}) ← AgentMessage → ModelMessage
            ├─ toVercelTools(tools)              ← RegisteredTool → ToolSet（点号转下划线）
            ├─ provider.chat/completion/responses(model)
            ├─ streamText({ model, messages, tools })  ← 可注入
            └─ fullStream → LLMStreamEvent
                 ├─ text-delta → text_delta
                 ├─ tool-call → tool_call（toolName 反向映射 _→.）
                 └─ stream end → message_end
```

## 设计要点

- **真实 streaming**：`AgentRuntime` 主路径消费 `stream()`，把每个 `text_delta` 直接转成 `assistant_message_delta`。`tool_call` 事件会进入 runtime 的 tool 调用队列，`message_end` 给出最终 assistant message 与 toolCalls 快照。测试 fake 可只实现 `stream()`；旧的 `complete()` fake 仍由 helper 兼容。
- **settings mtime cache**：生产路径走 `agent-server/SettingsBackedLLMClient`，每次 `stream()` / `complete()` 先检查 `~/.spotAgent/settings.json` 的 `mtimeMs + size` stamp；stamp 未变复用现有 provider client，stamp 变化后重读 settings，并只在有效 LLM 配置变化时经 `LLMClientFactory` 新建 client。用户改 settings 写盘后，下一次 LLM 请求可见。
- **provider capability**：factory 返回 `{client, capabilities}`。当前 `openai-compatible` 的 `responses/chat` 与 `anthropic` 均声明支持 streaming、tool calling、多模态；`openai-compatible + api=completion` 声明不支持 tool calling 与多模态。多模态不支持时会在 provider 调用前抛明确错误；tool calling 不支持时传空 tools，让 runtime 退化为纯文本请求。
- **多模态图片**：`AgentMessage.user.content` 支持字符串或 `text/image` content parts。agent-server 持久化时仍保存 image STUB，调用 runtime 前才转为 `{ type: "image"; blobId; mimeType }`；`VercelAdapters` 需要 `options.blobStore` 才能读取 bytes 并生成 AI SDK image part。
- **tool 命名**：core 内部 tool 名一律点号风格（`file.read`），`VercelAdapters` 在适配层做 `file_read` 转换；冲突时抛 `Tool name collision after sanitization`。
- **legacy `provider.completion()`**：当前默认 `defaultModelSettings.api = "responses"`；`VercelClient` 构造默认 `api = "chat"`。两个默认不一致，但生产路径全程透传 settings，无实际冲突。
- **completion API 限制**：`api = "completion"` 不支持 image content；`VercelClient` 会在调用 provider 前抛出明确错误，要求改用 `chat` 或 `responses`。
- **DI 入口**：`LLMClientFactory` 可注入 OpenAI 兼容 client、Anthropic provider 与 `streamText`；`VercelClientOptions.networkLogger` 注入 `FileNetworkLogger` 可把请求 / 响应 body 落到 `~/.spotAgent/log/<YYYY-MM-DD>/network-NNN.jsonl`；`VercelClientDependencies.{createOpenAI, streamText, generateText}` 仅供测试替换。
- **真实 API 集成测试**：`pnpm run test:llm:integration` 会读取 `~/.spotAgent/settings.json` 调用真实端点，并把 provider 原始 JSON 与归一化 `LLMCompletion` 写入 `.cache/llm-api-integration/latest/`，详见 [docs/llm-api-integration.md](/Users/mu9/proj/handAgent/docs/llm-api-integration.md)。
- **MockLLMClient 场景真源**：日常 QA mock 不读 fixture 文件，固定触发词和返回结构都维护在 `mockLLMScenarios`。新增 QA 功能时，必须先在这里新增触发词和对应测试，再让 live QA 用该触发词覆盖链路。
- **mock 启动入口**：agent-server 读取 `HANDAGENT_LLM_MODE=mock` 后使用 `MockLLMClient` 并关闭 summarizer；桌面 `.app` 可通过 `bash ./scripts/package-app.sh --mock-llm` 写入 bundle marker，让 `AgentServerService` 派生子进程时注入该环境变量。

## 编辑此目录的约束

- 不要在 runtime 里直接 `import "@ai-sdk/openai"`，必须经 `LLMClient` 抽象。
- 新 provider 应实现 `LLMClient` 或复用 AI SDK streaming adapter，并注册到 `LLMClientFactory`；不要直接在 runtime 里 `instanceof VercelClient` 分支。
- tool name sanitization 是单向映射，生产时务必维护 `reverseToolNames` 反查；不要在 LLM 输出后直接用 sanitized 名查 `ToolRegistry`。

## 相关文档

- 主调用方：[runtime/runtime.md](/Users/mu9/proj/handAgent/packages/core/src/runtime/runtime.md)
- 配置入口：[config/config.md](/Users/mu9/proj/handAgent/packages/core/src/config/config.md)
- 落盘 logger：[logging/logging.md](/Users/mu9/proj/handAgent/packages/core/src/logging/logging.md)
- agent-server 合成：[apps/agent-server/agent-server.md](/Users/mu9/proj/handAgent/apps/agent-server/agent-server.md)

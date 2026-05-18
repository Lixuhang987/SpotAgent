# llm

LLMClient 抽象 + 当前唯一实现 `VercelClient`（OpenAI 兼容网关）。

## 文件

| 文件 | 职责 |
|------|------|
| `LLMClient.ts` | `LLMClient.complete(messages, tools): Promise<LLMCompletion>`；`LLMCompletion = { message: assistant, toolCalls? }` |
| `OpenAIConfig.ts` | `resolveOpenAIApiKey` / `resolveOpenAIBaseURL`：从环境或入参里取，缺 `apiKey` 时抛带中文文案的明确错误（指向 settings 页） |
| `VercelAdapters.ts` | 内部 `AgentMessage[]` ↔ Vercel AI SDK `ModelMessage[]` 翻译；`sanitizeToolName` 把 `file.read` → `file_read`（OpenAI 网关不允许点号） |
| `VercelClient.ts` | 实例化 `@ai-sdk/openai` provider，按 `api ∈ {responses, chat, completion}` 选择 model；可注入 `NetworkLogger` 把请求 / 响应 JSONL 落盘 |

## 调用关系

```
AgentRuntime
  └─ LLMClient.complete(messages, registry.list())
       └─ VercelClient
            ├─ toVercelMessages(messages)        ← AgentMessage → ModelMessage
            ├─ toVercelTools(tools)              ← RegisteredTool → ToolSet（点号转下划线）
            ├─ provider.chat/completion/responses(model)
            ├─ generateText({ model, messages, tools })  ← 可注入
            └─ 响应 → LLMCompletion
                 ├─ toolCallId 透传
                 ├─ toolName 反向映射（_→.）
                 └─ assistant text
```

## 设计要点

- **同步重读 settings**：生产路径走 `agent-server/SettingsBackedLLMClient`，每次 `complete` 重新读 `~/.spotAgent/settings.json` 并新建 `VercelClient`。优势是用户改 settings 后立即生效；代价是同步 IO 在 LLM 热路径上（详见架构改进）。
- **伪流式**：`complete` 是非流式，但 `AgentRuntime` 会人工切成 `start/delta/end` 三事件，desktop UI 看不到真实 token streaming（架构改进项）。
- **tool 命名**：core 内部 tool 名一律点号风格（`file.read`），`VercelAdapters` 在适配层做 `file_read` 转换；冲突时抛 `Tool name collision after sanitization`。
- **legacy `provider.completion()`**：当前默认 `defaultModelSettings.api = "responses"`；`VercelClient` 构造默认 `api = "chat"`。两个默认不一致，但生产路径全程透传 settings，无实际冲突。
- **DI 入口**：`VercelClientOptions.networkLogger` 注入 `FileNetworkLogger` 可把请求 / 响应 body 落到 `~/.spotAgent/log/<YYYY-MM-DD>/network-NNN.jsonl`；`VercelClientDependencies.{createOpenAI, generateText}` 仅供测试替换。

## 编辑此目录的约束

- 不要在 runtime 里直接 `import "@ai-sdk/openai"`，必须经 `LLMClient` 抽象。
- 新 provider 应实现 `LLMClient` 并注册到工厂（待实现，见 [TODO](/Users/mu9/proj/handAgent/docs/TODO.md) 的多 provider 条目）；不要直接在 runtime 里 `instanceof VercelClient` 分支。
- tool name sanitization 是单向映射，生产时务必维护 `reverseToolNames` 反查；不要在 LLM 输出后直接用 sanitized 名查 `ToolRegistry`。

## 相关文档

- 主调用方：[runtime/runtime.md](/Users/mu9/proj/handAgent/packages/core/src/runtime/runtime.md)
- 配置入口：[config/config.md](/Users/mu9/proj/handAgent/packages/core/src/config/config.md)
- 落盘 logger：[logging/logging.md](/Users/mu9/proj/handAgent/packages/core/src/logging/logging.md)
- agent-server 合成：[apps/agent-server/agent-server.md](/Users/mu9/proj/handAgent/apps/agent-server/agent-server.md)

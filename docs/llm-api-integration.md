# LLM 真实 API 集成测试

## 目标

该测试用于单独验证 `VercelClient` 能调用当前 `~/.spotAgent/settings.json` 配置的真实 OpenAI 兼容端点，并保存 provider 原始请求 / 响应 JSON 与仓内归一化后的 `LLMCompletion`。这些结果用于后续维护 `MockLLMClient`，不进入日常默认测试。

## 运行方式

默认测试不会触发真实网络请求。需要显式开启：

```bash
pnpm run test:llm:integration
```

等价命令：

```bash
HANDAGENT_LLM_INTEGRATION=1 pnpm exec vitest run packages/core/tests/llm/vercel-client.integration.test.ts
```

前提：

- `~/.spotAgent/settings.json` 已配置 `llm.apiKey`。
- `llm.model`、`llm.baseUrl`、`llm.api` 指向需要验证的真实端点。
- 当前测试最多发起三次请求：第一轮不带 tools 验证普通 assistant 回复，第二轮要求模型返回 `file.write` tool call，第三轮带 tool result 继续生成最终 assistant 文本。

如需临时覆盖设置文件，可使用：

```bash
HANDAGENT_LLM_MODEL=gpt-5-mini \
HANDAGENT_LLM_API=responses \
HANDAGENT_LLM_BASE_URL=https://api.openai.com/v1 \
HANDAGENT_LLM_API_KEY=... \
pnpm run test:llm:integration
```

## 输出位置

默认输出目录：

```bash
.cache/llm-api-integration/latest/
```

可通过环境变量改写：

```bash
HANDAGENT_LLM_ARTIFACT_DIR=/tmp/handagent-llm-api \
HANDAGENT_LLM_INTEGRATION=1 \
pnpm exec vitest run packages/core/tests/llm/vercel-client.integration.test.ts
```

单次 provider 请求默认 45 秒超时，可通过环境变量调整：

```bash
HANDAGENT_LLM_REQUEST_TIMEOUT_MS=90000 pnpm run test:llm:integration
```

输出文件：

- `artifact.json`：总索引，包含测试场景、模型配置摘要、turn 文件路径和已脱敏的 provider 网络日志。
- `network.jsonl`：逐行 JSON，记录 provider 原始 request / response body；不记录 header，`apiKey` / `authorization` / token 字段会脱敏。
- `turn-1-assistant-only.input.json`：普通 assistant 回复请求的仓内 `AgentMessage[]`。
- `turn-1-assistant-only.completion.json`：普通 assistant 回复的归一化 `LLMCompletion`。
- `turn-2-tool-call.input.json`：tool calling 请求的仓内 `AgentMessage[]` 与 `RegisteredTool[]`。
- `turn-2-tool-call.completion.json`：tool calling 归一化后的 `LLMCompletion`，包含 `toolCalls`。
- `turn-3-final-answer.input.json`：带 assistant tool call 与 tool result 的输入。
- `turn-3-final-answer.completion.json`：带 tool result 后归一化的最终 assistant 文本。

如果真实端点超时或报错，测试仍会先写出 `artifact.json` 与已捕获的 `network.jsonl`，并在 `artifact.json.error` 中记录脱敏后的错误摘要；测试本身仍按失败处理。

## MockLLMClient 维护依据

`MockLLMClient` 的唯一真源是 `packages/core/src/llm/MockLLMClient.ts` 里的 `mockLLMScenarios`，不维护额外 fixture 文件。新增或调整 mock 场景时，应优先参考 `turn-*.completion.json` 的归一化结构，而不是直接依赖 provider 原始 response。理由：

- `LLMClient` 的稳定契约是 `LLMCompletion`。
- provider 原始 response 和 AI SDK 内部字段可能随依赖版本变化。
- `network.jsonl` 保留给 adapter 排查和 fixture 更新时参考。

最小 mock 数据形态：

```json
{
  "message": {
    "role": "assistant",
    "content": ""
  },
  "toolCalls": [
    {
      "id": "call_xxx",
      "name": "file.write",
      "arguments": {
        "workspaceId": "qa-workspace",
        "relativePath": "api-integration.txt",
        "content": "hello from real api integration test"
      }
    }
  ]
}
```

真实工具调用样例：

```json
{
  "message": {
    "role": "assistant",
    "content": ""
  },
  "toolCalls": [
    {
      "id": "call_AYlJyRl8GIztaPdV4Wpx4b2I",
      "name": "file.write",
      "arguments": {
        "content": "hello from real api integration test",
        "relativePath": "api-integration.txt",
        "workspaceId": "qa-workspace"
      }
    }
  ]
}
```

这类样例可以直接作为 `MockLLMClient.complete()` 的返回值模板；如果要模拟“先 tool call、后最终回答”的链路，就把第一轮返回上面的结构，第二轮返回 `toolCalls: []` 的 assistant 文本。

日常桌面 QA 不直接使用真实端点，推荐打包 mock 模式：

```bash
bash ./scripts/package-app.sh --mock-llm
open dist/HandAgentDesktop.app
```

## 默认测试覆盖

日常 `bash ./scripts/test.sh` 会运行 `packages/core/tests`，其中真实 API 集成测试默认 skip；与真实 API 产物相关的日常覆盖是 artifact 写入单元测试：

```bash
pnpm exec vitest run packages/core/tests/llm/llm-integration-artifacts.test.ts
```

该测试验证：

- artifact 文件会写出；
- `apiKey`、`authorization`、token 字段会脱敏；
- completion JSON 保持仓内 `LLMCompletion` 结构。

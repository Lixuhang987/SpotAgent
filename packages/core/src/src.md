# src

## 目录职责

`packages/core/src` 存放 core 的实际源码实现，是整个 Agent 数据结构和运行循环的核心。

## 模块划分

### `runtime`

- `AgentSession.ts`
- `AgentRuntime.ts`
- `AgentMessage.ts`
- `ToolCallEnvelope.ts`

职责：

- 将用户输入转换为首轮消息。
- 在 assistant/tool 之间维持多轮消息循环。
- 产出适合 UI 渲染的 assistant bubbles。

### `llm`

- `LLMClient.ts`
- `OpenAIConfig.ts`
- `VercelAdapters.ts`
- `VercelClient.ts`

职责：

- 定义统一的 LLM provider 接口。
- 解析持久化模型配置，并把缺省 `baseUrl` 归一化到默认 OpenAI 入口。
- 把内部消息结构转换为 Vercel AI SDK 所需格式。

### `config`

- `AppConfig.ts`
- `ModelSettings.ts`

职责：

- 定义运行时配置 DTO。
- 解析 `~/.spotAgent/settings.json` 中的模型设置。

### `tools`

- `AgentTool.ts`
- `ToolRegistry.ts`
- `builtins/*`

职责：

- 定义 tool 输入 schema、说明和执行入口。
- 将平台能力和文件能力封装为可被 LLM 调用的最小单元。

### `platform`

- `PlatformAdapter.ts`

职责：

- 定义跨平台上下文读取与操作能力的统一 DTO 和接口。

### `selection`

- `SelectionCapture.ts`

职责：

- 定义用户选区的抽象结果类型。
- 约束会话初始上下文只接收用户主动选区。

## 关键数据流

### 1. 会话阶段

- `AgentSession.open(input)` 接收 `AgentSessionInput`
- 内部通过 `selectionTextFromResult()` 提取 `selectedText`
- `buildInitialUserMessage()` 输出给 runtime 的首轮字符串

### 2. runtime 阶段

- `AgentRuntime.run(userInput)`
- 初始构造 `messages: AgentMessage[]`
- 调用 `LLMClient.complete(messages, tools)`
- 若有 `toolCalls`，则循环执行 tool 并附加 `tool` message

### 3. llm 适配阶段

- `loadModelSettings()` 读取 `~/.spotAgent/settings.json`
- `toVercelMessages(messages)` 将内部消息转为 SDK 消息
- `toVercelTools(tools)` 将注册 tool 转为 provider tool set
- `VercelClient` 根据 `api=responses/chat/completion` 选择对应 provider model
- `generateText()` 返回文本与 toolCalls

### 4. tool 阶段

当前已定义的内建 tool 族：

- `file.read`
- `file.write`
- `clipboard.read`
- `app.frontmost`
- `window.list`
- `screen.capture`
- `ocr.read`
- `accessibility.snapshot`
- `accessibility.action`

## 当前实现特点

- `AgentRuntime` 默认 `maxTurns = 8`，防止无限循环。
- tool 结果会被序列化为字符串后重新注入 `AgentMessage(role=tool)`。
- `VercelClient` 当前默认模型是 `gpt-5-mini`。
- tool schema 已经齐全，但真实注册链路还没有在 Web 提交时组装完成。

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
- `ToolSettings.ts`

职责：

- 定义运行时配置 DTO。
- 解析 `~/.spotAgent/settings.json` 中的模型设置。
- `ToolSettings` 解析 `tools.allowlist` / `tools.denylist`，并提供 `filterToolNames` 辅助函数（denylist 优先于 allowlist）。

### `tools`

- `AgentTool.ts`
- `ToolRegistry.ts`
- `builtins/*`

职责：

- 定义 tool 输入 schema、说明和执行入口。
- 将平台能力和文件能力封装为可被 LLM 调用的最小单元。
- `file.read` / `file.write` 入参为 `{workspaceId, relativePath}`，强制走 `WorkspaceRegistry` 解析根目录后再做 `..`/绝对路径/symlink 沙箱校验，禁止 LLM 直接传绝对路径。

### `platform`

- `PlatformAdapter.ts`

职责：

- 定义跨平台上下文读取与操作能力的统一 DTO 和接口。

### `selection`

- `SelectionCapture.ts`

职责：

- 定义用户选区的抽象结果类型。
- 约束会话初始上下文只接收用户主动选区。

### `logging`

- `NetworkLogger.ts`
- `FileNetworkLogger.ts`
- `createLoggingFetch.ts`
- `index.ts`

职责：

- 定义 `NetworkLogger` 接口与 `NetworkLogEntry` DTO（`request`/`response` 两个方向）。
- `FileNetworkLogger`：把每条记录以 JSONL 形式追加到 `~/.spotAgent/log/<YYYY-MM-DD>/network-NNN.jsonl`，单文件超过 `maxFileBytes`（默认 1 MiB）时自动切到下一个序号；写入串行化以避免并发写错位。
- `createLoggingFetch`：包装 `fetch`，把请求/响应 body 解析为 JSON 后交给 `NetworkLogger`，作为 Vercel AI SDK 的 `fetch` 注入项使用。
- `VercelClient` 在收到 `networkLogger` 时会启用上述 fetch 包装，从而把所有发往 / 来自 LLM 的网络 JSON 都落盘。

### `storage`

- `SessionRecord.ts`
- `SessionStore.ts`
- `InMemorySessionStore.ts`
- `FileSessionStore.ts`
- `index.ts`

职责：

- 定义持久化会话模型（`PersistedSession`），包含元数据、消息历史和事件审计。
- 定义 `SessionStore` 接口，支持 CRUD、消息追加/替换、事件追加。
- `InMemorySessionStore`：内存实现，用于测试。
- `FileSessionStore`：JSON 文件持久化，默认存储到 `~/.spotAgent/sessions/`。
- `SessionEvent` 类型预留了 tool 调用记录、权限审计和错误追踪。

### `workspace`

- `Workspace.ts`
- `FileWorkspaceRegistry.ts`
- `index.ts`

职责：

- 定义 `Workspace` DTO（id / name / description / rootPath / createdAt / isDefault）与 `WorkspaceRegistry` 接口。
- `FileWorkspaceRegistry` 把注册表持久化到 `~/.spotAgent/workspaces.json`，首次启动自动播种 `default` workspace（rootPath 默认为 `~/.spotAgent/workspace/`）。
- `summarize()` 返回不含 `rootPath` 的精简列表，专供 LLM 通过 `workspace.list` 消费。
- 注册时强制 `rootPath` 为绝对路径，并 `mkdir -p`；删除仅从注册表移除，不删除磁盘内容。

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

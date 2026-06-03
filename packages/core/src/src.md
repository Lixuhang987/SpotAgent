# src

## 目录职责

`packages/core/src` 存放 core 的实际源码实现，是整个 Agent 数据结构和运行循环的核心。本文件是 core 子目录的索引，每个子模块都有独立的 `<module>.md` 描述其内部细节（"渐进式披露"）。

## 子模块索引

| 子模块 | 子文档 | 一句话职责 |
|------|------|------|
| `runtime/` | [runtime/runtime.md](/Users/mu9/proj/handAgent/packages/core/src/runtime/runtime.md) | LLM/tool 主循环、消息模型、ToolCallEnvelope |
| `actions/` | [actions/actions.md](/Users/mu9/proj/handAgent/packages/core/src/actions/actions.md) | Action manifest 与 session binding 解析 |
| `blob/` | [blob/blob.md](/Users/mu9/proj/handAgent/packages/core/src/blob/blob.md) | 大段上下文内容的本地 Blob 持久化与 summary 元数据 |
| `llm/` | [llm/llm.md](/Users/mu9/proj/handAgent/packages/core/src/llm/llm.md) | LLMClient 抽象 + Vercel AI SDK 适配 |
| `mcp/` | [mcp/mcp.md](/Users/mu9/proj/handAgent/packages/core/src/mcp/mcp.md) | 标准 MCP client 与 MCP tool adapter |
| `tools/` | [tools/tools.md](/Users/mu9/proj/handAgent/packages/core/src/tools/tools.md) | AgentTool 协议 + 11 个 builtin tool + 注册组合根 |
| `platform/` | [platform/platform.md](/Users/mu9/proj/handAgent/packages/core/src/platform/platform.md) | PlatformAdapter / PlatformBridge / Remote+Offline 实现 |
| `permission/` | [permission/permission.md](/Users/mu9/proj/handAgent/packages/core/src/permission/permission.md) | 权限策略接口 + 三档记忆持久化 |
| `storage/` | [storage/storage.md](/Users/mu9/proj/handAgent/packages/core/src/storage/storage.md) | PersistedSession 模型 + 内存 / 文件实现 |
| `workspace/` | [workspace/workspace.md](/Users/mu9/proj/handAgent/packages/core/src/workspace/workspace.md) | 显式 workspace 沙箱 + 默认播种 |
| `config/` | [config/config.md](/Users/mu9/proj/handAgent/packages/core/src/config/config.md) | settings.json 模型与 tool 设置解析 |
| `logging/` | [logging/logging.md](/Users/mu9/proj/handAgent/packages/core/src/logging/logging.md) | LLM 网络日志 JSONL 落盘 |
| `protocol/` | [protocol/protocol.md](/Users/mu9/proj/handAgent/packages/core/src/protocol/protocol.md) | desktop ↔ agent-server WS 协议（SessionMessage + PlatformBridgeMessage） |
| `conversation/` | [conversation/conversation.md](/Users/mu9/proj/handAgent/packages/core/src/conversation/conversation.md) | UI / 持久化用 ConversationMessage 模型 |
| `selection/` | [selection/selection.md](/Users/mu9/proj/handAgent/packages/core/src/selection/selection.md) | 用户主动选区抽象 |

## 关键数据流

### 1. 会话阶段

- `AgentSession.open(input)` 接收 `AgentSessionInput`
- 内部通过 `selectionTextFromResult()` 提取 `selectedText`
- `buildInitialUserMessage()` 输出给 runtime 的首轮字符串

### 2. runtime 阶段

- `AgentRuntime.runWithMessages(messages, onEvent, {sessionId})`
- 每轮先通过 `SystemPrompt` 把默认 system prompt sections 临时前置到 LLM 输入，再消费 `LLMClient.stream(llmMessages, registry.list(), {blobStore?})`
- 处理 `toolCalls`：`PermissionPolicy.check` → ask / allow / deny → tool 调用 → 写 tool message
- 详细流程图见 [runtime/runtime.md](/Users/mu9/proj/handAgent/packages/core/src/runtime/runtime.md)

### 3. llm 适配阶段

- `SettingsBackedLLMClient` 按 `~/.spotAgent/settings.json` 的 `mtimeMs + size` stamp 缓存 `loadModelSettings()` 结果与 `VercelClient`
- `toVercelMessages` / `toVercelTools` 翻译为 SDK 格式（点号 → 下划线）；user image part 会通过 `BlobStore` 读取 bytes 后映射成 AI SDK image part
- `VercelClient` 按 `api ∈ {responses, chat, completion}` 选 provider model
- `VercelClient` 通过 AI SDK `streamText().fullStream` 输出 `LLMStreamEvent`
- 可注入 `FileNetworkLogger` 把请求 / 响应落 JSONL

### 4. tool 阶段

当前生产路径会注册的 builtin tool 共 11 个，按依赖分类：

- 平台类（依赖 `PlatformAdapter`）：`clipboard.read`、`app.frontmost`、`window.list`、`screen.capture`、`ocr.read`、`accessibility.snapshot`、`accessibility.action`。
- 工作区类（依赖 `WorkspaceRegistry`）：`workspace.list`、`workspace.askUser`、`file.read`、`file.write`。

plugin action 绑定的外部能力不由 core tools 目录加载私有插件进程；agent-server 会按 session metadata 组合 builtin tools 与 MCP tools。skill action 不创建 session binding，只作为普通 prompt 进入 runtime。

完整入参 / 实现位置见 [tools/tools.md](/Users/mu9/proj/handAgent/packages/core/src/tools/tools.md)。

### 5. 权限阶段

- `AgentRuntime` 在 `tool.call` 前调 `PermissionPolicy.check`，进入 `ask` 时通过 `resolveAsk` 询问。
- 生产路径由 agent-server 注入 `FilePermissionPolicy(askResolver = SessionPermissionBridge.ask)`，UI 在 SessionWindow 内联气泡。
- 三档记忆：once / session / always；always 持久化到 `~/.spotAgent/permissions.json`。

### 6. 持久化阶段

- `SessionStore`（生产 `FileSessionStore`）按 `~/.spotAgent/sessions/<id>.json` 写每会话一份 `PersistedSession`：metadata / messages / events。
- `events` 是审计视图（tool_call / tool_result / permission_request / error），与 `messages` 解耦。

### 7. 跨进程协议

- desktop 与 agent-server 走 `ws://127.0.0.1:4317/api/session`；会话帧是 `SessionMessage`，平台反向 IPC 帧是 `PlatformBridgeMessage`。
- 反向平台 IPC 复用同一 WebSocket 入口，但通过 `channel: "platform"` 显式分流。
- 字段说明详见 [protocol/protocol.md](/Users/mu9/proj/handAgent/packages/core/src/protocol/protocol.md)。

## 当前实现特点与已知改进项

- `AgentRuntime` 默认 `maxTimes = 100`，限制一次用户输入内的 LLM/tool 循环次数，防止无限循环。
- tool 结果统一序列化为字符串再回灌；`MAX_OUTPUT_BYTES = 8 KiB` 截断。
- `VercelClient` 当前默认模型 `gpt-5-mini`。
- user message 支持字符串或多模态 content parts；持久化层仍保存 STUB 文本，agent-server 在 runtime 前展开 image STUB。
- `assistant_message_delta` 来自 `LLMStreamEvent.text_delta`，desktop UI 可逐段拼接 assistant 回复。
- 文件 tool 已使用 workspace 沙箱、basename symlink 拒绝、10 MiB 写入上限与原子写。
- `FilePermissionPolicy.cache` 与 `FileWorkspaceRegistry.cache` 不启 watcher；每次公开读写入口前比较持久化文件 `mtimeMs + size`，检测到外部修改后重读，保证 Settings 或外部撤销权限后下一次 tool 调用可见。

## 编辑此目录的约束

- core 不允许 `import` 任何 macOS / DOM 模块；只能依赖 Node 标准库 + `ai` + `@ai-sdk/openai`。
- 跨子模块依赖必须按图层流动：runtime → {llm, tools, permission}；tools → {platform, workspace}；llm → {config, logging, runtime/AgentMessage}；不要在 platform / config / logging 中反向引用 runtime。
- 每个子目录新增文件时，同步更新对应的 `<module>.md` 文件清单与索引表。

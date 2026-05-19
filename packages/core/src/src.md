# src

## 目录职责

`packages/core/src` 存放 core 的实际源码实现，是整个 Agent 数据结构和运行循环的核心。本文件是 core 子目录的索引，每个子模块都有独立的 `<module>.md` 描述其内部细节（"渐进式披露"）。

## 子模块索引

| 子模块 | 子文档 | 一句话职责 |
|------|------|------|
| `runtime/` | [runtime/runtime.md](/Users/mu9/proj/handAgent/packages/core/src/runtime/runtime.md) | LLM/tool 主循环、消息模型、ToolCallEnvelope |
| `blob/` | [blob/blob.md](/Users/mu9/proj/handAgent/packages/core/src/blob/blob.md) | 大段上下文内容的本地 Blob 持久化与 summary 元数据 |
| `llm/` | [llm/llm.md](/Users/mu9/proj/handAgent/packages/core/src/llm/llm.md) | LLMClient 抽象 + Vercel AI SDK 适配 |
| `tools/` | [tools/tools.md](/Users/mu9/proj/handAgent/packages/core/src/tools/tools.md) | AgentTool 协议 + 10 个 builtin tool + 注册组合根 |
| `platform/` | [platform/platform.md](/Users/mu9/proj/handAgent/packages/core/src/platform/platform.md) | PlatformAdapter / PlatformBridge / Remote+Offline 实现 |
| `permission/` | [permission/permission.md](/Users/mu9/proj/handAgent/packages/core/src/permission/permission.md) | 权限策略接口 + 三档记忆持久化 |
| `storage/` | [storage/storage.md](/Users/mu9/proj/handAgent/packages/core/src/storage/storage.md) | PersistedSession 模型 + 内存 / 文件实现 |
| `workspace/` | [workspace/workspace.md](/Users/mu9/proj/handAgent/packages/core/src/workspace/workspace.md) | 显式 workspace 沙箱 + 默认播种 |
| `config/` | [config/config.md](/Users/mu9/proj/handAgent/packages/core/src/config/config.md) | settings.json 模型与 tool 设置解析 |
| `logging/` | [logging/logging.md](/Users/mu9/proj/handAgent/packages/core/src/logging/logging.md) | LLM 网络日志 JSONL 落盘 |
| `protocol/` | [protocol/protocol.md](/Users/mu9/proj/handAgent/packages/core/src/protocol/protocol.md) | desktop ↔ agent-server WS 协议（20 个 SessionMessage 变体） |
| `conversation/` | [conversation/conversation.md](/Users/mu9/proj/handAgent/packages/core/src/conversation/conversation.md) | UI / 持久化用 ConversationMessage 模型 |
| `selection/` | [selection/selection.md](/Users/mu9/proj/handAgent/packages/core/src/selection/selection.md) | 用户主动选区抽象 |

## 关键数据流

### 1. 会话阶段

- `AgentSession.open(input)` 接收 `AgentSessionInput`
- 内部通过 `selectionTextFromResult()` 提取 `selectedText`
- `buildInitialUserMessage()` 输出给 runtime 的首轮字符串

### 2. runtime 阶段

- `AgentRuntime.runWithMessages(messages, onEvent, {sessionId})`
- 每轮调 `LLMClient.complete(messages, registry.list())`
- 处理 `toolCalls`：`PermissionPolicy.check` → ask / allow / deny → tool 调用 → 写 tool message
- 详细流程图见 [runtime/runtime.md](/Users/mu9/proj/handAgent/packages/core/src/runtime/runtime.md)

### 3. llm 适配阶段

- `SettingsBackedLLMClient` 按 `~/.spotAgent/settings.json` 的 `mtimeMs + size` stamp 缓存 `loadModelSettings()` 结果与 `VercelClient`
- `toVercelMessages` / `toVercelTools` 翻译为 SDK 格式（点号 → 下划线）
- `VercelClient` 按 `api ∈ {responses, chat, completion}` 选 provider model
- 可注入 `FileNetworkLogger` 把请求 / 响应落 JSONL

### 4. tool 阶段

当前生产路径会注册的 builtin tool 共 10 个，按依赖分类：

- 平台类（依赖 `PlatformAdapter`）：`clipboard.read`、`app.frontmost`、`window.list`、`screen.capture`、`ocr.read`、`accessibility.snapshot`、`accessibility.action`。
- 工作区类（依赖 `WorkspaceRegistry`）：`workspace.list`、`file.read`、`file.write`。

完整入参 / 实现位置见 [tools/tools.md](/Users/mu9/proj/handAgent/packages/core/src/tools/tools.md)。

### 5. 权限阶段

- `AgentRuntime` 在 `tool.call` 前调 `PermissionPolicy.check`，进入 `ask` 时通过 `resolveAsk` 询问。
- 生产路径由 agent-server 注入 `FilePermissionPolicy(askResolver = SessionPermissionBridge.ask)`，UI 在 SessionWindow 内联气泡。
- 三档记忆：once / session / always；always 持久化到 `~/.spotAgent/permissions.json`。

### 6. 持久化阶段

- `SessionStore`（生产 `FileSessionStore`）按 `~/.spotAgent/sessions/<id>.json` 写每会话一份 `PersistedSession`：metadata / messages / events。
- `events` 是审计视图（tool_call / tool_result / permission_request / error），与 `messages` 解耦。

### 7. 跨进程协议

- desktop 与 agent-server 走 `ws://127.0.0.1:4317/api/session`，所有帧都是 `SessionMessage`。
- 反向平台 IPC 复用同一 socket，标记 `sessionId = "_platform"`。
- 字段说明详见 [protocol/protocol.md](/Users/mu9/proj/handAgent/packages/core/src/protocol/protocol.md)。

## 当前实现特点与已知改进项

- `AgentRuntime` 默认 `maxTurns = 8`，防止无限循环。
- tool 结果统一序列化为字符串再回灌；`MAX_OUTPUT_BYTES = 8 KiB` 截断。
- `VercelClient` 当前默认模型 `gpt-5-mini`。
- "伪流式"：`assistant_message_delta` 一次性发出整段文本，desktop UI 实际看不到 token 流。
- 文件 tool 已使用 workspace 沙箱、basename symlink 拒绝、10 MiB 写入上限与原子写。
- `FilePermissionPolicy.cache` 与 `FileWorkspaceRegistry.cache` 不启 watcher；每次公开读写入口前比较持久化文件 `mtimeMs + size`，检测到外部修改后重读，保证 Settings 或外部撤销权限后下一次 tool 调用可见。

完整问题清单与改进路线见 [docs/architecture-review.md](/Users/mu9/proj/handAgent/docs/architecture-review.md)。

## 编辑此目录的约束

- core 不允许 `import` 任何 macOS / DOM 模块；只能依赖 Node 标准库 + `ai` + `@ai-sdk/openai`。
- 跨子模块依赖必须按图层流动：runtime → {llm, tools, permission}；tools → {platform, workspace}；llm → {config, logging, runtime/AgentMessage}；不要在 platform / config / logging 中反向引用 runtime。
- 每个子目录新增文件时，同步更新对应的 `<module>.md` 文件清单与索引表。

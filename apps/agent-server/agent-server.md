# agent-server

`apps/agent-server` 是本地 WebSocket 会话桥（Node + TypeScript），由 desktop 派生为子进程（详见 [AgentServerService](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/AgentServer/agent-server.md)），监听 `ws://127.0.0.1:4317/api/session`，把 `SessionMessage` 协议帧路由到 core 的 `AgentRuntime`。

## 在分层中的位置

- 上游：`apps/desktop`（用户交互、平台能力）。
- 下游：`@handagent/core` workspace 包（runtime、tools、LLM、storage、permission、workspace、logging）。
- 自身职责：组装依赖、维护 socket 生命周期、在 desktop 与 core 之间做协议翻译。

## 文件

| 文件 | 职责 |
|------|------|
| `src/server.ts` | 启动入口；`startServer` 注入式构造，`attachSessionSocketHandlers` 维护单 socket 的 bridge token 与会话绑定状态，`startDefaultServer` 是组合根（拉起 store / blobStore / bridge / registry / policy / runtime / SessionPersistence / SessionRuntimeOrchestrator / SessionRouter），`resolveServerPaths()` 集中管理 `~/.spotAgent/` 下所有文件路径 |
| `src/SessionRouter.ts` | 协议路由层：处理 `open_session` / `list_sessions_request` / `load_session_request` / `delete_session_request`；`open_session` 回 `session_snapshot` 用于桌面端重连续联，并把 `user_message` 委托给 runtime 编排层 |
| `src/SessionRuntimeOrchestrator.ts` | 一轮用户消息编排：确保 session、持久化 user message、按 session 解析独立 `AgentRuntime`、等待 pending summary、把 image STUB 展开为 runtime 多模态 content、翻译 runtime event、落库最终 messages / audit events |
| `src/SessionPersistence.ts` | 会话持久化封装：唯一直接持有 `SessionStore` 的 agent-server 模块，负责 CRUD、标题生成、历史读取、messages / events 写入，并把 image attachment 交给 BlobStore |
| `src/MessageTranslator.ts` | 纯函数：`AgentRuntimeEvent` ↔ `SessionMessage` / `SessionEvent` 翻译（`toSessionMessage` / `toAuditEvent` / `agentMessagesToConversation` / `agentMessagesToRuntimeMessages` / `composeUserContent` / `deriveTitle` / `toErrorMessage`）。`composeUserContent` 会把 image attachment 写入 BlobStore 并渲染 image STUB；`agentMessagesToRuntimeMessages` 在进入 runtime 前把 image STUB 转为多模态 image part；新增 tool_message 形态只改这里 |
| `src/SettingsBackedLLMClient.ts` | 每次 `complete` / `stream` 先检查 `~/.spotAgent/settings.json` 的 `mtimeMs + size` stamp；stamp 未变复用已缓存的 provider client，stamp 变化后重读 settings，并只在 `provider / model / apiKey / baseUrl / api` 等有效 LLM 配置变化时经 core `LLMClientFactory` 重建 client；会把 options（例如 `blobStore`）透传给内部 client；可用 `purpose=summarizer` 读取 `summarizerModel`；注入 `FileNetworkLogger` 把 LLM 网络调用 JSONL 落盘 |
| `src/SettingsBackedToolRegistry.ts` | 按 `~/.spotAgent/settings.json` 的 stamp 热加载 builtin tools，并原地刷新同一个 `ToolRegistry` 实例；`SessionRuntimeOrchestrator` 每次新一轮 user message 进入 runtime 前调用 `refresh()` |
| `src/ActionBindingResolver.ts` | 校验 `create_session_request.actionBinding`，并从本地 Plugin manifest 解析 session 绑定的 `mcpServerIds` |
| `src/MCPServerRegistry.ts` | MCP client 缓存与协议适配；同一个 `serverId` 复用 client 与 adapted tools；除 `tools/*` 外还代理 `prompts/list` / `prompts/get` / `resources/list` / `resources/read` 给上层使用 |
| `src/ComputerUseMCPClient.ts` | HandAgent 原生 Computer Use MCP 兼容层；当 MCP server id 为 `computer_use` / `computer-use` 时，暴露 `list_apps` 与 `get_app_state`，底层走 `RemotePlatformAdapter`，不再直接依赖 Codex 私有 Computer Use 子进程的 `tools/call`；`get_app_state` 解析 App 时先走精确 bundle/name，再处理系统别名（如 `Finder` → `com.apple.finder`），最后才做模糊子串匹配 |
| `src/SessionScopedToolRegistry.ts` | 按 session metadata 组合 builtin tools 与 MCP tools，并为每个 session 维护独立 `ToolRegistry`；未激活 session 只暴露 meta-tool（`use_tools`），激活后扩展为完整 builtin + MCP 工具集；`mcp.json` 中的 server 默认全局注入所有 session（`globalMcpServerIds`），plugin `actionBinding.mcpServerIds` 在此基础上叠加去重；plugin-binding 的 session 在 `refreshForSession` 中自动激活，跳过懒加载阶段；MCP server 缺失或初始化失败时记录 skip 日志并保留 builtin tools；agent-server 重启后通过历史 tool message 推断激活状态，已有真实 tool call 记录的 session 直接视为已激活；删除 session 时调用 `forgetSession` 清理激活集合与 session 专属工具表 |
| `src/WebSocketPlatformBridge.ts` | 实现 core 的 `PlatformBridge` 接口；通过 `attach(send)` 接管来自 desktop 的 `channel: "platform"` 反向 socket 并返回 fencing token，按 `requestId + token` 关联 `platform_request` / `platform_response`，60s 超时 |
| `src/SessionPermissionBridge.ts` | 实现 `FilePermissionPolicy` 的 `AskResolver`：把 `permission_request` 推到 desktop，按 `requestId + session binding token` 等回 `permission_response`，60s 超时视为 deny |
| `src/SessionWorkspaceAskBridge.ts` | 实现 `workspace.askUser` 的 `WorkspaceAskResolver`：把 `workspace_ask_request` 推到 desktop，按 `requestId + session binding token` 等回 `workspace_ask_response`，同一 session 内多个 ask 串行展示，取消 / 超时 / 关闭返回 `{ cancelled: true }` |

## 启动序列

```mermaid
sequenceDiagram
  participant Desktop as desktop / AgentServerService
  participant Server as agent-server / startDefaultServer
  participant Core as packages/core

  Desktop->>Server: spawn node --experimental-transform-types server.ts
  Server->>Core: 动态 import runtime / tools / platform / workspace / permission / config / logging
  Server->>Server: 构造 FileSessionStore / FilesystemBlobStore / FileNetworkLogger / FileWorkspaceRegistry
  Server->>Server: 读取 ~/.spotAgent/mcp.json，构造 MCPServerRegistry
  Server->>Server: 构造 WebSocketPlatformBridge + RemotePlatformAdapter + SessionWorkspaceAskBridge
  Server->>Server: SettingsBackedToolRegistry.refresh() → registerTools(...) → registry / disabled list
  Server->>Server: SessionScopedToolRegistry 组合 builtin registry + session-bound MCP tools
  Server->>Server: SessionPermissionBridge + FilePermissionPolicy(askResolver)
  Server->>Server: resolveLLMMode() → SettingsBackedLLMClient 或 MockLLMClient
  Server->>Server: runtimeBySession 按 session 创建 AgentRuntime(LLMClient, registryForSession(sessionId), {policy, blobStore, turnSummarizer})
  Server->>Server: SessionPersistence(store, blobStore)
  Server->>Server: SessionRuntimeOrchestrator(runtime, persistence, beforeRun refresh scoped tools)
  Server->>Server: SessionRouter(orchestrator, persistence, ActionBindingResolver)
  Server->>Server: WebSocketServer.listen(4317)
```

## MCP 与 Action Plugin 流程

MCP server 与 Action Plugin 是两条相互独立的注入通道，作用时机也不同：

1. **全局 MCP**：`~/.spotAgent/mcp.json` 中配置的所有 server 默认对所有 session 可用。`startDefaultServer` 启动时把这些 server id 作为 `globalMcpServerIds` 传给 `SessionScopedToolRegistry`，每轮 user message 前都会自动 `tools/list` 并注入为 `mcp.<serverId>.<toolName>`。client 复用，按 server id 缓存。除了 tools，`MCPServerRegistry` 还代理 `prompts/list` / `prompts/get` / `resources/list` / `resources/read`，供未来的 prompt picker 或 resource UI 调用。`computer_use` / `computer-use` 是兼容例外：仍按 `mcp.<serverId>.*` 注入，但 client 由 `ComputerUseMCPClient` 接管，避免 Codex 私有 Computer Use MCP 在非 Codex app-server 父链路下 `tools/call` 挂起。
2. **Plugin 触发的 MCP**：`create_session_request.payload.actionBinding` 只包含 `{ pluginId, promptName }`。agent-server 不信任 desktop 传来的 MCP server 列表，而是通过 `ActionBindingResolver` 重新读取 `~/.spotAgent/plugins/<plugin-id>/plugin.json`，校验 plugin id、prompt name 和 enabled 状态，再把 manifest 中的 `mcpServerIds` 写入 session metadata，作为该 session 在全局集合之外的额外注入。

`SessionScopedToolRegistry.refreshForSession` 只刷新当前 session 的专属工具表，把全局集合与 plugin binding 集合做并集去重，按 tool name 第一次出现的实例为准。缺失的 MCP server 会被记录为 `[agent-server] skipped MCP server ...`，不会阻断 prompt runtime。`startDefaultServer` 同时按 session 缓存 `AgentRuntime`，让并发 session 的 tool registry、激活状态与 pending turn summary 不互相覆盖；删除 session 时会同步清理 runtime cache 与工具表。

## 一条 socket 上的消息分派

`startServer` 为每个连接调用 `attachSessionSocketHandlers`，后者在单 socket 内维护 `bridgeToken`、权限审批 `boundSessions: Map<sessionId, bindingToken>` 与 workspace 选择 `workspaceAskBoundSessions: Map<sessionId, bindingToken>` 三类生命周期状态。消息分派顺序如下：

1. `channel: "platform"` + `platform_bridge_hello` → `bridge.attach(sendPlatform)` 把这条 socket 当反向 IPC 通道，并把返回的 fencing token 存在该 socket 上；新 bridge 会让旧 bridge token 下的 pending platform request 以 offline 失败。
2. `channel: "platform"` + `platform_response` → `bridge.handleResponse(payload, bridgeToken)` 唤醒同 token 下等待中的 `platform_request`；旧 socket 晚到的 response 会被忽略。
3. `permission_response` → 从 `requestId` 还原 sessionId，取该 socket 持有的 binding token，并调用 `permissionBridge.handleResponse(payload, token)`；旧 socket 晚到的审批响应会被忽略。
4. `workspace_ask_response` → 从 `requestId` 还原 sessionId，取该 socket 持有的 workspace ask binding token，并调用 `workspaceAskBridge.handleResponse(payload, token)`；旧 socket 晚到的选择响应会被忽略。
5. `user_message` → 若该 socket 尚未绑定此 session，则分别调用 `permissionBridge.bindSession(...)` 与 `workspaceAskBridge.bindSession(...)`，把这条 socket 注册为该会话的审批 / workspace 选择回流通道；同 socket 同 session 的后续消息复用原 token，避免挂起请求被本 socket 自己重绑成 stale。

随后所有未命中上述分支的消息都交给 `router.receive(message, send)`，由 `SessionRouter` 决定如何处理。删除 running session 时，`SessionRouter` 会先调用 `SessionRuntimeOrchestrator.interruptAndWait`；若 runtime / LLM / tool 不响应 abort，orchestrator 会在 3 秒后按 active run generation 强制清理运行态并记录 `run_interrupted`，保证 `delete_session_response` 有有限返回边界，且旧 run 的晚到输出不会污染已删除或新一代 session。

socket 关闭时，若该 socket 持有 bridge token，会调用 `bridge.detach(token)`；旧 socket close 不会摘掉新 bridge。随后遍历 `boundSessions`，逐个 `permissionBridge.unbindSession(sessionId, token)`；只有 token 仍是当前 owner 时才清理该 session 的审批回流与 `permissionPolicy.clearSessionRules(sessionId)`。若同一 session 已被新 socket 重绑，旧 socket close 只会让旧 token 下的 pending 审批返回 `deny/session closed`，不会删除新绑定或清掉新会话的 session-scope 规则。workspace ask 绑定同样按 token fencing 清理；旧 token 下 active / queued ask 都返回 `{ cancelled: true }`。

其中 `open_session` 是 SessionWindow 的订阅 / 恢复握手：客户端首次连接与断线重连都会发送它；若 store 中已有对应 session，server 回 `session_snapshot`，让窗口在 agent-server 重启后恢复消息列表与状态。若持久化消息最后停在 user message 且当前进程没有该 session 的 active run，`SessionPersistence.recoverIncompleteTurnForSnapshot` 会在 snapshot 前补齐恢复状态：已持久化 `run_interrupted` 的轮次保持 `interrupted`；同一轮已有普通 runtime error 时，把原始 error message 作为 assistant 消息补回并返回 `failed`；没有可归属 error 事件时，才追加 assistant 错误消息与 `run_lost_after_restart` error 事件，避免 server 重启后历史里只剩用户消息。

## 与文件系统约定

| 路径 | 写入方 | 读取方 | 说明 |
|------|--------|--------|------|
| `~/.spotAgent/settings.json` | desktop（`AgentSettingsStore`） | agent-server（LLM 路径按 `mtimeMs + size` 失效重读；tool registry 在每轮 user message 前按同一文件戳刷新） | LLM provider / 模型配置 + tool allowlist/denylist |
| `~/.spotAgent/sessions/<id>.json` | agent-server（`FileSessionStore`） | agent-server | `PersistedSession` |
| `~/.spotAgent/blobs/<YYYY-MM-DD>/<uuid>.*` | agent-server（`FilesystemBlobStore`） | agent-server / LLM adapter / 后续 tool | 图片附件与大段 tool 输出的原始内容；图片只在进入 LLM 请求前按 blobId 读取 |
| `~/.spotAgent/blobs/<YYYY-MM-DD>/<uuid>.meta.json` | agent-server（`FilesystemBlobStore` / `TurnSummarizer`） | agent-server | Blob 元数据与可选 summary |
| `~/.spotAgent/workspaces.json` | desktop（`WorkspaceSettingsViewModel`） + agent-server（`FileWorkspaceRegistry` 自播种 default） | 双侧 | workspace 注册表 |
| `~/.spotAgent/permissions.json` | agent-server（`FilePermissionPolicy.remember`） | agent-server | 永久权限规则 |
| `~/.spotAgent/log/<YYYY-MM-DD>/network-NNN.jsonl` | agent-server（`FileNetworkLogger`） | 人工排查 | LLM 请求 / 响应 body |
| `~/.spotAgent/plugins/<plugin-id>/plugin.json` | 用户 / 本地安装流程 | desktop / agent-server | Action Plugin manifest；desktop 渲染 prompt template，agent-server 校验 `actionBinding` 并解析 `mcpServerIds` |
| `~/.spotAgent/mcp.json` | 用户 / 本地安装流程 | agent-server | MCP server 配置；缺失文件等价于 `{ "version": 1, "servers": [] }` |

## LLM 模式

默认模式是 `settings`：`startDefaultServer` 使用 `SettingsBackedLLMClient` 读取 `~/.spotAgent/settings.json` 并启用 `TurnSummarizer`。`llm.provider` 缺失时默认走 `openai-compatible`；当前支持 `openai-compatible` 与 `anthropic`。core 的 `LLMClientFactory` 会显式声明 provider capability，并在不支持图片时提前抛错，在不支持 tool calling 的路径上传空 tools 降级。

当环境变量 `HANDAGENT_LLM_MODE=mock` 时，`startDefaultServer` 改用 core 的 `MockLLMClient`，并关闭 summarizer，避免日常 QA 触发真实端点。桌面 QA 推荐通过包参数写入 bundle marker：

```bash
bash ./scripts/package-app.sh --mock-llm
open dist/HandAgentDesktop.app
```

新增 QA 能力时，mock 返回结构与触发词必须先维护在 `packages/core/src/llm/MockLLMClient.ts` 的 `mockLLMScenarios`，再补对应 runtime / tool 测试。

## 编辑此目录的约束

- 不允许 `import` 任何 macOS / browser-only 模块；只用 Node 标准库、`ws` 与 `@handagent/core/...` package alias 访问 core。
- 不在此处定义跨进程 DTO，会话帧走 `packages/core/src/protocol/SessionMessage.ts`，平台帧走 `packages/core/src/protocol/PlatformBridgeMessage.ts`，避免 desktop 与 server 漂移。
- 新增长驻服务（store / bridge / policy）必须放进 `startDefaultServer`，并通过参数透传给 `startServer`，保持 `startServer` 的可注入构造。
- 新增协议分支优先放在 `SessionRouter`；新增 runtime 事件翻译优先放在 `MessageTranslator`；新增持久化顺序优先放在 `SessionPersistence`，不要把职责重新堆回单个类。

## 调试建议

- 修改 TS 后必须重启 desktop app（无 hot reload）。
- 报错排查优先看 `~/.spotAgent/log/`（请求 / 响应 body）与 `~/.spotAgent/sessions/<id>.json`（事件审计）。
- 测试统一放在 `tests/`，按职责分为 `bridges/`、`protocol/`、`server/`、`session/`、`settings/` 与 `support/`；不要再把 `.test.ts` 混进 `src/`。
- 验证：`bash ./scripts/test.sh` 跑 vitest 全量；单文件 `pnpm exec vitest run apps/agent-server/tests/<dir>/<file>.test.ts`。

## 相关代码与文档

- [server.ts](/Users/mu9/proj/handAgent/apps/agent-server/src/server.ts)
- [SessionRouter.ts](/Users/mu9/proj/handAgent/apps/agent-server/src/SessionRouter.ts)
- [SessionRuntimeOrchestrator.ts](/Users/mu9/proj/handAgent/apps/agent-server/src/SessionRuntimeOrchestrator.ts)
- [SessionPersistence.ts](/Users/mu9/proj/handAgent/apps/agent-server/src/SessionPersistence.ts)
- [MessageTranslator.ts](/Users/mu9/proj/handAgent/apps/agent-server/src/MessageTranslator.ts)
- [SessionPermissionBridge.ts](/Users/mu9/proj/handAgent/apps/agent-server/src/SessionPermissionBridge.ts)
- [SessionWorkspaceAskBridge.ts](/Users/mu9/proj/handAgent/apps/agent-server/src/SessionWorkspaceAskBridge.ts)
- [SettingsBackedLLMClient.ts](/Users/mu9/proj/handAgent/apps/agent-server/src/SettingsBackedLLMClient.ts)
- [SettingsBackedToolRegistry.ts](/Users/mu9/proj/handAgent/apps/agent-server/src/SettingsBackedToolRegistry.ts)
- [ActionBindingResolver.ts](/Users/mu9/proj/handAgent/apps/agent-server/src/ActionBindingResolver.ts)
- [MCPServerRegistry.ts](/Users/mu9/proj/handAgent/apps/agent-server/src/MCPServerRegistry.ts)
- [ComputerUseMCPClient.ts](/Users/mu9/proj/handAgent/apps/agent-server/src/ComputerUseMCPClient.ts)
- [SessionScopedToolRegistry.ts](/Users/mu9/proj/handAgent/apps/agent-server/src/SessionScopedToolRegistry.ts)
- [WebSocketPlatformBridge.ts](/Users/mu9/proj/handAgent/apps/agent-server/src/WebSocketPlatformBridge.ts)
- 协议参考：[protocol/protocol.md](/Users/mu9/proj/handAgent/packages/core/src/protocol/protocol.md)
- MCP 模块：[mcp/mcp.md](/Users/mu9/proj/handAgent/packages/core/src/mcp/mcp.md)
- 桌面侧反向 IPC：[PlatformBridge](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/PlatformBridge/platform-bridge.md)

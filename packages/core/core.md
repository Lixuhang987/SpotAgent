# core

## 目录职责

`packages/core` 是跨平台 Agent Core，负责会话建模、消息结构、LLM/tool 循环、tool 注册与平台抽象。

TypeScript workspace 包名为 `@handagent/core`。应用层代码应通过 `@handagent/core/<subpath>` 引用本包导出的 `src/` 子路径，不使用跨包相对路径 reach into core。

下级文档入口：

- [src/src.md](/Users/mu9/proj/handAgent/packages/core/src/src.md)

## 核心子模块

| 子模块 | 职责 | 文档 |
|------|------|------|
| `runtime/` | 会话循环、消息模型、tool call 编排 | [runtime/runtime.md](/Users/mu9/proj/handAgent/packages/core/src/runtime/runtime.md) |
| `actions/` | Action manifest 与 session binding 解析 | [actions/actions.md](/Users/mu9/proj/handAgent/packages/core/src/actions/actions.md) |
| `llm/` | LLMClient 抽象与 Vercel AI SDK 适配 | [llm/llm.md](/Users/mu9/proj/handAgent/packages/core/src/llm/llm.md) |
| `mcp/` | 标准 MCP client 与 tool adapter | [mcp/mcp.md](/Users/mu9/proj/handAgent/packages/core/src/mcp/mcp.md) |
| `tools/` | AgentTool 协议、ToolRegistry、11 个 builtin tool | [tools/tools.md](/Users/mu9/proj/handAgent/packages/core/src/tools/tools.md) |
| `platform/` | PlatformAdapter / PlatformBridge / RemotePlatformAdapter / OfflinePlatformAdapter | [platform/platform.md](/Users/mu9/proj/handAgent/packages/core/src/platform/platform.md) |
| `permission/` | 权限策略接口与文件持久化实现 | [permission/permission.md](/Users/mu9/proj/handAgent/packages/core/src/permission/permission.md) |
| `storage/` | PersistedSession / SessionStore / 内存与文件实现 | [storage/storage.md](/Users/mu9/proj/handAgent/packages/core/src/storage/storage.md) |
| `workspace/` | Workspace 注册表与文件沙箱根目录 | [workspace/workspace.md](/Users/mu9/proj/handAgent/packages/core/src/workspace/workspace.md) |
| `config/` | settings.json 解析（model / tools） | [config/config.md](/Users/mu9/proj/handAgent/packages/core/src/config/config.md) |
| `logging/` | NetworkLogger 与 fetch 包装，落 JSONL 到 `~/.spotAgent/log/` | [logging/logging.md](/Users/mu9/proj/handAgent/packages/core/src/logging/logging.md) |
| `protocol/` | desktop ↔ agent-server WS 协议：SessionMessage + PlatformBridgeMessage | [protocol/protocol.md](/Users/mu9/proj/handAgent/packages/core/src/protocol/protocol.md) |
| `conversation/` | UI / 持久化用 ConversationMessage 模型 | [conversation/conversation.md](/Users/mu9/proj/handAgent/packages/core/src/conversation/conversation.md) |
| `selection/` | 用户主动选区抽象 | [selection/selection.md](/Users/mu9/proj/handAgent/packages/core/src/selection/selection.md) |

## Core 主调用链路

```mermaid
flowchart TD
  A[AgentSession.open] --> B[buildInitialUserMessage]
  B --> C[AgentRuntime.run]
  C --> D[LLMClient.stream]
  D --> D1[assistant delta events]
  D1 --> E{toolCalls?}
  E -- 否 --> F[AgentRunResult]
  E -- 是 --> G[ToolRegistry.get]
  G --> H[AgentTool.call]
  H --> I[tool result -> AgentMessage(tool)]
  I --> D
```

## Core 核心 DTO

### 会话层

- `AgentSessionInput`
  - `prompt: string`
  - `selection?: SelectionCaptureResult | null`
- `SelectionCaptureResult`
  - `selected`
  - `empty`
  - `error`

### 消息层

- `AgentMessage`
  - `user`
  - `assistant`
  - `tool`
  - `system`
- `ToolCallEnvelope`
  - `id`
  - `name`
  - `arguments`

### Runtime 输出

- `AgentBubble`
  - `id`
  - `text`
- `AgentRunResult`
  - `messages`
  - `bubbles`

### Tool 协议

- `AgentTool<TInput, TOutput>`
- `RegisteredTool`
- `ToolRegistry`

### 平台抽象

- `PlatformAdapter`
- `PlatformBridge`（跨进程 RPC 接口；`OfflineError` / `TimeoutError` / `RemoteError` 三个类型化错误）
- `FrontmostAppInfo`
- `WindowInfo`
- `ScreenCaptureRequest`
- `ScreenCaptureResult`
- `OCRRequest`
- `OCRResult`
- `AccessibilityNodeSnapshot`
- `AccessibilityActionRequest`
- `AccessibilityActionResult`

### 持久化与权限

- `PersistedSession` / `SessionMetadata` / `SessionEvent`
- `SessionStore`（接口）+ `InMemorySessionStore` + `FileSessionStore`
- `Workspace` / `WorkspaceRegistry` + `FileWorkspaceRegistry`
- `PermissionPolicy` / `PermissionDecision` / `PermissionResolution` / `PermissionScope`
- `FilePermissionPolicy`（持久化到 `~/.spotAgent/permissions.json`）

### 跨进程协议

- `SessionMessage`（会话、历史、权限审批帧）
- `PlatformBridgeMessage` / `PlatformResponsePayload`
- `UserMessageAttachment` / `SessionListEntry`
- `ConversationMessage` / `ConversationMessageStatus` / `ToolMessageStatus`

## 目录级职责边界

- `runtime` 只管消息循环，不关心 UI。
- `llm` 只管 provider 适配，不关心窗口或平台。
- `tools` 只管 tool schema 与调用，不关心会话页面状态。
- `platform` 只定义协议与 RPC 入口，不写 macOS 细节。
- `permission` 只定义策略接口与持久化，不做 UI 询问；UI 通过 `AskResolver` 注入。
- `storage` 只做持久化，不感知 runtime 内部状态机。
- `workspace` 只管沙箱根目录，不暴露绝对路径给 LLM。
- `config` 仅同步读取 `~/.spotAgent/settings.json`，无监听器、无缓存。
- `logging` 仅写网络日志，不参与产品决策。
- `protocol` 仅定义跨进程 WS 消息形状；TS / Swift 双侧据此对齐。
- `conversation` 是 UI/持久化消息模型，与 LLM 面向的 `AgentMessage` 解耦。
- `selection` 只定义用户选区抽象，不做宿主编排。

## 开发约定

### LLM 与 tool 约定

- LLM 通过 `LLMClient` 抽象接入，不要把具体 provider 写死在 runtime。
- tool 名称保持点号风格，例如 `file.read`、`screen.capture`、`app.frontmost`。
- tool 输出要尽量可序列化，错误语义要明确。
- 新 tool 优先保持单一职责，输入和输出都要小。

### 输入边界

- 在会话开始前，不要默认抓取额外上下文；只有用户主动输入和用户主动选区可以作为初始上下文。
- 屏幕、窗口、文件、剪贴板、App 状态一律通过 tool 按需读取。
- 任何 tool 的输入 schema 必须清晰、稳定、可序列化，避免把宿主内部状态直接暴露给 LLM。

## 测试目录

`packages/core/tests/` 按 `src/` 的模块边界分组，例如 `runtime/`、`tools/`、`llm/`、`workspace/`、`actions/`、`mcp/`。新增测试优先放入对应模块目录；builtin tool 相关测试放在 `tests/tools/builtins/`。

日常 `bash ./scripts/test.sh` 直接运行整棵 `packages/core/tests`，不要在脚本中继续维护扁平文件清单。真实 LLM API 测试位于 `tests/llm/vercel-client.integration.test.ts`，默认 skip，仅通过 `pnpm run test:llm:integration` 显式开启。

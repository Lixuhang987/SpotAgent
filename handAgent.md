# handAgent

## 文档目标

本文档是仓库级总览，描述 HandAgent 的分层架构、核心调用链路、关键 DTO，以及各子目录文档之间的关系。

下级文档入口：

- [apps/apps.md](/Users/mu9/proj/handAgent/apps/apps.md)
- [packages/packages.md](/Users/mu9/proj/handAgent/packages/packages.md)
- [examples/examples.md](/Users/mu9/proj/handAgent/examples/examples.md)

## 产品边界

- 当前产品是一个可由全局热键随时唤起的桌面 Agent。
- 第一版以 macOS 为优先，但核心 runtime 和 tool 协议按跨平台方式设计。
- 只有用户主动输入和用户主动选区可以作为会话初始上下文。
- 屏幕、窗口、文件、剪贴板、App 状态等信息不能默认注入模型，只能通过 tool 按需读取。

## 分层架构

```mermaid
flowchart TD
  A[apps/desktop<br/>macOS 宿主与 SwiftUI 交互壳] --> B[apps/agent-server<br/>本地会话桥与 runtime 驱动]
  B --> C[packages/core<br/>会话、消息、LLM/tool 循环]
  A -->|PlatformBridge 反向 IPC| C
```

### 分层职责

- `apps/desktop`：负责宿主生命周期、热键、PromptPanel、全局唯一 SessionWindow、状态气泡，以及通过 `MacPlatformProvider` 实现 macOS 原生能力（ScreenCaptureKit / NSWorkspace / NSPasteboard 等）。
- `apps/agent-server`：负责本地 WebSocket session 桥、会话路由、持久化封装和 runtime 驱动。
- `packages/core`：负责会话输入归一化、消息模型、tool 注册、LLM/tool 循环、`RemotePlatformAdapter` 通过 `PlatformBridge` 接口向桌面 App 请求平台能力。

## 主调用链路

```mermaid
flowchart TD
  A[用户按下全局热键] --> B[PromptPanelController.show]
  B --> C[用户提交 prompt]
  C --> D[Swift 创建或聚焦 SessionWindow]
  D --> E[SessionWindowLifecycle 复用唯一 AppServerConnection]
  E --> F[agent-server 接收 SessionCommand]
  F --> G[SessionCommandRouter 路由命令]
  G --> H[AgentRuntime.run]
  H --> I[LLMClient.stream]
  I --> I1[转发 delta / tool / request 为单向事件]
  I1 --> J{返回 toolCalls?}
  J -- 否 --> K[SwiftUI 渲染消息列表]
  J -- 是 --> L[ToolRegistry.get]
  L --> M[AgentTool.call]
  M --> N[PlatformAdapter 或文件系统]
  N --> I
```

## 主链路阶段 DTO

### 1. Prompt 与会话输入

- `AgentSessionInput`
  - `prompt: string`
  - `selection?: SelectionCaptureResult | null`
- `SelectionCaptureResult`
  - `{ kind: "selected"; text: string }`
  - `{ kind: "empty" }`
  - `{ kind: "error"; message?: string }`
- `AgentSession`
  - `prompt: string`
  - `selectedText: string | null`
- `UserMessageAttachment`（agent-server WS 协议）
  - `{ kind: "text-selection"; id; text }`
  - `{ kind: "image"; id; mimeType; base64 }`
- `PromptAttachmentResult`（desktop 内部）：5 case 详见 [PromptPanel](/Users/mu9/proj/handAgent/apps/desktop/Sources/PromptPanel/prompt-panel.md)。

### 2. Swift 宿主聚合状态

- `SessionSummary`
  - `sessionId: string`
  - `isRunning: boolean`
  - `latestSummary: string`
  - `lastActiveAt: Date`
  - `windowIsOpen: boolean`

### 3. Runtime 与 LLM

- `AgentMessage`
  - `user`
  - `assistant`
  - `tool`
  - `system`
- `ToolCallEnvelope`
  - `id: string`
  - `name: string`
  - `arguments: Record<string, unknown>`
- `LLMStreamEvent`
  - `text_delta`
  - `tool_call`
  - `message_end`
- `LLMCompletion`（兼容聚合结果）
  - `message: assistant message`
  - `toolCalls?: ToolCallEnvelope[]`
- `AgentRunResult`
  - `messages: AgentMessage[]`

### 4. Tool 与平台

- `RegisteredTool`
  - `name`
  - `description`
  - `inputSchema`
- `AgentTool<TInput, TOutput>`
  - `call(input): Promise<TOutput>`
- `PlatformAdapter`
  - `currentClipboardText`
  - `frontmostAppInfo`
  - `frontmostWindowList`
  - `captureScreen`
  - `recognizeText`
  - `accessibilitySnapshot`
  - `performAccessibilityAction`
- `PlatformBridge`：跨进程 RPC 接口；定义 `OfflineError` / `TimeoutError` / `RemoteError` 三个类型化错误。

### 5. 会话存储

- `SessionMetadata`
  - `id: string`
  - `title: string | null`
  - `createdAt: string`
  - `updatedAt: string`
  - `messageCount: number`
- `PersistedSession`
  - `version: 1`
  - `metadata: SessionMetadata`
  - `messages: AgentMessage[]`
  - `events: SessionEvent[]`
- `SessionEvent`
  - `tool_call`：记录 tool 调用入参
  - `tool_result`：记录 tool 执行结果与耗时
  - `permission_request`：权限审批记录（审计事件名，不是当前 UI 主协议名）
  - `error`：运行时错误
- `SessionStore`（接口）
  - `create / get / delete / list`
  - `updateTitle / appendMessages / setMessages / appendEvents`

### 6. 工作区与权限

- `Workspace` / `WorkspaceRegistry` / `FileWorkspaceRegistry`（持久化到 `~/.spotAgent/workspaces.json`）。
- `PermissionPolicy` / `PermissionDecision` / `PermissionResolution` / `PermissionScope` / `FilePermissionPolicy`（持久化到 `~/.spotAgent/permissions.json`）。

### 7. 跨进程协议（`packages/core/src/protocol/`）

当前跨进程协议分为五组 DTO：

- `SessionCommand`：desktop -> agent-server 的会话命令，例如 `session_create`、`session_subscribe`、`turn_start`、`turn_interrupt`、`sessions_list`、`session_delete`。
- `SessionEvent`：agent-server / core -> desktop 的会话事件，例如 `session_created`、`session_snapshot`、`user_message_recorded`、`turn_started`、`assistant_delta`、`tool_started`、`tool_finished`、`turn_completed`、`session_status_changed`、`session_error`。
- `ServerRequest`：server -> desktop 的待回执请求，当前包括 `permission_ask` 与 `workspace_ask`。
- `ClientResponse`：desktop -> server 的请求回执，当前包括 `permission_answer` 与 `workspace_answer`。
- `PlatformBridgeMessage`：独立于会话协议的反向平台 IPC，仍使用 `channel: "platform"` + `platform_bridge_hello` / `platform_request` / `platform_response`。

详见 [protocol/protocol.md](/Users/mu9/proj/handAgent/packages/core/src/protocol/protocol.md)。

## 当前实现状态

- 当前桌面壳已经切到 `PromptPanel + 全局唯一 SessionWindow + StatusBubble`。
- 当前桌面端使用全局唯一 SessionWindow。SessionWindow 左侧展示持久化会话历史；点击历史项会在当前窗口创建或激活 tab。Window 拥有 tabs；tab 拥有 `sessionId`、消息、运行态、权限请求和 workspace 选择等完整会话生命周期，并通过共享连接接收各自事件。
- `agent-server` 通过 `SessionCommandRouter + SessionRuntimeOrchestrator + SessionEventPublisher + SessionPersistence + SessionStore` 管理会话并驱动 runtime。
- `packages/core/src/storage` 提供持久化会话存储，默认使用 `FileSessionStore` 将会话写入 `~/.spotAgent/sessions/`。
- 桌面端通过共享 `AppServerConnection` 与 agent-server 通信；单个 SessionWindow 内多个 tab 通过 `session_subscribe` / `session_unsubscribe` 复用同一连接，并按 `sessionId` 路由 `SessionEvent` 与 `ServerRequest`。
- 桌面端通过 agent-server 的会话协议读取同一目录，为 SessionWindow 左侧历史列表提供恢复和删除入口；恢复同一 `sessionId` 时优先激活已有 tab，未打开时创建新 tab 并等待 `session_snapshot` 恢复。
- `packages/core` 已经定义完整的 tool、platform DTO。
- macOS 平台能力由 `apps/desktop` 内的 `MacPlatformProvider` 实现：剪贴板（`NSPasteboard`）、App 列表与前台 App（`NSWorkspace`）、窗口列表（`CGWindowListCopyWindowInfo`）、屏幕截图（`ScreenCaptureKit` + `SCScreenshotManager`，支持 display / window / region 三种 target）、OCR（Vision）与 Accessibility snapshot / action。
- 桌面 App 通过 `PlatformBridgeService` 与 `agent-server` 维护一条独立 WebSocket 反向通道，core 侧通过 `RemotePlatformAdapter` 调用平台能力。
- SessionWindow 已有共享连接断线自动重连、历史刷新与 tab 重新订阅逻辑；仍需实机验证 agent-server 重启后的 `session_snapshot` 恢复体验。
- 图片 attachment 会落 Blob/Stub；agent-server 在 runtime 前把 image STUB 展开为多模态 image part，LLM 是否能理解图片取决于当前 provider capability。

## 阅读顺序建议

1. 先读本文档，建立整体分层和主链路。
2. 再读 [apps/apps.md](/Users/mu9/proj/handAgent/apps/apps.md)，理解入口与交互层。
3. 再读 [packages/packages.md](/Users/mu9/proj/handAgent/packages/packages.md)，理解核心 runtime 与平台实现。

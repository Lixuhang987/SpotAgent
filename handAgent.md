# handAgent

## 文档目标

本文档是仓库级总览，描述 HandAgent 的分层架构、核心调用链路、关键 DTO，以及各子目录文档之间的关系。

下级文档入口：

- [apps/apps.md](/Users/mu9/proj/handAgent/apps/apps.md)
- [packages/packages.md](/Users/mu9/proj/handAgent/packages/packages.md)

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
  C --> D[packages/platform-macos<br/>macOS 平台实现]
```

### 分层职责

- `apps/desktop`：负责宿主生命周期、热键、PromptPanel、SessionWindow 与状态气泡。
- `apps/agent-server`：负责本地 WebSocket session 桥、`SessionManager` 和 runtime 驱动。
- `packages/core`：负责会话输入归一化、消息模型、tool 注册、LLM/tool 循环。
- `packages/platform-macos`：负责把平台能力映射到 macOS 的系统命令或 AppleScript。

## 主调用链路

```mermaid
flowchart TD
  A[用户按下全局热键] --> B[PromptPanelController.show]
  B --> C[用户提交 prompt]
  C --> D[Swift 创建 SessionWindow 与 SessionSocketClient]
  D --> E[agent-server 接收 SessionMessage]
  E --> F[AgentRuntime.run]
  F --> G[LLMClient.complete]
  G --> H{返回 toolCalls?}
  H -- 否 --> I[SwiftUI 渲染消息列表]
  H -- 是 --> J[ToolRegistry.get]
  J --> K[AgentTool.call]
  K --> L[PlatformAdapter 或文件系统]
  L --> G
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
- `LLMCompletion`
  - `message: assistant message`
  - `toolCalls?: ToolCallEnvelope[]`
- `AgentRunResult`
  - `messages: AgentMessage[]`
  - `bubbles: AgentBubble[]`

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
  - `permission_request`：预留权限审批记录
  - `error`：运行时错误
- `SessionStore`（接口）
  - `create / get / delete / list`
  - `updateTitle / appendMessages / setMessages / appendEvents`

## 当前实现状态

- 当前桌面壳已经切到 `PromptPanel + SessionWindow + StatusBubble`。
- `agent-server` 通过 `SessionManager + SessionStore` 管理会话并驱动 runtime。
- `packages/core/src/storage` 提供持久化会话存储，默认使用 `FileSessionStore` 将会话写入 `~/.spotAgent/sessions/`。
- `packages/core` 已经定义完整的 tool、platform DTO。
- `packages/platform-macos` 当前实现了选区捕获、前台 App、窗口列表、剪贴板、区域截图；OCR 与 accessibility 仍未完成。

## 阅读顺序建议

1. 先读本文档，建立整体分层和主链路。
2. 再读 [apps/apps.md](/Users/mu9/proj/handAgent/apps/apps.md)，理解入口与交互层。
3. 再读 [packages/packages.md](/Users/mu9/proj/handAgent/packages/packages.md)，理解核心 runtime 与平台实现。

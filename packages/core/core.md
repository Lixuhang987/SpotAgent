# core

## 目录职责

`packages/core` 是跨平台 Agent Core，负责会话建模、消息结构、LLM/tool 循环、tool 注册与平台抽象。

下级文档入口：

- [src/src.md](/Users/mu9/proj/handAgent/packages/core/src/src.md)

## 核心子模块

- `runtime`
- `llm`
- `tools`
- `platform`
- `selection`

## Core 主调用链路

```mermaid
flowchart TD
  A[AgentSession.open] --> B[buildInitialUserMessage]
  B --> C[AgentRuntime.run]
  C --> D[LLMClient.complete]
  D --> E{toolCalls?}
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
- `FrontmostAppInfo`
- `WindowInfo`
- `ScreenCaptureRequest`
- `ScreenCaptureResult`
- `OCRRequest`
- `OCRResult`
- `AccessibilityNodeSnapshot`
- `AccessibilityActionRequest`
- `AccessibilityActionResult`

## 目录级职责边界

- `runtime` 只管消息循环，不关心 UI。
- `llm` 只管 provider 适配，不关心窗口或平台。
- `tools` 只管 tool schema 与调用，不关心会话页面状态。
- `platform` 只定义协议，不写 macOS 细节。
- `selection` 只定义用户选区抽象，不做宿主编排。

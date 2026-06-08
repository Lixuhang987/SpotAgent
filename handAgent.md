# handAgent

## 文档目标

本文档是仓库级总览，描述 HandAgent 的分层架构、核心调用链路、跨层合约，以及各子目录文档之间的关系。

下级文档入口：

- [apps/apps.md](/Users/mu9/proj/handAgent/apps/apps.md)
- [packages/packages.md](/Users/mu9/proj/handAgent/packages/packages.md)
- [examples/examples.md](/Users/mu9/proj/handAgent/examples/examples.md)

## 产品边界

- 当前产品是一个可由全局热键随时唤起的桌面 Agent。
- 第一版以 macOS 为优先，但核心 runtime 和 tool 协议按跨平台方式设计。
- 只有用户主动提供的输入或附件可以作为 thread 初始上下文，例如 prompt、文本选区、主动圈选截图。
- 屏幕、窗口、文件、剪贴板、App 状态等信息不能默认注入模型，只能通过 tool 按需读取。

## 分层架构

```mermaid
flowchart TD
  A[apps/desktop<br/>macOS 宿主与 WKWebView 壳] --> W[apps/thread-window-web<br/>React ThreadWindow]
  W -->|/api/thread WebSocket| B[apps/agent-server<br/>本地 thread 桥与 runtime 驱动]
  A -->|/api/platform WebSocket| B
  B --> C[packages/core<br/>thread、turn、消息、LLM/tool 循环]
```

### 分层职责

- `apps/desktop`：负责宿主生命周期、热键、PromptPanel、全局唯一 ThreadWindow 的 `NSWindow/WKWebView` 生命周期、状态气泡，以及通过 `MacPlatformProvider` 实现 macOS 原生能力（ScreenCaptureKit / NSWorkspace / NSPasteboard 等）。
- `apps/thread-window-web`：负责 React ThreadWindow UI，直接持有 `/api/thread` WebSocket，管理历史、tabs、消息、请求回执和 composer 状态。
- `apps/agent-server`：负责本地 WebSocket thread 桥、`/api/thread` 与 `/api/platform` 路径分流、thread/turn 路由、持久化封装和 runtime 驱动。
- `packages/core`：负责 thread 输入归一化、消息模型、tool 注册、LLM/tool 循环、`RemotePlatformAdapter` 通过 `PlatformBridge` 接口向桌面 App 请求平台能力。

## 主调用链路

```mermaid
flowchart TD
  A[用户按下全局热键] --> B[Swift 宿主打开 PromptPanel]
  B --> C[用户输入 prompt 并提交]
  C --> D[Swift 创建 ThreadWindow WKWebView 并注入初始 prompt]
  D --> E[React 连接 /api/thread 并发送 ThreadCommand]
  E --> F[agent-server 接收 ThreadCommand]
  F --> G[ThreadCommandRouter 路由命令]
  G --> H[AgentRuntime.run]
  H --> I[LLMClient.stream]
  I --> I1[转发 delta / tool / request 为单向事件]
  I1 --> J{返回 toolCalls?}
  J -- 否 --> K[React 渲染 assistant 消息]
  J -- 是 --> L[ToolRegistry.get]
  L --> M[AgentTool.call]
  M --> N[PlatformAdapter 或文件系统]
  N --> I
  N --> O[platform tool 经 /api/platform 请求 Swift]
  O --> I
```

## 跨层合约

- 初始上下文只来自用户主动输入和主动附件。PromptPanel 的 attachment 只通过 initial prompt 进入 React；屏幕、剪贴板、App 状态和文件读取都必须走 tool。
- Thread 主协议只跑在 `/api/thread`：React 发送 `ThreadCommand` / `ClientResponse`，agent-server 发送 `ThreadNotification` / `ServerRequest`。
- 平台 RPC 只跑在 `/api/platform`：Swift desktop 发送 `platform_bridge_hello`，处理 `channel: "platform"` 的 `platform_request`，并回写 `platform_response`。
- `thread.snapshot` 是打开、恢复和重连后的 thread 状态入口；`workspace.listed` 是 `workspace.list` 的连接级响应，不带 `threadId`。
- `permission.requested` / `workspace.requested` 是 server 向 React 提问、等待 UI 回执的少量交互；不要把它们混入普通 notification 或 platform RPC。
- 持久化主目录是 `~/.spotAgent/threads/`；workspace、permission、blob、log、plugin、MCP 配置分别由对应模块文档说明。
- 图片 attachment 先落 Blob/STUB；agent-server 在 runtime 前展开为多模态 image part，最终能否理解图片取决于当前 provider capability。

协议字段详见 [protocol/protocol.md](/Users/mu9/proj/handAgent/packages/core/src/protocol/protocol.md)。desktop 内部提交模型见 [PromptPanel](/Users/mu9/proj/handAgent/apps/desktop/Sources/PromptPanel/prompt-panel.md)，React UI 状态见 [thread-window-web](/Users/mu9/proj/handAgent/apps/thread-window-web/thread-window-web.md)，agent-server 编排见 [agent-server](/Users/mu9/proj/handAgent/apps/agent-server/agent-server.md)。

## 当前架构不变量

- Swift desktop 不持有 thread client，不发送 `ThreadCommand`，不解析 `ThreadNotification`；只负责 PromptPanel、`NSWindow/WKWebView` host、initial prompt 注入、StatusBubble 与 macOS 平台能力实现。
- React ThreadWindow 是 tabs、历史、消息、运行态、permission/workspace 请求面板和 composer 的 UI 状态源。
- agent-server 是组合根和本地桥：负责 socket 路径拆分、thread/turn 路由、runtime 驱动、持久化封装、permission/workspace 回执桥和 platform bridge 转发；外部用户输入命令统一是 `input.submit`，后端内部归一化为 input item。
- packages/core 只定义跨平台 runtime、tool、platform、protocol、storage、workspace 和 permission 抽象，不实现 UI 或 macOS 原生能力。

## 阅读顺序建议

1. 先读本文档，建立整体分层和主链路。
2. 再读 [apps/apps.md](/Users/mu9/proj/handAgent/apps/apps.md)，理解入口与交互层。
3. 再读 [packages/packages.md](/Users/mu9/proj/handAgent/packages/packages.md)，理解核心 runtime 与平台实现。

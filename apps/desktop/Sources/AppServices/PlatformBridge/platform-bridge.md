# PlatformBridge

`PlatformBridgeService` 是桌面 App 进程内的平台请求处理器。`PlatformBridgeConnectionClient` 建立到 `ws://127.0.0.1:4317/api/platform` 的独立 WebSocket，连接成功后发送 `channel: "platform"` 的 `platform_bridge_hello`，并把收到的 `platform_request` 分派给 `PlatformBridgeService`。service 调用 `MacPlatformProvider` 后编码 `platform_response`，仍通过 `/api/platform` 连接回到 `agent-server`，让 server 通过 `RemotePlatformAdapter` 调用 macOS 原生能力（剪贴板 / 前台 App / 窗口列表等）。

设计关键：

- **独立连接，独立语义**：platform RPC 只使用 `/api/platform`，不与 React ThreadWindow 的 `/api/thread` 共享 WebSocket。
- **provider 注入**：`MacPlatformProvider` 实现 macOS 原生能力；UI 层只关心 service 生命周期。
- **能力分级**：clipboard / app / window / screen 已落地（`NSPasteboard` / `NSWorkspace.runningApplications` / `CGWindowListCopyWindowInfo` / `ScreenCaptureKit SCScreenshotManager`）；`ocr.read` 走 Vision 文本识别；`accessibility.snapshot` / `accessibility.action` 走 Accessibility API。`app.list` 是内部平台桥能力，当前主要供 `ComputerUseMCPClient` 兼容层实现 `mcp.computer_use.list_apps`。
- **权限边界**：`screen.capture` 依赖「屏幕录制」权限，枚举内容失败时返回 `permission_denied` 并提示到系统设置授权。Accessibility 能力调用前用 `AXIsProcessTrustedWithOptions(false)` 检查，不主动弹系统权限框；未授权时返回 `permission_denied`，提示用户到「系统设置 → 隐私与安全性 → 辅助功能」允许 HandAgent。
- **上下文边界**：`ocr.read` 只处理 tool 入参里的 `imageBase64`，不会默认读取屏幕、剪贴板或文件；需要先由用户主动提供图片或由 LLM 显式调用 `screen.capture` 获得图片后再传入。
- **Accessibility 快照限制**：快照返回 `role` / `label` / `title` / `value` / `description` / `frame` / `elementId` / `children`，默认限制深度与子节点数量，上限为 `maxDepth=6`、`maxChildren=50`，避免一次返回巨大无障碍树。
- **Accessibility 动作限制**：`accessibility.action` 支持 `press`、`click`、`set_value`。元素定位优先使用快照返回的 `elementId`，格式为 `pid:<pid>;path:<childIndex.childIndex>`；`click` 先尝试 AX press，不支持时再按元素 frame 中心点发送鼠标事件。
- **重连归属**：断线与自动重连由 `/api/platform` 的 `AppServerConnection` 负责；重连成功后 `PlatformBridgeConnectionClient` 会重新发送 `platform_bridge_hello`。

调用链：

```mermaid
sequenceDiagram
  participant LLM
  participant Server as agent-server
  participant Client as PlatformBridgeConnectionClient
  participant Bridge as PlatformBridgeService
  participant Mac as MacPlatformProvider

  LLM->>Server: tool_call accessibility.snapshot
  Server->>Server: RemotePlatformAdapter.accessibilitySnapshot
  Server->>Client: PlatformBridgeMessage platform_request {method, requestId}
  Client->>Bridge: handleIncoming(raw)
  Bridge->>Mac: handle(method, args)
  Mac-->>Bridge: result
  Bridge-->>Client: PlatformBridgeMessage platform_response {status, result}
  Client->>Server: /api/platform send
  Server-->>LLM: tool result
```

文件：

- `PlatformBridgeService.swift`：负责 `channel: "platform"` 请求过滤、JSON 编解码、provider 调用和 `platform_response` 构造。
- `MacPlatformProvider.swift`：实际能力实现；新增 macOS 能力时在此扩展。

真实 App QA 步骤：

1. 启动桌面端并确认 agent-server 已连接：`bash ./scripts/swiftw run HandAgentDesktop`。
2. 确认 Swift 宿主建立到 `ws://127.0.0.1:4317/api/platform` 的 WebSocket；该连接只承载 `PlatformBridgeMessage`。
3. 在「系统设置 → 隐私与安全性 → 辅助功能」允许 HandAgent；如要通过 `screen.capture` 生成 OCR 图片，也在「屏幕录制」里允许 HandAgent。
4. 打开一个包含可读文本的图片或先用区域截图 tool 获取图片，让 LLM 调用 `ocr.read`，确认返回 `text` 和 `lines[].confidence`，且缺少 `imageBase64` 时返回 `invalid_argument`。
5. 打开 TextEdit 或系统设置作为前台 App，让 LLM 调用 `accessibility.snapshot`，目标 `{ "kind": "frontmost_app" }`，确认返回有限层级的 `children`，节点包含 `role`、可读 label/value 和可复用 `elementId`。
6. 选择一个快照里可操作的按钮或文本框，让 LLM 用该 `elementId` 调用 `accessibility.action`：按钮验证 `press` 或 `click`，文本框验证 `set_value`。
7. 临时移除 HandAgent 辅助功能权限后重复 snapshot/action，确认返回 `permission_denied`，文案指向「系统设置 → 隐私与安全性 → 辅助功能」。

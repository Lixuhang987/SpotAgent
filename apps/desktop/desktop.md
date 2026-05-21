# desktop

`apps/desktop` 是 macOS 宿主层：应用生命周期、PromptPanel、全局唯一 SessionWindow、StatusBubble、Settings 与全局热键。

## 架构红线（编辑此目录前必读）

新代码必须遵守以下约束。违反约束的改动应被回退或在合并前重设计。

### 1. 状态：Observation 框架（`@Observable`）

- **不要**新增 `ObservableObject` / `@Published` / `@StateObject` / `@ObservedObject` / Combine。所有状态类用 `@Observable`，View 用 `@Bindable`、`@State`。
- 非状态依赖（store、registry、回调闭包、socket client）用 `@ObservationIgnored` 标注，避免无意义的 SwiftUI 重渲染。
- `@MainActor` 用在 UI 相关的 `@Observable` 类（ViewModel / Registry / Settings store）；纯进程/IO 服务保持非 MainActor。

### 2. 模块布局：View + ViewModel + Controller + Styles

每个独立 UI 模块（PromptPanel / SessionWindow / StatusBubble / Settings）按四件套拆分：

- **View**：纯 SwiftUI，只读 ViewModel 状态、消费 `@Environment(\.appTheme)`，不直接调 `NSEvent` / `NSPanel` / 系统 API。
- **ViewModel**：`@Observable` 状态机；不持有 `View` / `Color` / `Font`；跨模块意图通过闭包出口（`onSubmit` / `onTap` / `onHide`）暴露。
- **Controller**（仅当模块需要 `NSPanel` / `NSWindow` 自定义生命周期时）：纯窗口与事件监听层，不写业务逻辑。
- **Styles**：跨 View 复用的 `ViewModifier`。一次性样式直接写在 View 里，避免 ViewModifier 爆炸。

### 3. 协调：AppCoordinator 单向事件流

- 全局唯一 `AppCoordinator`（`@Observable @MainActor`）由 `HandAgentApp` 持有为 `@State`。
- 模块间一切协调通过 `coordinator.send(.action)`，禁止 `NotificationCenter` / 全局单例 / 直接调 Coordinator 的 private 方法绕开。
- 新增协调行为：在 `AppCoordinator.Action` 枚举显式增分支；新窗口生命周期优先下沉到独立 lifecycle 控制器，子模块通过闭包注入接入。
- 测试态用 `AppCoordinator(services: AppServices.testing(...))` 注入 nop 服务，跳过窗口/进程/激活策略副作用；非测试态 `init()` 自动装配生产 `AppServices` 并 `bootstrap()`。

### 4. 视觉：Theme token

- 所有颜色、字体、间距、圆角、动画时长**必须**走 `theme.colors.*` / `theme.typography.*` / `theme.spacing.*` / `theme.radius.*` / `theme.animation.*`。
- View / Styles 中**禁止**硬编码 `Color(...)` / 字号 / `padding(20)` 等魔法数字。Token 缺失先扩 [Theme](Sources/Theme/theme.md)。
- 当前 dark-only + Raycast Glass + Mango Amber，目标 macOS 15+，不为旧系统加 fallback。

### 5. 输入边界（产品红线）

- 只有用户主动输入和用户主动选区可以作为会话初始上下文；屏幕 / 窗口 / 文件 / 剪贴板 / App 状态一律通过 tool 按需读取。
- 宿主层只通过 `WebSocket + SessionMessage` 与 agent-server 通信；**不组装 LLM 消息、不读取 runtime 内部状态、不直接执行 tool 编排**。
- 快捷键配置只保存在宿主层本地（UserDefaults，由 `KeyboardShortcuts` 库管理），不下沉到 runtime。

### 6. 点击区域：视觉边界 = 可交互边界

- 用户看到的可视区域（背景色、hover 高亮、圆角裁切）必须与实际可点击区域完全一致。
- 典型错误：`Button` 只包裹了内部文字/图标，外层容器虽有 `.contentShape` 和 hover 效果但没有绑定 tap action，导致"看起来能点但点不动"。
- 正确做法：将 tap 行为（`onTapGesture` 或 `Button`）绑定在**定义视觉边界的那一层**，而不是内部子元素。确保 `.contentShape(Rectangle())` 与 tap gesture 在同一层级。
- 审查清单：新增可交互组件时，确认 `background` / `clipShape` / `frame` 所在层级同时拥有对应的 tap action。如果 hover 区域能响应但点击不能，说明 hit area 和 action 分离了。

### 7. 测试与验证

- `TestsSwift/` 按 `Sources/` 目录结构分组；每个 ViewModel / 协调器都有对应 `*Tests.swift`，共享测试辅助放在 `TestsSwift/TestSupport/`。
- 新增 ViewModel 必须配测试；不把依赖系统权限或真实屏幕状态的 spike 放进自动化测试，真实平台能力走 `docs/manual-qa.md` 与模块 QA 步骤。
- 提交前在当前 shell 跑：`bash ./scripts/swiftw test` + `bash ./scripts/swiftw build` + `bash ./scripts/test.sh`。Stop hook 不跑 Swift 校验，必须手动。

### 8. macOS 15+ 能力策略

- 桌面端默认直接面向 `macOS 15+` 能力设计，不再为了旧系统保留 `if #available` 分支或命令行 fallback。
- 屏幕与窗口采集优先使用 `ScreenCaptureKit`，包括窗口/应用/显示器级过滤、截图与后续可扩展的流式采集能力。
- 与系统控制相关的能力优先使用原生 macOS API，例如 `Accessibility`、`NSWorkspace`、`ScreenCaptureKit`、`AppKit/SwiftUI` 提供的窗口分享与内容选择接口。
- 只有在原生 API 明确无法覆盖需求时，才退回 `osascript` 或其他兼容性方案；若采用退回方案，必须在设计或实现文档中说明原因。
- 新增桌面能力时，默认目标是"尽可能支持系统已提供的高能力接口"，例如系统级内容选择器、窗口级共享、录制或更完整的 accessibility 读写能力。

## 目录索引

下级文档入口：

- [Coordinator/](Sources/Coordinator/coordinator.md) — `AppCoordinator` 单向事件流
- [Theme/](Sources/Theme/theme.md) — 视觉 token 与 Environment 注入
- [PromptPanel/](Sources/PromptPanel/prompt-panel.md) — 命令面板 View+ViewModel+Controller+Styles
- [SessionWindow/](Sources/SessionWindow/session-window.md) — 单窗口多 tab 会话工作区、历史侧栏、权限气泡与 WebSocket 客户端
- [StatusBubble/](Sources/StatusBubble/status-bubble.md) — 右下角状态气泡
- [Settings/](Sources/Settings/settings.md) — 设置窗口 Tab 容器（model / tools / permissions / shortcuts / workspaces）
- [AppServices/](Sources/AppServices/app-services.md) — 跨模块共享服务（AgentServer / AgentSettings / Hotkey / Lifecycle / PlatformBridge / SelectionCapture / Session）

## 入口与启动流程

`HandAgentApp.swift` 是 SwiftUI `@main`：

- 持有 `AppCoordinator` 为 `@State`；非测试态 `init` 自动 `bootstrap()`。
- `Settings` scene 仅放空占位，实际设置窗口由 Coordinator 用 `NSWindow` 托管（需要主动 `openOrFocus` 控制）。
- `CommandGroup(replacing: .appSettings)` 把 ⌘, 路由到 `coordinator.send(.openSettings)`。

```mermaid
sequenceDiagram
  participant App as HandAgentApp (@main)
  participant Coord as AppCoordinator
  participant Server as AgentServerService
  participant Node as node 子进程

  App->>Coord: @State 初始化 → 自动 bootstrap()
  Coord->>Coord: setupPromptPanel + setupHotkey + setupStatusBubble
  Coord->>Server: start()
  Server->>Node: node --experimental-transform-types apps/agent-server/src/server.ts
  Coord->>Coord: statusBubbleController.show()
```

## 主调用链路

```mermaid
sequenceDiagram
  participant User as 用户
  participant Hotkey as KeyboardShortcuts
  participant Coord as AppCoordinator
  participant Panel as PromptPanel
  participant Window as SessionWindow
  participant Server as agent-server

  User->>Hotkey: 全局热键
  Hotkey->>Coord: send(.togglePromptPanel)
  Coord->>Panel: show()
  User->>Panel: 输入并提交
  Panel->>Coord: send(.submitPrompt)
  Coord->>Window: NSWindow + SessionWindowViewModel
  Window->>Server: WebSocket
  Server-->>Window: SessionEvent 流
```

## 关键 DTO

### `SessionSummary`（[Session](Sources/AppServices/Session/session.md)）

- `sessionId` / `isRunning` / `latestSummary` / `lastActiveAt` / `windowIsOpen`
- 用途：聚合 StatusBubble 显示与会话回跳。

### `AgentSettings` 文件结构（[AgentSettings](Sources/AppServices/AgentSettings/agent-settings.md)）

`~/.spotAgent/settings.json` 是 desktop 与 agent-server 共享模型配置的文件通道：

- desktop 侧 `AgentSettingsStore` 启动读一次 + 500ms 轮询；写入走 `update(_:)` 原子写。
- agent-server 侧 `SettingsBackedLLMClient.stream()` / `complete()` 每次先检查 `settings.json` 文件戳，配置未变化时复用已缓存的 `VercelClient`。
- 同一文件也支持 `tools.allowlist / tools.denylist`，Settings UI 的"工具"Tab 可切换 builtin tool；agent-server 每轮 user message 进入 runtime 前按文件戳刷新 tool registry。
- 修改后下一次 LLM 请求即生效，无需重启。

### `PromptAttachmentResult` / Action Plugin（[PromptPanel](Sources/PromptPanel/prompt-panel.md)）

`PromptAttachmentResult` 共有 5 个 case，对应不同附件采集结果：

- `.noAttachment`：无附件，普通提交。
- `.textToken(String)`：直接附加纯文本块（如内嵌的命令片段）。
- `.textSelection(text:source:)`：用户主动文本选区（来自 `MacSelectionCaptureProvider`，Cmd-C 抓 NSPasteboard）。
- `.imageRegion(base64:mimeType:)`：用户区域截图（来自 `MacRegionCaptureProvider`，保留 `screencapture -i` 作为用户主动圈选入口）。
- `.selectionError(message:)`：采集失败，UI 以禁用 chip + tooltip 反馈。

`ActionDefinition` 来自 `~/.spotAgent/plugins/*/plugin.json` 的 `prompts[]`，包含 `pluginId / promptName / trigger / template / arguments / mcpServerIds`。PromptPanel 只负责 trigger 匹配、参数编辑和 template 渲染；提交时发送渲染后的 prompt 与 `{ pluginId, promptName }`，由 agent-server 重新校验并持久化 session 绑定。`PromptAction` 仍保留给设置页中的 App 内快捷键，不再作为 PromptPanel row。

## 注意事项

- agent-server 是 desktop app fork 的长驻子进程，**修改 TS 源码必须重启 desktop app**，无 hot reload。
- `AgentServerService` 已实现指数退避重启（最多 5 次），多次失败时通过 `onFatalError` 回调上抛 Coordinator 弹原生 alert（详见 [agent-server.md](Sources/AppServices/AgentServer/agent-server.md)）。
- node 子进程 stdout/stderr 通过 Pipe 捕获但未暴露 UI（仅防 fd 泄漏）。
- 设置窗口与 Session 窗口共享 `AppActivationPolicyCoordinator`，全部关闭后 app 切回 `.accessory`。

# Swift 代码重构评审

本文基于 `swiftui-expert-skill` 的最新 API 参考与本仓库 Swift 全量静态扫描，聚焦桌面端中“可以更多使用成熟 SwiftUI / AppKit / Foundation / ScreenCaptureKit API，减少自维护机制”的改造点。

## 扫描范围

- 代码范围：`apps/desktop/HandAgentApp.swift`、`apps/desktop/Sources/**/*.swift`、`apps/desktop/TestsSwift/**/*.swift`。
- 规模：Swift 文件约 9.8k 行，其中桌面源码约 7k 行。
- 参考：`latest-apis.md`、`state-management.md`、`view-structure.md`、`performance-patterns.md`、`list-patterns.md`、`macos-scenes.md`、`macos-window-styling.md`、`macos-views.md`。

## 总体判断

桌面端整体已经比常见 SwiftUI 项目更现代：状态层基本统一到 `@Observable`，大量非状态依赖使用 `@ObservationIgnored`，全局快捷键也已经采用 `KeyboardShortcuts` 成熟库，没有继续手写 Carbon hotkey。当前主要问题不在“架构失控”，而在几个系统边界处仍有自维护实现：

- 设置窗口、状态气泡、SessionWindow 生命周期仍大量直接管理 `NSWindow` / `NSPanel`。
- 会话 WebSocket 与 PlatformBridge WebSocket 各自维护 callback receive loop、重连、JSON envelope。
- 平台能力中 `window.list`、手动区域截图、文本选区采集仍混用 `CGWindowList`、`screencapture`、`osascript`。
- Settings / workspace / permission / session history 有多处 `JSONSerialization + [String: Any]` 动态解析。
- Settings UI 有若干系统控件可替代的自绘控件，影响可访问性与维护成本。

## P0：优先消除自维护协议与系统边界

### 1. 把两个 WebSocket 客户端收敛到 async/await 通道

相关文件：

- `apps/desktop/Sources/SessionWindow/SessionSocketClient.swift`
- `apps/desktop/Sources/AppServices/PlatformBridge/PlatformBridgeService.swift`

现状：

- `SessionSocketClient` 与 `PlatformBridgeService` 都手写 `URLSessionWebSocketTask.receive` callback loop。
- 两边都用 `DispatchWorkItem + DispatchQueue.main.asyncAfter` 做重连。
- 两边都手写 timestamp、JSON send、断线恢复，行为接近但实现分叉。

建议：

- 抽一个 `WebSocketChannel` 或 `JSONWebSocketChannel`，内部使用 `Task` 管理 receive loop、send、cancel、reconnect。
- 优先使用 Foundation 的 async WebSocket API：`try await task.receive()`、`try await task.send(...)`，让取消语义走 Swift Concurrency。
- 重连策略使用同一个 `Clock.sleep` / backoff 实现，Session 与 PlatformBridge 只注入 envelope 编解码和事件处理。

收益：

- 避免两个 callback 状态机继续分叉。
- Stop / interrupt、app 退出、server 重启时更容易保证旧 task 不再回调到新状态。
- 测试可集中覆盖 reconnect、decode failure、manual disconnect、stale message fencing。

### 2. 会话与平台 envelope 改为 Codable DTO

相关文件：

- `apps/desktop/Sources/SessionWindow/SessionSocketClient.swift`
- `apps/desktop/Sources/AppServices/PlatformBridge/PlatformBridgeService.swift`
- `apps/desktop/Sources/Settings/WorkspaceSettingsViewModel.swift`
- `apps/desktop/Sources/Settings/PermissionRulesViewModel.swift`
- `apps/desktop/Sources/AppServices/Session/SessionHistoryStore.swift`

现状：

- 会话发送侧部分使用 `Encodable`，但 `sendJSON`、permission response、platform request/response、workspace/permission/session history 仍大量使用 `[String: Any]`。
- `permission_request.arguments` 为了保留任意 JSON，需要二次 `JSONSerialization`。

建议：

- 为稳定协议建立 `Codable` envelope：`SessionOutgoingEnvelope`、`SessionIncomingEnvelope`、`PlatformRequestEnvelope`、`PlatformResponseEnvelope`。
- 对确实需要保留任意 JSON 的字段引入小型 `JSONValue: Codable, Equatable`，避免散落 `[String: Any]`。
- `workspaces.json`、`permissions.json`、session history metadata 建立本地 DTO，读写都走 `JSONDecoder` / `JSONEncoder`。

收益：

- 字段拼写、缺省值、可选字段都能被编译器和测试覆盖。
- 后续协议拆字段时，不需要全局搜索字典 key。
- Swift 与 TypeScript 协议更容易做快照测试。

### 3. 平台窗口枚举统一到 ScreenCaptureKit

相关文件：

- `apps/desktop/Sources/AppServices/PlatformBridge/MacPlatformProvider.swift`

现状：

- `screen.capture` 已使用 `SCShareableContent` + `SCScreenshotManager`。
- `window.list` 仍用 `CGWindowListCopyWindowInfo`，随后 capture 又按 `SCShareableContent.windows` 查找窗口。

建议：

- 目标 macOS 15+，优先把 `window.list` 也改为 `SCShareableContent.excludingDesktopWindows(...)` 返回的 `SCWindow`。
- 输出字段保留 `id` / `title` / `appName`，内部来源与 capture 对齐。
- 如 `SCWindow` 缺少当前 UI 需要的字段，再局部补 `CGWindowList`，并在 `platform-bridge.md` 说明原因。

收益：

- 窗口 ID、可捕获性、权限错误来源一致。
- 减少 CoreGraphics 旧接口与 ScreenCaptureKit 之间的语义错配。

### 4. 替换命令行截图与 AppleScript 选区采集

相关文件：

- `apps/desktop/Sources/AppServices/SelectionCapture/RegionCaptureProvider.swift`
- `apps/desktop/Sources/AppServices/SelectionCapture/SelectionCaptureProvider.swift`

现状：

- 区域截图通过 `/usr/sbin/screencapture -i -x` 写临时 PNG。
- 文本选区通过 `osascript` 发送 Cmd-C，再等待 120ms 读剪贴板并恢复原文本。

建议：

- 区域截图优先评估 `ScreenCaptureKit` 的系统内容选择器 / capture picker 能否覆盖用户主动圈选流程；如果确实不能覆盖自由矩形区域，保留 `screencapture`，但在设计文档中明确“原生 API 缺口”。
- 文本选区优先走 Accessibility：前台 focused element 的 `kAXSelectedTextAttribute`，失败时再退回 Cmd-C 复制方案。
- Cmd-C fallback 必须明确只在用户触发的“捕获选区”入口执行，且恢复剪贴板要覆盖富文本 / 文件 URL 等非 string 类型，不能只恢复 `.string`。

收益：

- 更符合仓库 macOS 15+ 能力策略。
- 减少 shell 进程、固定 sleep、剪贴板破坏和 AppleScript 权限不确定性。

## P1：使用系统 SwiftUI 控件替代自绘 UI

### 5. 设置窗口优先回到 SwiftUI Settings scene

相关文件：

- `apps/desktop/HandAgentApp.swift`
- `apps/desktop/Sources/Coordinator/SettingsLifecycle.swift`
- `apps/desktop/Sources/AppServices/AppServicesProductionImpls.swift`
- `apps/desktop/Sources/Settings/SettingsView.swift`

现状：

- `HandAgentApp` 声明了空 `Settings { EmptyView() }`。
- 真正设置窗口由 `SettingsLifecycle` + `NSWindow` + `NSHostingController` 手动托管。
- 模块文档给出的理由是需要主动 `openOrFocus`。

建议：

- 因为最低 macOS 15，可以重新评估 `Settings` scene + `openSettings` / `SettingsLink` 是否已经满足主动打开与聚焦。
- 如果能满足，把 `SettingsView` 放回 `Settings` scene，用 scene 生命周期替代 `WindowCloseObservation`。
- 如果为了 accessory activation policy 必须保留手动窗口，也建议把原因写入 `settings.md` 的“保留手动窗口”小节，并补手工验收点。

收益：

- 减少自维护关闭观察、窗口唯一性、Command+, 行为。
- 让系统设置入口、Window 菜单与可访问性更接近 macOS 预期。

### 6. Settings 的 segmented control 用 Picker

相关文件：

- `apps/desktop/Sources/AppServices/AgentSettings/AgentSettingsView.swift`

现状：

- `providerSegmented` 和 `apiSegmented` 都是 `HStack + Button + RoundedRectangle` 自绘。

建议：

- 改为 `Picker(..., selection:) { ... }.pickerStyle(.segmented)`。
- 如果必须保持当前暗色视觉，可只在外层包 token 化背景，不重写交互语义。

收益：

- 键盘、VoiceOver、选中状态、点击区域都交给系统控件。
- 少维护两套几乎相同的 `providerButton` / `apiButton`。

### 7. Workspace 添加目录用 fileImporter

相关文件：

- `apps/desktop/Sources/Settings/WorkspaceSettingsView.swift`

现状：

- View 内直接创建并运行 `NSOpenPanel`。

建议：

- 改为 SwiftUI `.fileImporter(isPresented:allowedContentTypes:allowsMultipleSelection:)`，目录选择使用合适的 `UTType` 或保留小型 presenter 注入。
- 如果未来启用 App Sandbox，返回 URL 需要按 security-scoped resource 处理。

收益：

- View 不直接执行 AppKit panel 副作用。
- 更容易测试 showing state 与选择结果处理。

### 8. API Key 输入改用 SecureField

相关文件：

- `apps/desktop/Sources/AppServices/AgentSettings/AgentSettingsView.swift`

现状：

- API Key 使用 `TextField("sk-...", text:)` + `.privacySensitive()`。

建议：

- 改为 `SecureField("sk-...", text: $viewModel.apiKey)`。
- 保留 `.privacySensitive()` 作为系统级隐私标记。

收益：

- 输入控件语义正确，避免 key 明文常驻显示。

### 9. 状态气泡点击使用 Button，脉冲动画避免 onChange 状态机

相关文件：

- `apps/desktop/Sources/StatusBubble/StatusBubbleView.swift`

现状：

- 整个气泡通过 `.onTapGesture { viewModel.tap() }` 触发。
- 脉冲动画由 `@State glowPulse` 和 `.onChange(of: viewModel.isRunning)` 驱动。

建议：

- 外层改为 `Button(action:) { content }` + `.buttonStyle(.plain)`，保留 `.help` 与 accessibility label。
- 脉冲动画可评估 `PhaseAnimator` 或基于 `symbolEffect` 的系统动画；若继续使用 `@State`，要补 `.onAppear` 处理启动时已 running 的场景。

收益：

- 点击语义、键盘触发、可访问性都更标准。
- 避免 view 首次出现时状态已 running 但动画未启动。

## P2：降低 SwiftUI 更新扇出与重复布局

### 10. 行列表避免 `Array(enumerated())` 重复模式

相关文件：

- `apps/desktop/Sources/Settings/ToolSettingsView.swift`
- `apps/desktop/Sources/Settings/PermissionRulesView.swift`
- `apps/desktop/Sources/Settings/WorkspaceSettingsView.swift`
- `apps/desktop/Sources/Settings/ShortcutSettingsView.swift`

现状：

- 多处 `ForEach(Array(items.enumerated()), id: \.element.id)`，只为插入分割线。

建议：

- 抽一个 `SettingsListSection(items:)`，内部统一处理 row 与 divider。
- 或让 row 自带 top border，通过 `ForEach(items)` 保持最简单的 stable identity。

收益：

- 减少每次 body 计算时构造 enumerated array。
- 后续 Settings 行样式改动只改一处。

### 11. 把高频 row 从函数提成独立 View

相关文件：

- `apps/desktop/Sources/PromptPanel/PromptPanelView.swift`
- `apps/desktop/Sources/Settings/ToolSettingsView.swift`
- `apps/desktop/Sources/Settings/PermissionRulesView.swift`
- `apps/desktop/Sources/Settings/WorkspaceSettingsView.swift`

现状：

- `actionRow(_:)`、`toolRow(_:)`、`ruleRow(_:)`、`workspaceRow(_:)` 都是父 View 的函数。
- SwiftUI 参考建议：`ForEach` 内复杂 row 优先提成单独 `struct`，便于 diff 跳过未变 row。

建议：

- 为 Prompt action、tool、permission rule、workspace entry 分别提 row View。
- Row 只接收渲染所需的值和闭包，不直接拿整块 view model，降低观察依赖。

收益：

- 搜索输入、hover、编辑 sheet 状态变化时，未变化 row 的重算更少。
- Row 级测试与 preview 更容易补。

### 12. 字符串状态改为枚举状态

相关文件：

- `apps/desktop/Sources/SessionWindow/SessionTabViewModel.swift`
- `apps/desktop/Sources/SessionWindow/SessionViewModel.swift`
- `apps/desktop/Sources/Settings/SettingsView.swift`

现状：

- 会话状态用 `"idle"` / `"running"` / `"failed"` / `"interrupted"` 字符串。
- Settings tab 用 `"model"` / `"tools"` 等字符串。

建议：

- 引入 `SessionRunStatus: String, Codable, Equatable` 与 `SettingsTab: String, CaseIterable, Identifiable`。
- 协议边界仍可用 rawValue，UI 内部不再到处比字符串。

收益：

- 拼写错误变编译错误。
- Tab 列表、图标、标题可由 enum 集中提供。

## P3：小型现代化与一致性清理

### 13. 自定义 EnvironmentKey 改用 `@Entry`

相关文件：

- `apps/desktop/Sources/Theme/ThemeEnvironment.swift`

现状：

- 手写 `EnvironmentKey`。

建议：

- Xcode 16+ 可用 `@Entry` 简化为：

```swift
extension EnvironmentValues {
    @Entry var appTheme: AppTheme = .default
}
```

收益：

- 符合最新 SwiftUI API，删除样板代码。

### 14. 复用日期格式化器

相关文件：

- `apps/desktop/Sources/SessionWindow/SessionSocketClient.swift`
- `apps/desktop/Sources/SessionWindow/SessionTabViewModel.swift`
- `apps/desktop/Sources/SessionWindow/SessionViewModel.swift`
- `apps/desktop/Sources/AppServices/PlatformBridge/PlatformBridgeService.swift`
- `apps/desktop/Sources/Settings/PermissionRulesViewModel.swift`

现状：

- 多处 `ISO8601DateFormatter()` / `DateFormatter()` 在方法内临时创建。

建议：

- 对频繁路径使用 `static let` formatter，或封装 `AppDateFormatting`。
- 对只做 ISO 字符串输出的地方，可统一 `Date.ISO8601FormatStyle`。

收益：

- 小幅减少分配。
- 时间格式策略集中，便于以后统一时区与 fractional seconds。

### 15. 旧单会话 `SessionViewModel` 明确去留

相关文件：

- `apps/desktop/Sources/SessionWindow/SessionViewModel.swift`
- `apps/desktop/Sources/SessionWindow/SessionTabViewModel.swift`

现状：

- `session-window.md` 标注 `SessionViewModel` 是旧单会话兼容层。
- 它与 `SessionTabViewModel` 仍保留大量重复事件处理。

建议：

- 若测试仍依赖旧类型，先把事件 reducer 抽成纯函数或小服务，供两者共享。
- 若产品已完全切到多 tab，计划删除旧 ViewModel 与对应兼容测试。

收益：

- 避免修一个 session event bug 时漏改另一份。

## 建议落地顺序

1. 先做 DTO / WebSocket 通道收敛：这是可靠性收益最大、也最能减少重复代码的部分。
2. 再做平台能力原生化：`window.list` → ScreenCaptureKit，文本选区 → Accessibility 优先，区域截图明确是否可用系统 picker。
3. 然后做 Settings UI 系统控件替换：`SecureField`、`Picker(.segmented)`、`fileImporter`、`Button`。
4. 最后做 SwiftUI row 提取、状态 enum、`@Entry`、formatter 复用等低风险清理。

## 验收建议

- 每个重构 PR 至少跑 `bash ./scripts/swiftw test` 与 `bash ./scripts/swiftw build`。
- 改 PlatformBridge / capture / Accessibility 后，按 `docs/manual-qa.md` 与 `docs/live-qa-flow.md` 做实机 QA。
- 改 WebSocket 通道后，补断线重连、用户主动关闭、server 重启、stale socket 回调四类测试。
- 改 Settings scene / window lifecycle 后，必须验证 Cmd+,、PromptPanel 齿轮、dock/accessory activation、关闭设置窗口后的 app activation policy。

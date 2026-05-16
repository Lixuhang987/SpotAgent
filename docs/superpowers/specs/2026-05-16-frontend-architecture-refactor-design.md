# 前端架构重构：逻辑/样式分离 + Bug 修复

## 背景

当前 SwiftUI 前端存在以下问题：

1. **Bug：PromptPanel 不显示** — `hidesOnDeactivate = true` + `.nonactivatingPanel` 在 `.accessory` activation policy 下导致 panel 无法正确显示
2. **Bug：Settings 页面无法打开** — `Settings` scene body 中放了两个并列 View（`AgentSettingsView` + `makeSettingsView()`），SwiftUI Settings scene 不支持此用法
3. **架构问题** — View 混合布局/样式/逻辑；手动 NSWindowController 管理窗口；ObservableObject 效率低；AppDelegate callback 嵌套深

## 目标

一步到位重构为最优架构：
- SwiftUI 原生窗口管理（仅 PromptPanel 保留 NSPanel）
- @Observable 替代 ObservableObject
- ViewModel 分离逻辑，View 纯声明式
- 全局 Theme token + Environment 注入
- AppCoordinator 单向事件流替代 callback 嵌套
- 修复所有已知 bug

## 架构设计

### 目录结构

```
apps/desktop/
├── HandAgentApp.swift              ← @main，Scene 声明
├── Sources/
│   ├── Coordinator/
│   │   └── AppCoordinator.swift    ← 单向事件流，全局状态协调
│   ├── Theme/
│   │   ├── AppTheme.swift          ← Theme struct（颜色/字体/间距 token）
│   │   └── ThemeEnvironment.swift  ← EnvironmentKey + 默认主题
│   ├── PromptPanel/
│   │   ├── PromptPanelView.swift       ← 纯 UI 声明
│   │   ├── PromptPanelViewModel.swift  ← 状态 + 交互逻辑
│   │   ├── PromptPanelStyles.swift     ← ViewModifier
│   │   ├── PromptPanelWindow.swift     ← NSPanel 子类（保留）
│   │   ├── PromptPanelController.swift ← 窗口生命周期（精简）
│   │   └── PromptAction.swift          ← 数据模型（保留）
│   ├── Session/
│   │   ├── SessionWindowView.swift     ← 纯 UI 声明
│   │   ├── SessionViewModel.swift      ← 状态 + WebSocket 逻辑
│   │   ├── SessionStyles.swift         ← ViewModifier
│   │   └── SessionSocketClient.swift   ← 网络层（保留）
│   ├── StatusBubble/
│   │   ├── StatusBubbleView.swift      ← 纯 UI 声明
│   │   ├── StatusBubbleViewModel.swift ← 状态逻辑
│   │   ├── StatusBubbleStyles.swift    ← ViewModifier
│   │   └── StatusBubbleController.swift ← 窗口管理（保留，浮动窗口需要）
│   ├── Settings/
│   │   ├── SettingsView.swift          ← TabView 容器
│   │   ├── AgentSettingsView.swift     ← 模型设置 UI
│   │   ├── AgentSettingsViewModel.swift ← 设置逻辑
│   │   └── ShortcutSettingsView.swift  ← 快捷键设置 UI
│   └── AppServices/
│       ├── AgentServer/
│       │   └── AgentServerService.swift
│       ├── AgentSettings/
│       │   └── AgentSettingsStore.swift ← 持久化层（保留，ViewModel 包装它）
│       ├── Hotkey/
│       │   └── GlobalShortcutNames.swift
│       ├── Lifecycle/
│       │   └── AppActivationPolicyCoordinator.swift
│       └── Session/
│           └── SessionRegistry.swift
└── TestsSwift/
```

### 核心变更

#### 1. HandAgentApp — SwiftUI 原生窗口管理

```swift
@main
struct HandAgentApp: App {
    @State private var coordinator = AppCoordinator()
    @Environment(\.openWindow) private var openWindow

    var body: some Scene {
        // Session 窗口：SwiftUI 原生多窗口
        WindowGroup("Session", for: String.self) { $sessionID in
            if let sessionID {
                SessionWindowView(sessionID: sessionID)
                    .environment(coordinator)
            }
        }
        .defaultSize(width: 760, height: 560)

        // Settings 窗口：单窗口
        Window("设置", id: "settings") {
            SettingsView()
                .environment(coordinator)
        }
        .defaultSize(width: 580, height: 480)
        .commands {
            CommandGroup(replacing: .appSettings) {
                Button("设置…") {
                    coordinator.send(.openSettings)
                }
                .keyboardShortcut(",", modifiers: .command)
            }
        }
    }
}
```

Coordinator 通过设置 `pendingSessionOpen` / `pendingSettingsOpen` 属性来请求打开窗口，App 层通过 `onChange` 监听这些属性并调用 `openWindow`。这是 SwiftUI 中非 View 代码打开窗口的标准模式。

#### 2. AppCoordinator — 单向事件流

```swift
@Observable
@MainActor
final class AppCoordinator {
    enum Action {
        case showPromptPanel
        case hidePromptPanel
        case submitPrompt(String, attachments: [PromptAttachmentResult])
        case submitAction(PromptAction)
        case openSettings
        case sessionClosed(String)
        case statusBubbleTapped(String?)
    }

    // 公开状态
    private(set) var agentServerError: String?

    // 内部服务
    private let agentServerService = AgentServerService()
    private let sessionRegistry = SessionRegistry()
    private let settingsStore = AgentSettingsStore()
    private let activationPolicy = AppActivationPolicyCoordinator()
    private lazy var promptPanelController = PromptPanelController()
    private lazy var statusBubbleController = StatusBubbleController(registry: sessionRegistry)

    // 窗口管理 — View 层通过 onChange 监听此值来调用 openWindow
    var pendingSessionOpen: String?
    var pendingSettingsOpen = false
    @ObservationIgnored private var openSessionIDs: Set<String> = []

    init() {
        setupHotkey()
        setupPromptPanel()
        startAgentServer()
        statusBubbleController.show()
    }

    func send(_ action: Action) {
        switch action {
        case .showPromptPanel:
            promptPanelController.show()
        case .hidePromptPanel:
            promptPanelController.hide()
        case .submitPrompt(let draft, let attachments):
            handleSubmitPrompt(draft, attachments: attachments)
        case .submitAction(let action):
            action.perform()
            promptPanelController.hide()
        case .openSettings:
            openSettingsWindow()
        case .sessionClosed(let sessionID):
            handleSessionClosed(sessionID)
        case .statusBubbleTapped(let sessionID):
            handleStatusBubbleTap(sessionID)
        }
    }

    // ... 内部实现
}
```

#### 3. Theme 系统

```swift
// AppTheme.swift
struct AppTheme: Sendable {
    let colors: ThemeColors
    let typography: ThemeTypography
    let spacing: ThemeSpacing

    static let `default` = AppTheme(
        colors: .default,
        typography: .default,
        spacing: .default
    )
}

struct ThemeColors: Sendable {
    let background: Color
    let surface: Color
    let primary: Color
    let secondary: Color
    let accent: Color
    let error: Color
    let userBubble: Color
    let assistantBubble: Color
    let toolBubble: Color
    let border: Color
    let textPrimary: Color
    let textSecondary: Color

    static let `default` = ThemeColors(
        background: Color(nsColor: .windowBackgroundColor),
        surface: Color(nsColor: .controlBackgroundColor),
        primary: Color.primary,
        secondary: Color.secondary,
        accent: Color.accentColor,
        error: Color.red,
        userBubble: Color(nsColor: .selectedContentBackgroundColor),
        assistantBubble: Color(nsColor: .windowBackgroundColor),
        toolBubble: Color(nsColor: .controlBackgroundColor),
        border: Color.black.opacity(0.08),
        textPrimary: Color.primary,
        textSecondary: Color.secondary
    )
}

struct ThemeTypography: Sendable {
    let titleFont: Font
    let bodyFont: Font
    let captionFont: Font
    let promptInputFont: Font

    static let `default` = ThemeTypography(
        titleFont: .headline,
        bodyFont: .body,
        captionFont: .subheadline,
        promptInputFont: .system(size: 20, weight: .semibold)
    )
}

struct ThemeSpacing: Sendable {
    let xs: CGFloat   // 4
    let sm: CGFloat   // 8
    let md: CGFloat   // 12
    let lg: CGFloat   // 16
    let xl: CGFloat   // 20
    let xxl: CGFloat  // 24

    static let `default` = ThemeSpacing(
        xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24
    )
}

// ThemeEnvironment.swift
private struct AppThemeKey: EnvironmentKey {
    static let defaultValue = AppTheme.default
}

extension EnvironmentValues {
    var appTheme: AppTheme {
        get { self[AppThemeKey.self] }
        set { self[AppThemeKey.self] = newValue }
    }
}
```

#### 4. PromptPanel — ViewModel 分离

```swift
// PromptPanelViewModel.swift
@Observable
@MainActor
final class PromptPanelViewModel {
    var draft = ""
    var focusSeed = 0

    private let actions: [PromptAction]
    private weak var coordinator: AppCoordinator?

    var filteredActions: [PromptAction] {
        PromptAction.filter(actions, query: draft)
    }

    init(actions: [PromptAction], coordinator: AppCoordinator?) {
        self.actions = actions
        self.coordinator = coordinator
    }

    func submit() {
        let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        coordinator?.send(.submitPrompt(trimmed, attachments: []))
        draft = ""
    }

    func submitAction(_ action: PromptAction) {
        coordinator?.send(.submitAction(action))
        draft = ""
    }

    func openSettings() {
        coordinator?.send(.openSettings)
    }

    func shortcutLabel(for action: PromptAction) -> String? {
        KeyboardShortcuts.getShortcut(for: action.shortcutName)?.description
    }
}

// PromptPanelView.swift — 纯 UI
struct PromptPanelView: View {
    @Bindable var viewModel: PromptPanelViewModel
    @Environment(\.appTheme) private var theme
    @FocusState private var isQueryFocused: Bool

    var body: some View {
        VStack(spacing: theme.spacing.lg) {
            headerBar
            inputField
            Divider()
            actionList
        }
        .padding(theme.spacing.xl)
        .frame(minWidth: 640, minHeight: 420)
        .background(theme.colors.background)
        .onAppear { isQueryFocused = true }
        .onChange(of: viewModel.focusSeed) { _, _ in isQueryFocused = true }
    }

    private var headerBar: some View {
        HStack {
            Spacer()
            Button { viewModel.openSettings() } label: {
                Image(systemName: "gearshape")
            }
            .buttonStyle(.plain)
            .help("打开设置 (⌘,)")
        }
    }

    private var inputField: some View {
        TextField("输入你的请求", text: $viewModel.draft)
            .textFieldStyle(.plain)
            .font(theme.typography.promptInputFont)
            .focused($isQueryFocused)
            .onSubmit { viewModel.submit() }
    }

    private var actionList: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: theme.spacing.sm) {
                if viewModel.filteredActions.isEmpty {
                    Text("No actions")
                        .foregroundStyle(theme.colors.textSecondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, theme.spacing.sm)
                } else {
                    ForEach(viewModel.filteredActions) { action in
                        actionRow(action)
                    }
                }
            }
        }
    }

    private func actionRow(_ action: PromptAction) -> some View {
        Button { viewModel.submitAction(action) } label: {
            HStack(spacing: theme.spacing.md) {
                Text(action.title)
                    .foregroundStyle(theme.colors.textPrimary)
                Spacer()
                if let shortcut = viewModel.shortcutLabel(for: action) {
                    Text(shortcut)
                        .foregroundStyle(theme.colors.textSecondary)
                }
            }
            .padding(.vertical, theme.spacing.sm)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
```

#### 5. PromptPanelController — 精简为纯窗口管理

```swift
@MainActor
final class PromptPanelController {
    private var panel: PromptPanelWindow?
    private var eventMonitor: Any?
    private var viewModel: PromptPanelViewModel?

    func configure(viewModel: PromptPanelViewModel) {
        self.viewModel = viewModel
    }

    func show() {
        ensurePanel()
        guard let panel else { return }
        viewModel?.focusSeed += 1
        panel.center()
        panel.orderFrontRegardless()
        panel.makeKey()
        NSApp.activate(ignoringOtherApps: true)  // 修复 .accessory 下不显示的 bug
        installEventMonitor()
    }

    func hide() {
        panel?.orderOut(nil)
        removeEventMonitor()
    }

    private func ensurePanel() {
        guard panel == nil, let viewModel else { return }

        let panel = PromptPanelWindow(
            contentRect: NSRect(x: 0, y: 0, width: 640, height: 420),
            styleMask: [.nonactivatingPanel, .titled, .closable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        panel.isReleasedWhenClosed = false
        panel.isFloatingPanel = true
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.titleVisibility = .hidden
        panel.titlebarAppearsTransparent = true
        panel.isMovableByWindowBackground = true
        panel.standardWindowButton(.closeButton)?.isHidden = true
        panel.standardWindowButton(.miniaturizeButton)?.isHidden = true
        panel.standardWindowButton(.zoomButton)?.isHidden = true
        // 不设置 hidesOnDeactivate — 修复 .accessory policy 下的显示 bug
        panel.onDidResignKey = { [weak self] in
            self?.hide()
        }
        panel.contentView = NSHostingView(rootView: PromptPanelView(viewModel: viewModel))

        self.panel = panel
    }

    private func installEventMonitor() {
        guard eventMonitor == nil else { return }
        eventMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            self?.handleKeyEvent(event) ?? event
        }
    }

    private func removeEventMonitor() {
        if let eventMonitor {
            NSEvent.removeMonitor(eventMonitor)
            self.eventMonitor = nil
        }
    }

    private func handleKeyEvent(_ event: NSEvent) -> NSEvent? {
        if event.keyCode == UInt16(kVK_Escape) {
            hide()
            return nil
        }
        guard panel?.isKeyWindow == true,
              let viewModel,
              let eventShortcut = KeyboardShortcuts.Shortcut(event: event) else {
            return event
        }
        for action in viewModel.filteredActions {
            guard let shortcut = KeyboardShortcuts.getShortcut(for: action.shortcutName) else { continue }
            if shortcut == eventShortcut {
                viewModel.submitAction(action)
                return nil
            }
        }
        return event
    }
}
```

#### 6. SessionViewModel — 迁移到 @Observable

```swift
@Observable
@MainActor
final class SessionViewModel {
    var messages: [SessionBubble] = []
    var status: String = "idle"
    var error: String?

    let sessionID: String
    private let socketClient: SessionSocketClient
    private weak var coordinator: AppCoordinator?

    init(sessionID: String, socketClient: SessionSocketClient, coordinator: AppCoordinator?) {
        self.sessionID = sessionID
        self.socketClient = socketClient
        self.coordinator = coordinator
    }

    func start(initialPrompt: String, startupError: String? = nil) { /* 同现有逻辑 */ }
    func stop() { socketClient.disconnect() }
    func sendPrompt(_ text: String) { /* 同现有逻辑 */ }
    func handle(_ event: SessionEvent) { /* 同现有逻辑 */ }
}
```

#### 7. SessionWindowView — 纯 UI + Theme

```swift
struct SessionWindowView: View {
    let sessionID: String
    @Environment(AppCoordinator.self) private var coordinator
    @Environment(\.appTheme) private var theme
    @State private var viewModel: SessionViewModel?
    @State private var draft = ""

    var body: some View {
        Group {
            if let viewModel {
                sessionContent(viewModel)
            } else {
                ProgressView()
            }
        }
        .onAppear { setupViewModel() }
        .onDisappear { teardown() }
    }

    private func sessionContent(_ vm: SessionViewModel) -> some View {
        VStack(spacing: theme.spacing.lg) {
            statusHeader(vm)
            messageList(vm)
            if let error = vm.error {
                errorBanner(error)
            }
            inputField(vm)
        }
        .padding(theme.spacing.xl)
    }

    // ... 子视图拆分
}
```

#### 8. Settings — TabView 修复

```swift
// SettingsView.swift
struct SettingsView: View {
    @Environment(AppCoordinator.self) private var coordinator

    var body: some View {
        TabView {
            Tab("模型", systemImage: "cpu") {
                AgentSettingsView()
            }
            Tab("快捷键", systemImage: "keyboard") {
                ShortcutSettingsView()
            }
        }
    }
}
```

这直接修复了 Settings 页面无法打开的 bug——不再是两个并列 View，而是一个 TabView 容器。

#### 9. AgentSettingsViewModel

ViewModel 不复制状态字段，直接对 Store 做读写代理，避免双向同步问题：

```swift
@Observable
@MainActor
final class AgentSettingsViewModel {
    private let store: AgentSettingsStore

    init(store: AgentSettingsStore) {
        self.store = store
    }

    var model: String {
        get { store.settings.model }
        set { update { $0.model = newValue.trimmingCharacters(in: .whitespacesAndNewlines) } }
    }
    var apiKey: String {
        get { store.settings.apiKey }
        set { update { $0.apiKey = newValue.trimmingCharacters(in: .whitespacesAndNewlines) } }
    }
    var baseURL: String {
        get { store.settings.baseURL }
        set { update { $0.baseURL = newValue.trimmingCharacters(in: .whitespacesAndNewlines) } }
    }
    var api: AgentAPIType {
        get { store.settings.api }
        set { update { $0.api = newValue } }
    }

    var saveErrorMessage: String? { store.saveErrorMessage }

    private func update(_ mutate: (inout AgentSettings) -> Void) {
        store.update(mutate)
    }
}
```

注意：`AgentSettingsStore` 仍保持 `@Observable` 特性，让 `store.settings.model` 的读取自动追踪依赖。Store 本身需要从 `ObservableObject` 迁移到 `@Observable`。

#### 10. StatusBubbleViewModel

```swift
@Observable
@MainActor
final class StatusBubbleViewModel {
    private let registry: SessionRegistry
    private weak var coordinator: AppCoordinator?

    var isRunning: Bool {
        primarySummary?.isRunning ?? false
    }

    var latestSummary: String {
        primarySummary?.latestSummary ?? "点击开始"
    }

    init(registry: SessionRegistry, coordinator: AppCoordinator?) {
        self.registry = registry
        self.coordinator = coordinator
    }

    func tap() {
        coordinator?.send(.statusBubbleTapped(registry.primarySessionID))
    }

    private var primarySummary: SessionSummary? {
        registry.primarySessionID.flatMap { registry.summaries[$0] }
    }
}
```

### Bug 修复总结

| Bug | 根因 | 修复 |
|-----|------|------|
| PromptPanel 不显示 | `hidesOnDeactivate = true` 在 `.accessory` policy 下导致 panel 立即隐藏 | 移除 `hidesOnDeactivate`，`show()` 中加 `NSApp.activate(ignoringOtherApps: true)` |
| Settings 无法打开 | `Settings` scene body 中两个并列 View，SwiftUI 不支持 | 改为 `Window` scene + `TabView` 容器 |
| refreshContent 重建整个 NSHostingView | 每次 show() 都重建 contentView，状态丢失 | ViewModel 持有状态，View 通过 @Observable 自动更新，不再重建 |

### 迁移策略

由于不考虑兼容，直接全量替换：

1. 删除 `AppDelegate` 类
2. 删除 `SessionWindowController`（SwiftUI WindowGroup 替代）
3. 重写 `HandAgentApp` 为纯 Scene 声明
4. 所有 `ObservableObject` → `@Observable`
5. 所有 `@ObservedObject`/`@StateObject` → `@State`（owned）或 `@Environment`（injected）
6. `SessionRegistry` 迁移为 `@Observable`

### 文件变更清单

#### 删除

| 文件 | 原因 |
|------|------|
| `SessionWindow/SessionWindowController.swift` | SwiftUI WindowGroup 替代 |

#### 新增

| 文件 | 职责 |
|------|------|
| `Sources/Coordinator/AppCoordinator.swift` | 单向事件流 + 全局状态协调 |
| `Sources/Theme/AppTheme.swift` | Theme token 定义 |
| `Sources/Theme/ThemeEnvironment.swift` | Environment 注入 |
| `Sources/PromptPanel/PromptPanelViewModel.swift` | PromptPanel 逻辑 |
| `Sources/PromptPanel/PromptPanelStyles.swift` | PromptPanel 样式 |
| `Sources/Session/SessionStyles.swift` | Session 样式 |
| `Sources/StatusBubble/StatusBubbleViewModel.swift` | StatusBubble 逻辑 |
| `Sources/StatusBubble/StatusBubbleStyles.swift` | StatusBubble 样式 |
| `Sources/Settings/SettingsView.swift` | TabView 容器 |
| `Sources/Settings/AgentSettingsViewModel.swift` | 设置逻辑 |

#### 重写

| 文件 | 变更 |
|------|------|
| `HandAgentApp.swift` | 删除 AppDelegate，纯 Scene 声明 |
| `PromptPanel/PromptPanelView.swift` | 纯 UI，引用 ViewModel + Theme |
| `PromptPanel/PromptPanelController.swift` | 精简为纯窗口管理 |
| `Session/SessionWindowView.swift` | 纯 UI + Theme |
| `Session/SessionViewModel.swift` | ObservableObject → @Observable |
| `StatusBubble/StatusBubbleView.swift` | 纯 UI + Theme |
| `StatusBubble/StatusBubbleController.swift` | 注入 ViewModel |
| `Settings/AgentSettingsView.swift` | 纯 UI，逻辑移到 ViewModel |
| `Settings/ShortcutSettingsView.swift` | 引用 Theme spacing |
| `AppServices/Session/SessionRegistry.swift` | ObservableObject → @Observable |

### 测试验证

- Cmd+Shift+Space 唤起 PromptPanel（在 .accessory 和 .regular policy 下均可）
- PromptPanel 输入文本后回车，打开 Session 窗口
- Cmd+, 打开 Settings，TabView 两个 tab 均可切换
- Settings 修改模型名后自动保存到 `~/.spotAgent/settings.json`
- 关闭 Session 窗口后 activation policy 正确切换
- StatusBubble 点击唤起 PromptPanel 或聚焦 Session 窗口
- 多个 Session 窗口可同时打开

### 不在范围内

- 多套自定义配色方案切换（本次只搭 Theme 基础设施 + 默认主题）
- UI 视觉重设计（保持现有视觉效果，只做结构重构）
- 新功能添加

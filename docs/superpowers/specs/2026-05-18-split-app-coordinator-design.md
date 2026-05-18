# 10.4 拆 AppCoordinator — 设计文档

## 目标

将 `AppCoordinator`（当前 247 行）进一步拆分，使其：

1. 不再持有 `NSWindow` 引用、不再 `import AppKit`、不再直接构造窗口或 Alert。
2. 新增窗口类型（如 6.1 历史窗口）只需新增 lifecycle 控制器 + 1 条 Action 分支，不改 Coordinator 现有方法体。
3. 行数降至 ~140-160 行。

## 现状分析

上一轮重构（10.3）已抽出：

- `AgentServerHealth` — server 健康监控
- `SessionWindowPresenting` / `SettingsWindowPresenting` — 窗口构造协议
- `FatalAlertPresenting` — Alert 弹窗协议
- `PromptCaptureCoordinator` — 选区/区域采集
- `PromptSubmission` — attachment 翻译
- `AppActivationPolicyCoordinator` — 激活策略计算

**残留问题**：

- Coordinator 仍持有 `sessionWindows: [String: NSWindow]` 和 `settingsWindow: NSWindow?`。
- `handleSubmitPrompt` 38 行，混合了 ViewModel 创建、Registry 写入、窗口展示、激活策略更新、ViewModel 启动。
- `handleSessionClosed` / `openOrFocusSettingsWindow` / `handleSettingsWindowClosed` 直接操作 NSWindow 引用。
- 新增窗口类型必须在 Coordinator 加字段 + handler。

## 方案：按特性拆 Lifecycle 控制器

### 新增单元

| 文件 | 职责 |
|------|------|
| `SessionLifecycle.swift` | 持有 `[String: SessionViewModel]` 与 `[String: NSWindow]`；提供 `open / close / focus / closeAll`；内部调 `SessionWindowPresenting`、`SessionRegistry`、激活策略。 |
| `SettingsLifecycle.swift` | 持有 `settingsWindow: NSWindow?`；提供 `openOrFocus / handleClosed / close`；内部调 `SettingsWindowPresenting`、激活策略。 |

### 不变单元

- `AppServices.swift` — 协议与 DI 容器不动。
- `AppServicesProductionImpls.swift` — 生产 presenter 实现不动。
- `AgentServerHealth.swift` — 不动。
- `AppActivationPolicyCoordinator.swift` — 不动。
- `PromptCaptureCoordinator.swift` — 不动。
- `PromptSubmission.swift` — 不动。

### 不在范围

- 不重构 `SessionViewModel` / `SessionSocketClient`。
- 不动 SwiftUI 视图层。
- 不改 `PromptPanelController` / `StatusBubbleController`。

## 接口设计

### SessionLifecycle

`@Observable` 必须保留，因为 Coordinator 的 `sessionViewModels` 改为计算属性 `{ sessionLifecycle.viewModels }` 后，SwiftUI 的 Observation 追踪需要 `viewModels` 是 `@Observable` 类的存储属性才能传递变更。

```swift
@Observable
@MainActor
final class SessionLifecycle {
    /// Coordinator 通过此属性暴露给外部（如 SwiftUI Scene）。存储属性，不是计算属性。
    private(set) var viewModels: [String: SessionViewModel] = [:]

    init(
        registry: SessionRegistry,
        windowPresenter: any SessionWindowPresenting,
        agentServerURL: URL,
        activationPolicy: AppActivationPolicyCoordinator,
        setActivationPolicy: @escaping @MainActor (NSApplication.ActivationPolicy) -> Void
    )

    /// 创建会话、开窗、启动 ViewModel。返回 sessionID。
    /// onSessionClosed 回调在窗口关闭时触发，供 Coordinator 路由后续 Action。
    @discardableResult
    func open(
        prompt: PromptSubmission,
        startupError: String?,
        onSessionClosed: @escaping @MainActor (String) -> Void
    ) -> String

    /// 关闭指定会话：停止 ViewModel、关窗、更新 Registry 与激活策略。
    func close(_ sessionID: String)

    /// 聚焦已有会话窗口。返回 false 表示该 sessionID 无窗口。
    func focus(_ sessionID: String) -> Bool

    /// shutdown 时批量关闭。
    func closeAll()
}
```

### SettingsLifecycle

```swift
@MainActor
final class SettingsLifecycle {
    init(
        windowPresenter: any SettingsWindowPresenting,
        activationPolicy: AppActivationPolicyCoordinator,
        setActivationPolicy: @escaping @MainActor (NSApplication.ActivationPolicy) -> Void
    )

    /// 打开或聚焦设置窗口。
    func openOrFocus(
        settingsViewModel: AgentSettingsViewModel,
        workspaceViewModel: WorkspaceSettingsViewModel,
        shortcutActions: [PromptAction],
        onClosed: @escaping @MainActor () -> Void
    )

    /// 窗口关闭后的清理（置空引用 + 激活策略）。
    func handleClosed()

    /// shutdown 时强制关闭。
    func close()
}
```

## 数据流变化

### submitPrompt（之前 38 行 → Coordinator 侧 4 行）

**Coordinator**:
```swift
private func handleSubmitPrompt(_ draft: String, attachments: [PromptAttachmentResult]) {
    guard let prompt = PromptSubmission.compose(draft: draft, attachments: attachments) else { return }
    promptPanelController.hide()
    sessionLifecycle.open(prompt: prompt, startupError: agentServerError) { [weak self] id in
        self?.send(.sessionClosed(id))
    }
}
```

**SessionLifecycle.open 内部**:
1. 生成 `sessionID = UUID().uuidString`
2. 创建 `SessionSocketClient(serverURL: agentServerURL)`
3. 创建 `SessionViewModel(sessionID:socketClient:)`
4. 存入 `viewModels[sessionID]`
5. `registry.upsert(SessionSummary(...))`
6. 调 `windowPresenter.present(sessionID:viewModel:onClose:)` → 存入内部 `windows[sessionID]`
7. `setActivationPolicy(activationPolicy.policyAfterUpdatingOpenSessionWindows(by: 1))`
8. `viewModel.start(initialPrompt:attachments:startupError:)`

### sessionClosed（之前 18 行 → Coordinator 侧 1 行）

**Coordinator**:
```swift
case .sessionClosed(let id):
    sessionLifecycle.close(id)
```

**SessionLifecycle.close 内部**（保持与现有 `handleSessionClosed` 完全等价的语义）:
1. `let viewModel = viewModels.removeValue(forKey: id)`
2. `viewModel?.stop()`
3. **仅在** `windows.removeValue(forKey: id) != nil` 时调 `setActivationPolicy(activationPolicy.policyAfterUpdatingOpenSessionWindows(by: -1))`
4. `registry.upsert(SessionSummary(sessionId: id, isRunning: viewModel?.status == "running", latestSummary: viewModel?.messages.last?.text ?? "", lastActiveAt: .now, windowIsOpen: false))`

### statusBubbleTapped

**Coordinator**:
```swift
case .statusBubbleTapped(let id):
    if let id, sessionLifecycle.focus(id) { return }
    promptPanelController.show()
```

### openSettings / settingsWindowClosed

**Coordinator**:
```swift
case .openSettings:
    settingsLifecycle.openOrFocus(
        settingsViewModel: makeSettingsViewModel(),
        workspaceViewModel: WorkspaceSettingsViewModel(),
        shortcutActions: makeShortcutActions(),
        onClosed: { [weak self] in self?.send(.settingsWindowClosed) }
    )
case .settingsWindowClosed:
    settingsLifecycle.handleClosed()
```

## Coordinator 最终骨架

```swift
import Foundation
import SwiftUI  // 仅为 @Observable

@Observable
@MainActor
final class AppCoordinator {
    enum Action {
        case showPromptPanel, hidePromptPanel, togglePromptPanel
        case submitPrompt(String, attachments: [PromptAttachmentResult])
        case submitAction(PromptAction)
        case openSettings, settingsWindowClosed
        case sessionClosed(String)
        case statusBubbleTapped(String?)
    }

    var sessionViewModels: [String: SessionViewModel] { sessionLifecycle.viewModels }
    var agentServerError: String? { agentServerHealth.errorMessage }

    @ObservationIgnored private let services: AppServices
    @ObservationIgnored private let agentServerHealth: AgentServerHealth
    @ObservationIgnored private let sessionLifecycle: SessionLifecycle
    @ObservationIgnored private let settingsLifecycle: SettingsLifecycle
    @ObservationIgnored private let activationPolicy = AppActivationPolicyCoordinator()
    @ObservationIgnored private var platformBridgeService: (any PlatformBridgeRunning)?
    @ObservationIgnored private lazy var promptPanelController = PromptPanelController()
    @ObservationIgnored private lazy var statusBubbleController: StatusBubbleController = {
        StatusBubbleController(registry: services.sessionRegistry)
    }()
    @ObservationIgnored private lazy var captureCoordinator = PromptCaptureCoordinator(
        controller: promptPanelController,
        selectionProvider: MacSelectionCaptureProvider(),
        regionProvider: MacRegionCaptureProvider()
    )
    @ObservationIgnored private lazy var promptActions: [PromptAction] = [
        PromptAction(
            id: "open-settings",
            title: "打开设置",
            keywords: ["settings", "preferences", "shortcut", "hotkey"],
            defaultShortcut: .init(.comma, modifiers: [.command]),
            perform: { [weak self] in self?.send(.openSettings) }
        )
    ]

    convenience init() { self.init(services: AppServices()) }

    init(services: AppServices) {
        self.services = services
        self.agentServerHealth = AgentServerHealth(
            agentServer: services.agentServer,
            fatalAlertPresenter: services.fatalAlertPresenter,
            showsFatalAlert: services.showsStatusBubble
        )
        self.sessionLifecycle = SessionLifecycle(
            registry: services.sessionRegistry,
            windowPresenter: services.sessionWindowPresenter,
            agentServerURL: services.agentServerURL,
            activationPolicy: activationPolicy,
            setActivationPolicy: services.setActivationPolicy
        )
        self.settingsLifecycle = SettingsLifecycle(
            windowPresenter: services.settingsWindowPresenter,
            activationPolicy: activationPolicy,
            setActivationPolicy: services.setActivationPolicy
        )
        bootstrap()
    }

    func bootstrap() {
        // 激活策略初始化已下沉到 SessionLifecycle.init（"0 个会话窗口"语义）。
        setupPromptPanel()
        setupHotkey()
        setupStatusBubble()
        agentServerHealth.start()
        startPlatformBridge()
        if services.showsStatusBubble { statusBubbleController.show() }
    }

    func shutdown() {
        platformBridgeService?.stop()
        platformBridgeService = nil
        agentServerHealth.stop()
        settingsLifecycle.close()
        sessionLifecycle.closeAll()
    }

    func send(_ action: Action) {
        switch action {
        case .showPromptPanel:       promptPanelController.show()
        case .hidePromptPanel:       promptPanelController.hide()
        case .togglePromptPanel:     promptPanelController.toggle()
        case .submitPrompt(let d, let a): handleSubmitPrompt(d, attachments: a)
        case .submitAction(let a):   a.perform(); promptPanelController.hide()
        case .openSettings:          handleOpenSettings()
        case .settingsWindowClosed:  settingsLifecycle.handleClosed()
        case .sessionClosed(let id): sessionLifecycle.close(id)
        case .statusBubbleTapped(let id): handleStatusBubbleTap(id)
        }
    }

    func makeSettingsViewModel() -> AgentSettingsViewModel {
        AgentSettingsViewModel(store: services.settingsStore)
    }
    func makeShortcutActions() -> [PromptAction] { promptActions }

    // MARK: - Private

    private func setupPromptPanel() { /* 同现有 */ }
    private func setupHotkey() { /* 同现有 */ }
    private func setupStatusBubble() { /* 同现有 */ }
    private func startPlatformBridge() { /* 同现有 */ }

    private func handleSubmitPrompt(_ draft: String, attachments: [PromptAttachmentResult]) {
        guard let prompt = PromptSubmission.compose(draft: draft, attachments: attachments) else { return }
        promptPanelController.hide()
        sessionLifecycle.open(prompt: prompt, startupError: agentServerError) { [weak self] id in
            self?.send(.sessionClosed(id))
        }
    }

    private func handleOpenSettings() {
        settingsLifecycle.openOrFocus(
            settingsViewModel: makeSettingsViewModel(),
            workspaceViewModel: WorkspaceSettingsViewModel(),
            shortcutActions: makeShortcutActions(),
            onClosed: { [weak self] in self?.send(.settingsWindowClosed) }
        )
    }

    private func handleStatusBubbleTap(_ sessionID: String?) {
        if let sessionID, sessionLifecycle.focus(sessionID) { return }
        promptPanelController.show()
    }
}
```

预估行数：~145 行（含空行与 MARK）。

## 激活策略 Ownership

`AppActivationPolicyCoordinator` 实例由 Coordinator 创建并注入两个 lifecycle 控制器。两个 lifecycle 各自调用 `policyAfterUpdatingOpenSessionWindows(by:)` / `policyAfterUpdatingSettingsWindow(isOpen:)` 并通过注入的 `setActivationPolicy` 闭包写入 `NSApp`。

**初始策略设置**：当前 `bootstrap()` 里的 `setActivationPolicy(activationPolicy.policyAfterUpdatingOpenSessionWindows(by: 0))` 移入 `SessionLifecycle.init`，因为它本质是"0 个会话窗口时的策略"。这样 Coordinator 完全不接触 `NSApplication.ActivationPolicy` 类型，可以移除 `import AppKit`。

这意味着 `AppActivationPolicyCoordinator` 是共享可变状态。当前只有两个写入者且调用都在 `@MainActor`，竞态不存在。如果未来 lifecycle 控制器超过 3 个，可考虑抽 `ActivationPolicyDriver` 统一收口，但当前不做。

## 测试策略

### 现有测试迁移

- `AppCoordinatorTests` 中验证 `send(.sessionClosed(...))` 后激活策略变化的断言 → 迁移到 `SessionLifecycleTests`。
- `AppCoordinatorTests` 中验证 `send(.openSettings)` / `send(.settingsWindowClosed)` 的断言 → 迁移到 `SettingsLifecycleTests`。
- `AppCoordinatorTests` 中验证路由正确性（send → 子模块被调用）保留。

### 新增测试

**SessionLifecycleTests**:
- `open` → viewModels 包含新 sessionID、presenter 被调用、registry 被 upsert、激活策略 +1。
- `close` → viewModel.stop() 被调用、windows 移除、激活策略 -1、registry 更新 windowIsOpen=false。
- `close` 不存在的 id → 不崩溃。
- `focus` 存在的 id → 返回 true。
- `focus` 不存在的 id → 返回 false。
- `closeAll` → 所有 viewModel 停止、windows 清空。

**SettingsLifecycleTests**:
- `openOrFocus` 首次 → presenter 被调用、激活策略 isOpen=true。
- `openOrFocus` 第二次 → presenter 不再被调用（聚焦已有窗口）。
- `handleClosed` → 窗口引用置空、激活策略 isOpen=false。
- `close` → 窗口关闭。

### 测试替身

复用现有 `NopSessionWindowPresenter` / `NopSettingsWindowPresenter`。新增计数 spy 版本用于断言调用次数：

```swift
@MainActor
final class SpySessionWindowPresenter: SessionWindowPresenting {
    var presentCallCount = 0
    func present(sessionID: String, viewModel: SessionViewModel, onClose: @escaping () -> Void) -> NSWindow? {
        presentCallCount += 1
        return nil  // 测试中不需要真窗口
    }
}
```

## 文件变更清单

| 操作 | 文件 |
|------|------|
| 新增 | `Sources/Coordinator/SessionLifecycle.swift` |
| 新增 | `Sources/Coordinator/SettingsLifecycle.swift` |
| 修改 | `Sources/Coordinator/AppCoordinator.swift`（247 → ~145 行） |
| 修改 | `Sources/Coordinator/coordinator.md`（更新文件表与约束） |
| 新增 | `TestsSwift/SessionLifecycleTests.swift` |
| 新增 | `TestsSwift/SettingsLifecycleTests.swift` |
| 修改 | `TestsSwift/AppCoordinatorTests.swift`（迁移部分断言） |

## 验收标准

- [ ] `AppCoordinator.swift` 不含 `import AppKit`。
- [ ] `AppCoordinator.swift` 不含 `NSWindow` / `NSHostingController` / `NSAlert` 类型引用。
- [ ] `AppCoordinator.swift` 行数 < 200。
- [ ] 新增窗口类型只需：新增 lifecycle 文件 + Action 枚举分支 + send 路由 1 行，不改 Coordinator 现有方法体。
- [ ] `bash ./scripts/swiftw build` 通过。
- [ ] `bash ./scripts/swiftw test` 通过。
- [ ] `bash ./scripts/test.sh` 通过（TypeScript 侧无回归）。

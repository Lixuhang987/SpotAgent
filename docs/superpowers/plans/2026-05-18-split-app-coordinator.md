# 10.4 拆 AppCoordinator 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `AppCoordinator`（247 行）按特性拆成 `SessionLifecycle` + `SettingsLifecycle` 两个独立单元，让 Coordinator 不再持有 NSWindow / 不再 import AppKit / 行数 < 200。

**Architecture:** 新增两个 `@MainActor` 类各自闭环窗口生命周期 + Registry/激活策略写入。Coordinator 只剩 Action 路由 + 服务注入 + lazy 子模块持有，新增窗口类型只需新增 lifecycle + 加 1 条 Action 分支。

**Tech Stack:** Swift 6 / SwiftUI / `@Observable` / XCTest，参考 [docs/superpowers/specs/2026-05-18-split-app-coordinator-design.md](../specs/2026-05-18-split-app-coordinator-design.md)。

---

## 前置：Worktree 与基线

按本仓库 [CLAUDE.md](../../../CLAUDE.md) "Development Workflow" 一节，代码改动必须在 `.worktrees/<task-name>/` 下进行。

- [ ] **创建 worktree**

```bash
cd /Users/mu9/proj/handAgent
git worktree add .worktrees/split-app-coordinator -b refactor/split-app-coordinator
cd .worktrees/split-app-coordinator
```

- [ ] **初始化依赖**

```bash
pnpm install
```

预期：依赖装好，无 error。

- [ ] **跑基线验证（确认 worktree 可用）**

```bash
bash ./scripts/test.sh
bash ./scripts/swiftw build
bash ./scripts/swiftw test
```

预期：三条命令全部通过。如果 `swiftw test` 因 `AppCoordinatorTests` 之前的设计就稳定通过，则基线 OK。

---

## Task 1: 抽 SessionLifecycle 骨架（先建文件 + 空接口）

**Files:**
- Create: `apps/desktop/Sources/Coordinator/SessionLifecycle.swift`

- [ ] **Step 1: 建空文件**

写入 `apps/desktop/Sources/Coordinator/SessionLifecycle.swift`：

```swift
import AppKit
import Foundation

@Observable
@MainActor
final class SessionLifecycle {
    private(set) var viewModels: [String: SessionViewModel] = [:]

    @ObservationIgnored private let registry: SessionRegistry
    @ObservationIgnored private let windowPresenter: any SessionWindowPresenting
    @ObservationIgnored private let agentServerURL: URL
    @ObservationIgnored private let activationPolicy: AppActivationPolicyCoordinator
    @ObservationIgnored private let setActivationPolicy: @MainActor (NSApplication.ActivationPolicy) -> Void
    @ObservationIgnored private var windows: [String: NSWindow] = [:]

    init(
        registry: SessionRegistry,
        windowPresenter: any SessionWindowPresenting,
        agentServerURL: URL,
        activationPolicy: AppActivationPolicyCoordinator,
        setActivationPolicy: @escaping @MainActor (NSApplication.ActivationPolicy) -> Void
    ) {
        self.registry = registry
        self.windowPresenter = windowPresenter
        self.agentServerURL = agentServerURL
        self.activationPolicy = activationPolicy
        self.setActivationPolicy = setActivationPolicy
        // "0 个会话窗口"语义：把现有 bootstrap 里的初始策略调用下沉到这里。
        setActivationPolicy(activationPolicy.policyAfterUpdatingOpenSessionWindows(by: 0))
    }
}
```

- [ ] **Step 2: 编译通过**

```bash
bash ./scripts/swiftw build
```

预期：`Build complete!`，无 warning/error。`SessionLifecycle` 暂未被引用，但能编译。

- [ ] **Step 3: 提交**

```bash
git add apps/desktop/Sources/Coordinator/SessionLifecycle.swift
git commit -m "refactor(coordinator): 引入 SessionLifecycle 骨架"
```

---

## Task 2: SessionLifecycle.open + 测试

**Files:**
- Modify: `apps/desktop/Sources/Coordinator/SessionLifecycle.swift`
- Create: `apps/desktop/TestsSwift/SessionLifecycleTests.swift`

- [ ] **Step 1: 写失败测试 — open 应建 ViewModel + upsert + 调 presenter + 推策略**

写入 `apps/desktop/TestsSwift/SessionLifecycleTests.swift`：

```swift
import AppKit
import XCTest
@testable import HandAgentDesktop

@MainActor
final class SpySessionWindowPresenter: SessionWindowPresenting {
    var presentCallCount = 0
    var lastSessionID: String?
    var lastOnClose: (() -> Void)?

    func present(
        sessionID: String,
        viewModel: SessionViewModel,
        onClose: @escaping () -> Void
    ) -> NSWindow? {
        presentCallCount += 1
        lastSessionID = sessionID
        lastOnClose = onClose
        return NSWindow()
    }
}

final class SessionLifecycleTests: XCTestCase {
    @MainActor
    func testOpenCreatesViewModelAndPresentsWindowAndUpdatesPolicy() {
        let registry = SessionRegistry()
        let presenter = SpySessionWindowPresenter()
        var policies: [NSApplication.ActivationPolicy] = []
        let lifecycle = SessionLifecycle(
            registry: registry,
            windowPresenter: presenter,
            agentServerURL: URL(string: "ws://127.0.0.1:0/noop")!,
            activationPolicy: AppActivationPolicyCoordinator(),
            setActivationPolicy: { policies.append($0) }
        )

        let prompt = PromptSubmission.compose(draft: "hello", attachments: [])!
        var closedID: String?
        let id = lifecycle.open(prompt: prompt, startupError: nil) { closedID = $0 }

        XCTAssertEqual(lifecycle.viewModels.count, 1)
        XCTAssertNotNil(lifecycle.viewModels[id])
        XCTAssertEqual(presenter.presentCallCount, 1)
        XCTAssertEqual(presenter.lastSessionID, id)
        XCTAssertNotNil(registry.summaries[id])
        XCTAssertTrue(registry.summaries[id]?.windowIsOpen == true)
        // init 时一次（0 个），open 后一次（1 个）= 2 次推送
        XCTAssertEqual(policies.count, 2)
        XCTAssertEqual(policies.last, .regular)
        XCTAssertNil(closedID)  // onSessionClosed 还没被触发
    }
}
```

- [ ] **Step 2: 验证测试失败**

```bash
bash ./scripts/swiftw test --filter SessionLifecycleTests
```

预期：编译失败，`SessionLifecycle` 没有 `open(prompt:startupError:onSessionClosed:)` 方法。

- [ ] **Step 3: 实现 open**

在 `SessionLifecycle.swift` 内的类体里追加：

```swift
    @discardableResult
    func open(
        prompt: PromptSubmission,
        startupError: String?,
        onSessionClosed: @escaping @MainActor (String) -> Void
    ) -> String {
        let sessionID = UUID().uuidString
        let viewModel = SessionViewModel(
            sessionID: sessionID,
            socketClient: SessionSocketClient(serverURL: agentServerURL)
        )

        viewModels[sessionID] = viewModel
        registry.upsert(
            SessionSummary(
                sessionId: sessionID,
                isRunning: true,
                latestSummary: prompt.summary,
                lastActiveAt: .now,
                windowIsOpen: true
            )
        )

        if let window = windowPresenter.present(
            sessionID: sessionID,
            viewModel: viewModel,
            onClose: {
                Task { @MainActor in onSessionClosed(sessionID) }
            }
        ) {
            windows[sessionID] = window
            setActivationPolicy(activationPolicy.policyAfterUpdatingOpenSessionWindows(by: 1))
        }

        viewModel.start(
            initialPrompt: prompt.composed,
            attachments: prompt.socketAttachments,
            startupError: startupError
        )

        return sessionID
    }
```

- [ ] **Step 4: 验证测试通过**

```bash
bash ./scripts/swiftw test --filter SessionLifecycleTests
```

预期：`SessionLifecycleTests.testOpenCreatesViewModelAndPresentsWindowAndUpdatesPolicy` 通过。

- [ ] **Step 5: 提交**

```bash
git add apps/desktop/Sources/Coordinator/SessionLifecycle.swift apps/desktop/TestsSwift/SessionLifecycleTests.swift
git commit -m "refactor(coordinator): SessionLifecycle.open 闭环建会话+开窗+激活策略"
```

---

## Task 3: SessionLifecycle.close + 测试

**Files:**
- Modify: `apps/desktop/Sources/Coordinator/SessionLifecycle.swift`
- Modify: `apps/desktop/TestsSwift/SessionLifecycleTests.swift`

- [ ] **Step 1: 写失败测试 — close 移除 ViewModel + 推 -1 策略 + 更新 registry**

在 `SessionLifecycleTests` 里追加：

```swift
    @MainActor
    func testCloseRemovesViewModelAndUpdatesPolicyAndRegistry() {
        let registry = SessionRegistry()
        let presenter = SpySessionWindowPresenter()
        var policies: [NSApplication.ActivationPolicy] = []
        let lifecycle = SessionLifecycle(
            registry: registry,
            windowPresenter: presenter,
            agentServerURL: URL(string: "ws://127.0.0.1:0/noop")!,
            activationPolicy: AppActivationPolicyCoordinator(),
            setActivationPolicy: { policies.append($0) }
        )

        let prompt = PromptSubmission.compose(draft: "hello", attachments: [])!
        let id = lifecycle.open(prompt: prompt, startupError: nil) { _ in }
        policies.removeAll()  // 只关心 close 之后的策略变化

        lifecycle.close(id)

        XCTAssertTrue(lifecycle.viewModels.isEmpty)
        XCTAssertEqual(policies.last, .accessory)
        XCTAssertEqual(registry.summaries[id]?.windowIsOpen, false)
    }

    @MainActor
    func testCloseUnknownSessionIDIsNoop() {
        let lifecycle = SessionLifecycle(
            registry: SessionRegistry(),
            windowPresenter: SpySessionWindowPresenter(),
            agentServerURL: URL(string: "ws://127.0.0.1:0/noop")!,
            activationPolicy: AppActivationPolicyCoordinator(),
            setActivationPolicy: { _ in }
        )

        lifecycle.close("unknown")  // 不应崩溃
    }
```

- [ ] **Step 2: 验证测试失败**

```bash
bash ./scripts/swiftw test --filter SessionLifecycleTests
```

预期：编译失败，`SessionLifecycle.close(_:)` 不存在。

- [ ] **Step 3: 实现 close**

在 `SessionLifecycle.swift` 类体里追加：

```swift
    func close(_ sessionID: String) {
        let viewModel = viewModels.removeValue(forKey: sessionID)
        viewModel?.stop()

        if windows.removeValue(forKey: sessionID) != nil {
            setActivationPolicy(activationPolicy.policyAfterUpdatingOpenSessionWindows(by: -1))
        }

        registry.upsert(
            SessionSummary(
                sessionId: sessionID,
                isRunning: viewModel?.status == "running",
                latestSummary: viewModel?.messages.last?.text ?? "",
                lastActiveAt: .now,
                windowIsOpen: false
            )
        )
    }
```

- [ ] **Step 4: 验证测试通过**

```bash
bash ./scripts/swiftw test --filter SessionLifecycleTests
```

预期：3 个测试全部通过。

- [ ] **Step 5: 提交**

```bash
git add apps/desktop/Sources/Coordinator/SessionLifecycle.swift apps/desktop/TestsSwift/SessionLifecycleTests.swift
git commit -m "refactor(coordinator): SessionLifecycle.close 闭环回收+激活策略"
```

---

## Task 4: SessionLifecycle.focus + closeAll + 测试

**Files:**
- Modify: `apps/desktop/Sources/Coordinator/SessionLifecycle.swift`
- Modify: `apps/desktop/TestsSwift/SessionLifecycleTests.swift`

- [ ] **Step 1: 写失败测试**

追加到 `SessionLifecycleTests`：

```swift
    @MainActor
    func testFocusReturnsTrueForKnownSession() {
        let lifecycle = SessionLifecycle(
            registry: SessionRegistry(),
            windowPresenter: SpySessionWindowPresenter(),
            agentServerURL: URL(string: "ws://127.0.0.1:0/noop")!,
            activationPolicy: AppActivationPolicyCoordinator(),
            setActivationPolicy: { _ in }
        )
        let prompt = PromptSubmission.compose(draft: "hi", attachments: [])!
        let id = lifecycle.open(prompt: prompt, startupError: nil) { _ in }

        XCTAssertTrue(lifecycle.focus(id))
    }

    @MainActor
    func testFocusReturnsFalseForUnknownSession() {
        let lifecycle = SessionLifecycle(
            registry: SessionRegistry(),
            windowPresenter: SpySessionWindowPresenter(),
            agentServerURL: URL(string: "ws://127.0.0.1:0/noop")!,
            activationPolicy: AppActivationPolicyCoordinator(),
            setActivationPolicy: { _ in }
        )

        XCTAssertFalse(lifecycle.focus("unknown"))
    }

    @MainActor
    func testCloseAllStopsEverySessionAndClearsWindows() {
        let registry = SessionRegistry()
        let lifecycle = SessionLifecycle(
            registry: registry,
            windowPresenter: SpySessionWindowPresenter(),
            agentServerURL: URL(string: "ws://127.0.0.1:0/noop")!,
            activationPolicy: AppActivationPolicyCoordinator(),
            setActivationPolicy: { _ in }
        )
        let prompt = PromptSubmission.compose(draft: "hi", attachments: [])!
        _ = lifecycle.open(prompt: prompt, startupError: nil) { _ in }
        _ = lifecycle.open(prompt: prompt, startupError: nil) { _ in }
        XCTAssertEqual(lifecycle.viewModels.count, 2)

        lifecycle.closeAll()

        XCTAssertTrue(lifecycle.viewModels.isEmpty)
    }
```

- [ ] **Step 2: 验证测试失败**

```bash
bash ./scripts/swiftw test --filter SessionLifecycleTests
```

预期：编译失败，`focus(_:)` / `closeAll()` 不存在。

- [ ] **Step 3: 实现 focus / closeAll**

在 `SessionLifecycle.swift` 类体里追加：

```swift
    @discardableResult
    func focus(_ sessionID: String) -> Bool {
        guard let window = windows[sessionID] else { return false }
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        return true
    }

    func closeAll() {
        viewModels.values.forEach { $0.stop() }
        viewModels.removeAll()
        windows.values.forEach { $0.close() }
        windows.removeAll()
    }
```

- [ ] **Step 4: 验证测试通过**

```bash
bash ./scripts/swiftw test --filter SessionLifecycleTests
```

预期：6 个测试全部通过。

- [ ] **Step 5: 提交**

```bash
git add apps/desktop/Sources/Coordinator/SessionLifecycle.swift apps/desktop/TestsSwift/SessionLifecycleTests.swift
git commit -m "refactor(coordinator): SessionLifecycle.focus / closeAll"
```

---

## Task 5: 抽 SettingsLifecycle + 测试

**Files:**
- Create: `apps/desktop/Sources/Coordinator/SettingsLifecycle.swift`
- Create: `apps/desktop/TestsSwift/SettingsLifecycleTests.swift`

- [ ] **Step 1: 写失败测试**

写入 `apps/desktop/TestsSwift/SettingsLifecycleTests.swift`：

```swift
import AppKit
import XCTest
@testable import HandAgentDesktop

final class SettingsLifecycleTests: XCTestCase {
    @MainActor
    func testOpenOrFocusFirstTimePresentsAndPromotesPolicy() {
        var presentCount = 0
        let presenter = StubSettingsWindowPresenter { presentCount += 1 }
        var policies: [NSApplication.ActivationPolicy] = []
        let lifecycle = SettingsLifecycle(
            windowPresenter: presenter,
            activationPolicy: AppActivationPolicyCoordinator(),
            setActivationPolicy: { policies.append($0) }
        )

        lifecycle.openOrFocus(
            settingsViewModel: AgentSettingsViewModel(store: AgentSettingsStore()),
            workspaceViewModel: WorkspaceSettingsViewModel(),
            shortcutActions: [],
            onClosed: {}
        )

        XCTAssertEqual(presentCount, 1)
        XCTAssertEqual(policies.last, .regular)
    }

    @MainActor
    func testOpenOrFocusSecondTimeDoesNotRepresent() {
        var presentCount = 0
        let presenter = StubSettingsWindowPresenter { presentCount += 1 }
        let lifecycle = SettingsLifecycle(
            windowPresenter: presenter,
            activationPolicy: AppActivationPolicyCoordinator(),
            setActivationPolicy: { _ in }
        )

        lifecycle.openOrFocus(
            settingsViewModel: AgentSettingsViewModel(store: AgentSettingsStore()),
            workspaceViewModel: WorkspaceSettingsViewModel(),
            shortcutActions: [],
            onClosed: {}
        )
        lifecycle.openOrFocus(
            settingsViewModel: AgentSettingsViewModel(store: AgentSettingsStore()),
            workspaceViewModel: WorkspaceSettingsViewModel(),
            shortcutActions: [],
            onClosed: {}
        )

        XCTAssertEqual(presentCount, 1)
    }

    @MainActor
    func testHandleClosedDemotesPolicy() {
        var policies: [NSApplication.ActivationPolicy] = []
        let lifecycle = SettingsLifecycle(
            windowPresenter: StubSettingsWindowPresenter(),
            activationPolicy: AppActivationPolicyCoordinator(),
            setActivationPolicy: { policies.append($0) }
        )

        lifecycle.openOrFocus(
            settingsViewModel: AgentSettingsViewModel(store: AgentSettingsStore()),
            workspaceViewModel: WorkspaceSettingsViewModel(),
            shortcutActions: [],
            onClosed: {}
        )
        lifecycle.handleClosed()

        XCTAssertEqual(policies.suffix(2), [.regular, .accessory])
    }
}
```

- [ ] **Step 2: 验证测试失败**

```bash
bash ./scripts/swiftw test --filter SettingsLifecycleTests
```

预期：编译失败，`SettingsLifecycle` 不存在。

- [ ] **Step 3: 实现 SettingsLifecycle**

写入 `apps/desktop/Sources/Coordinator/SettingsLifecycle.swift`：

```swift
import AppKit
import Foundation

@MainActor
final class SettingsLifecycle {
    private let windowPresenter: any SettingsWindowPresenting
    private let activationPolicy: AppActivationPolicyCoordinator
    private let setActivationPolicy: @MainActor (NSApplication.ActivationPolicy) -> Void
    private var window: NSWindow?

    init(
        windowPresenter: any SettingsWindowPresenting,
        activationPolicy: AppActivationPolicyCoordinator,
        setActivationPolicy: @escaping @MainActor (NSApplication.ActivationPolicy) -> Void
    ) {
        self.windowPresenter = windowPresenter
        self.activationPolicy = activationPolicy
        self.setActivationPolicy = setActivationPolicy
    }

    func openOrFocus(
        settingsViewModel: AgentSettingsViewModel,
        workspaceViewModel: WorkspaceSettingsViewModel,
        shortcutActions: [PromptAction],
        onClosed: @escaping @MainActor () -> Void
    ) {
        setActivationPolicy(activationPolicy.policyAfterUpdatingSettingsWindow(isOpen: true))

        if let window {
            window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }

        window = windowPresenter.present(
            settingsViewModel: settingsViewModel,
            workspaceViewModel: workspaceViewModel,
            shortcutActions: shortcutActions,
            onClose: { Task { @MainActor in onClosed() } }
        )
    }

    func handleClosed() {
        window = nil
        setActivationPolicy(activationPolicy.policyAfterUpdatingSettingsWindow(isOpen: false))
    }

    func close() {
        window?.close()
        window = nil
    }
}
```

- [ ] **Step 4: 验证测试通过**

```bash
bash ./scripts/swiftw test --filter SettingsLifecycleTests
```

预期：3 个测试全部通过。

- [ ] **Step 5: 提交**

```bash
git add apps/desktop/Sources/Coordinator/SettingsLifecycle.swift apps/desktop/TestsSwift/SettingsLifecycleTests.swift
git commit -m "refactor(coordinator): 抽 SettingsLifecycle"
```

---

## Task 6: 接入 AppCoordinator + 删除老字段

这是最关键的一步：让 Coordinator 改用两个 lifecycle，删除 `sessionWindows / settingsWindow / handleSessionClosed / openOrFocusSettingsWindow / handleSettingsWindowClosed / handleStatusBubbleTap` 里的窗口逻辑，并移除 `import AppKit`。

**Files:**
- Modify: `apps/desktop/Sources/Coordinator/AppCoordinator.swift`

- [ ] **Step 1: 整体替换 AppCoordinator.swift**

整文件替换为：

```swift
import Foundation
import SwiftUI

@Observable
@MainActor
final class AppCoordinator {
    enum Action {
        case showPromptPanel
        case hidePromptPanel
        case togglePromptPanel
        case submitPrompt(String, attachments: [PromptAttachmentResult])
        case submitAction(PromptAction)
        case openSettings
        case settingsWindowClosed
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
        case .showPromptPanel:
            promptPanelController.show()
        case .hidePromptPanel:
            promptPanelController.hide()
        case .togglePromptPanel:
            promptPanelController.toggle()
        case .submitPrompt(let draft, let attachments):
            handleSubmitPrompt(draft, attachments: attachments)
        case .submitAction(let action):
            action.perform()
            promptPanelController.hide()
        case .openSettings:
            handleOpenSettings()
        case .settingsWindowClosed:
            settingsLifecycle.handleClosed()
        case .sessionClosed(let sessionID):
            sessionLifecycle.close(sessionID)
        case .statusBubbleTapped(let sessionID):
            handleStatusBubbleTap(sessionID)
        }
    }

    func makeSettingsViewModel() -> AgentSettingsViewModel {
        AgentSettingsViewModel(store: services.settingsStore)
    }

    func makeShortcutActions() -> [PromptAction] { promptActions }

    private func setupPromptPanel() {
        promptPanelController.register(actions: promptActions)
        promptPanelController.setSelectionProvider(MacSelectionCaptureProvider())
        promptPanelController.onSubmit = { [weak self] draft, attachments in
            self?.send(.submitPrompt(draft, attachments: attachments))
        }
        promptPanelController.onOpenSettings = { [weak self] in
            self?.send(.openSettings)
        }
    }

    private func setupHotkey() {
        services.hotkeyRegistrar.registerShowPromptPanel { [weak self] in
            Task { @MainActor in self?.send(.togglePromptPanel) }
        }
        services.hotkeyRegistrar.registerCaptureSelection { [weak self] in
            Task { @MainActor in await self?.captureCoordinator.captureSelectionAndShow() }
        }
        services.hotkeyRegistrar.registerCaptureRegion { [weak self] in
            Task { @MainActor in await self?.captureCoordinator.captureRegionAndShow() }
        }
    }

    private func setupStatusBubble() {
        statusBubbleController.onTap = { [weak self] sessionID in
            self?.send(.statusBubbleTapped(sessionID))
        }
    }

    private func startPlatformBridge() {
        guard let bridge = services.platformBridgeFactory(services.agentServerURL) else { return }
        platformBridgeService = bridge
        bridge.start()
    }

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

- [ ] **Step 2: 编译**

```bash
bash ./scripts/swiftw build
```

预期：`Build complete!`，无 error。如果有 error，最常见的原因是某处仍引用 `coordinator.sessionWindows` 或 `coordinator.settingsWindow`，按报错位置改用 `sessionLifecycle.focus(...)` 或删除引用。

- [ ] **Step 3: 跑全部测试**

```bash
bash ./scripts/swiftw test
```

预期：现有 `AppCoordinatorTests` 全部 6 个用例继续通过（因为 `sessionViewModels` 计算属性透传 + 路由语义保持不变）。

- [ ] **Step 4: 验收检查**

```bash
grep -nE 'import AppKit|NSWindow|NSHostingController|NSAlert' apps/desktop/Sources/Coordinator/AppCoordinator.swift
wc -l apps/desktop/Sources/Coordinator/AppCoordinator.swift
```

预期：
- `grep` **无任何输出**（Coordinator 完全脱离 AppKit 类型）。
- `wc -l` 输出 **小于 200**（按 spec 估算 ~145）。

如不达标，回到 Step 1 找残留的 `import AppKit` / `NSWindow` 引用。

- [ ] **Step 5: 提交**

```bash
git add apps/desktop/Sources/Coordinator/AppCoordinator.swift
git commit -m "refactor(coordinator): AppCoordinator 接入 SessionLifecycle / SettingsLifecycle"
```

---

## Task 7: 更新 coordinator.md 文档

**Files:**
- Modify: `apps/desktop/Sources/Coordinator/coordinator.md`

- [ ] **Step 1: 替换文件表与约束**

把 `apps/desktop/Sources/Coordinator/coordinator.md` 更新为反映新结构。具体替换：

把现有 "## 文件" 表格替换为：

```markdown
## 文件

| 文件 | 职责 |
|------|------|
| `AppCoordinator.swift` | 单向事件流、Action 路由；不持有 `NSWindow`、不 `import AppKit` |
| `SessionLifecycle.swift` | 持有 `[String: SessionViewModel]` 与会话窗口；提供 `open / close / focus / closeAll` |
| `SettingsLifecycle.swift` | 持有设置窗口；提供 `openOrFocus / handleClosed / close` |
| `PromptSubmission.swift` | 把 PromptPanel attachment 翻译为 `composed prompt + summary + UserMessageAttachmentPayload[]` 的纯函数 |
| `PromptCaptureCoordinator.swift` | 把热键 → 选区 / 区域采集 → PromptPanel attachment 的串联从 Coordinator 抽出 |
```

把 "## 事件流约束" 中的"窗口 / Alert 构造交给 presenter"那一条扩展为：

```markdown
- **窗口生命周期由 lifecycle 控制器闭环**：`SessionLifecycle` 和 `SettingsLifecycle` 各自持有窗口引用与 `SessionRegistry` / `AppActivationPolicyCoordinator` 写入；Coordinator 不再 `import AppKit`，不再持有 `NSWindow` / `NSHostingController` / `NSAlert`。新增窗口类型 = 新增一个 lifecycle 控制器 + 1 条 Action 分支，不改 Coordinator 既有方法体。
```

- [ ] **Step 2: 提交**

```bash
git add apps/desktop/Sources/Coordinator/coordinator.md
git commit -m "docs(coordinator): 同步 SessionLifecycle / SettingsLifecycle 拆分"
```

---

## Task 8: 全量验证 + 回主仓库

- [ ] **Step 1: 跑全套验证**

```bash
bash ./scripts/test.sh
bash ./scripts/swiftw build
bash ./scripts/swiftw test
```

预期：全部通过，无 warning（除 import 优化 / unused 之类的，按需清理）。

- [ ] **Step 2: 最终验收**

```bash
grep -nE 'import AppKit|NSWindow|NSHostingController|NSAlert' apps/desktop/Sources/Coordinator/AppCoordinator.swift && echo "FAIL" || echo "OK"
wc -l apps/desktop/Sources/Coordinator/AppCoordinator.swift
```

预期：
- 第一行输出 `OK`。
- `wc -l` 显示 < 200。

- [ ] **Step 3: 回主仓库**

```bash
cd /Users/mu9/proj/handAgent
git fetch ./.worktrees/split-app-coordinator refactor/split-app-coordinator
```

后续合并/PR 走仓库既有流程（finishing-a-development-branch skill 或人工 merge）。Worktree 不要立即删除，保留供 review。

---

## Self-Review 备忘

执行计划前的检查（plan 作者已完成）：

1. **Spec 覆盖**：spec 的"接口设计 / 数据流变化 / Coordinator 最终骨架 / 测试策略 / 验收标准"全部映射到 Task 1-8。验收清单 6 条都在 Task 6 Step 4 与 Task 8 Step 2 验证。
2. **Placeholder**：无 TBD / TODO / "类似 Task N"。每个 Step 都贴了完整代码。
3. **类型一致**：`SessionLifecycle` 在 Task 1 定义、Task 2-4 增方法、Task 6 调用，签名一致；`SettingsLifecycle` 在 Task 5 定义、Task 6 调用，签名一致。
4. **测试可运行性**：`SessionLifecycle.open` 内部会建真 `SessionSocketClient`，但所有测试都用 `URL(string: "ws://127.0.0.1:0/noop")!`，与 `AppCoordinatorTests.testSubmitPromptCreatesSessionViewModel` 同款，不会真连接。`viewModel.start` 会调 `socketClient.connect`，但 `serverURL` 是 noop URL + `socketTask` 仅在 URL 非 nil 时创建——这里 URL 非 nil 但端口 0，与现有测试相同（如有意外失败再降级为可注入 socket factory）。

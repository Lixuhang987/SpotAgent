# KeyboardShortcuts 重构实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 KeyboardShortcuts 库替换全部自定义快捷键基础设施，修复全局热键无法唤起 PromptPanel 的 bug。

**Architecture:** 全局热键通过 `KeyboardShortcuts.onKeyUp(for: .showPromptPanel)` 注册，action 快捷键通过 `KeyboardShortcuts.getShortcut(for:)` 在本地事件监听中匹配。所有快捷键存储由库统一管理（UserDefaults）。

**Tech Stack:** Swift 6, SwiftUI, KeyboardShortcuts (SPM), macOS 15+

---

## File Structure

| File | Responsibility |
|------|---------------|
| `Package.swift` | 添加 KeyboardShortcuts 依赖 |
| `apps/desktop/Sources/AppServices/Hotkey/GlobalShortcutNames.swift` | 定义 `KeyboardShortcuts.Name` 扩展 |
| `apps/desktop/Sources/AppServices/AppServices.swift` | 简化为不含快捷键服务 |
| `apps/desktop/HandAgentApp.swift` | 注册全局热键监听，简化接线 |
| `apps/desktop/Sources/PromptPanel/PromptAction.swift` | 模型改用 `KeyboardShortcuts.Shortcut` |
| `apps/desktop/Sources/PromptPanel/PromptPanelController.swift` | 匹配逻辑改用库 API |
| `apps/desktop/Sources/PromptPanel/PromptPanelView.swift` | shortcutLabelProvider 适配 |
| `apps/desktop/Sources/Settings/ShortcutSettingsView.swift` | 改用 `KeyboardShortcuts.Recorder` |
| `apps/desktop/TestsSwift/PromptActionTests.swift` | 适配新类型 |
| `apps/desktop/Sources/AppServices/Hotkey/hotkey.md` | 更新文档 |

**删除的文件：**
- `apps/desktop/Sources/AppServices/Hotkey/HotkeyService.swift`
- `apps/desktop/Sources/AppServices/Hotkey/KeyShortcut.swift`
- `apps/desktop/Sources/AppServices/Hotkey/ShortcutSettingsStore.swift`
- `apps/desktop/Sources/Settings/ShortcutRecorderView.swift`
- `apps/desktop/TestsSwift/KeyShortcutTests.swift`
- `apps/desktop/TestsSwift/ShortcutSettingsStoreTests.swift`

---

### Task 1: 添加 KeyboardShortcuts SPM 依赖

**Files:**
- Modify: `Package.swift`

- [ ] **Step 1: 添加依赖到 Package.swift**

```swift
// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "HandAgent",
    platforms: [
        .macOS(.v15)
    ],
    products: [
        .executable(name: "HandAgentDesktop", targets: ["HandAgentDesktop"])
    ],
    dependencies: [
        .package(url: "https://github.com/sindresorhus/KeyboardShortcuts", from: "2.0.0")
    ],
    targets: [
        .executableTarget(
            name: "HandAgentDesktop",
            dependencies: [
                .product(name: "KeyboardShortcuts", package: "KeyboardShortcuts")
            ],
            path: "apps/desktop",
            exclude: ["TestsSwift", "desktop.md"]
        ),
        .testTarget(
            name: "HandAgentDesktopTests",
            dependencies: ["HandAgentDesktop"],
            path: "apps/desktop/TestsSwift"
        )
    ]
)
```

- [ ] **Step 2: Resolve 依赖**

Run: `cd /Users/mu9/proj/handAgent && swift package resolve`
Expected: 成功下载 KeyboardShortcuts 包

- [ ] **Step 3: 验证构建**

Run: `bash ./scripts/swiftw build`
Expected: Build complete（此时还没改代码，只是确认依赖能解析）

- [ ] **Step 4: Commit**

```bash
git add Package.swift Package.resolved
git commit -m "feat: add KeyboardShortcuts SPM dependency"
```

---

### Task 2: 创建 GlobalShortcutNames 并删除旧文件

**Files:**
- Create: `apps/desktop/Sources/AppServices/Hotkey/GlobalShortcutNames.swift`
- Delete: `apps/desktop/Sources/AppServices/Hotkey/HotkeyService.swift`
- Delete: `apps/desktop/Sources/AppServices/Hotkey/KeyShortcut.swift`
- Delete: `apps/desktop/Sources/AppServices/Hotkey/ShortcutSettingsStore.swift`
- Delete: `apps/desktop/Sources/Settings/ShortcutRecorderView.swift`
- Delete: `apps/desktop/TestsSwift/KeyShortcutTests.swift`
- Delete: `apps/desktop/TestsSwift/ShortcutSettingsStoreTests.swift`

- [ ] **Step 1: 创建 GlobalShortcutNames.swift**

```swift
import KeyboardShortcuts

extension KeyboardShortcuts.Name {
    static let showPromptPanel = Self(
        "showPromptPanel",
        default: .init(.space, modifiers: [.command, .shift])
    )
}
```

- [ ] **Step 2: 删除旧快捷键文件**

```bash
rm apps/desktop/Sources/AppServices/Hotkey/HotkeyService.swift
rm apps/desktop/Sources/AppServices/Hotkey/KeyShortcut.swift
rm apps/desktop/Sources/AppServices/Hotkey/ShortcutSettingsStore.swift
rm apps/desktop/Sources/Settings/ShortcutRecorderView.swift
rm apps/desktop/TestsSwift/KeyShortcutTests.swift
rm apps/desktop/TestsSwift/ShortcutSettingsStoreTests.swift
```

- [ ] **Step 3: Commit（此时构建会失败，后续 task 修复）**

```bash
git add -A
git commit -m "refactor: replace custom hotkey infrastructure with KeyboardShortcuts library

Remove HotkeyService, KeyShortcut, ShortcutSettingsStore, ShortcutRecorderView
and their tests. Add GlobalShortcutNames as the new entry point."
```

---

### Task 3: 重写 PromptAction 模型

**Files:**
- Modify: `apps/desktop/Sources/PromptPanel/PromptAction.swift`
- Modify: `apps/desktop/TestsSwift/PromptActionTests.swift`

- [ ] **Step 1: 重写 PromptAction.swift**

```swift
import Foundation
import KeyboardShortcuts

enum PromptAttachmentResult: Equatable {
    case noAttachment
    case textToken(String)
}

struct PromptAction: Identifiable {
    let id: String
    let title: String
    let keywords: [String]
    let defaultShortcut: KeyboardShortcuts.Shortcut?
    let perform: () -> Void

    var shortcutName: KeyboardShortcuts.Name {
        KeyboardShortcuts.Name("action.\(id)")
    }

    static func filter(_ actions: [PromptAction], query: String) -> [PromptAction] {
        let trimmedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedQuery.isEmpty else { return actions }

        let normalizedQuery = trimmedQuery.lowercased()

        return actions.filter { action in
            action.title.lowercased().contains(normalizedQuery)
                || action.keywords.contains(where: { $0.lowercased().contains(normalizedQuery) })
        }
    }
}
```

- [ ] **Step 2: 更新 PromptActionTests.swift**

```swift
import XCTest
import KeyboardShortcuts
@testable import HandAgentDesktop

final class PromptActionTests: XCTestCase {
    func testFiltersActionsByKeyword() {
        let actions = [
            PromptAction(
                id: "open",
                title: "Open File",
                keywords: ["file", "document"],
                defaultShortcut: .init(.o, modifiers: [.command]),
                perform: {}
            ),
            PromptAction(
                id: "new",
                title: "New Session",
                keywords: ["workspace"],
                defaultShortcut: .init(.n, modifiers: [.command]),
                perform: {}
            )
        ]

        let filtered = PromptAction.filter(actions, query: "file")

        XCTAssertEqual(filtered.map(\.id), ["open"])
    }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/Sources/PromptPanel/PromptAction.swift apps/desktop/TestsSwift/PromptActionTests.swift
git commit -m "refactor: update PromptAction to use KeyboardShortcuts.Shortcut"
```

---

### Task 4: 重写 AppServices.swift

**Files:**
- Modify: `apps/desktop/Sources/AppServices/AppServices.swift`

- [ ] **Step 1: 简化 AppServices**

```swift
import Foundation

@MainActor
final class AppServices {
    let agentServerService: AgentServerService
    let sessionRegistry: SessionRegistry

    init(
        agentServerService: AgentServerService = AgentServerService(),
        sessionRegistry: SessionRegistry = SessionRegistry()
    ) {
        self.agentServerService = agentServerService
        self.sessionRegistry = sessionRegistry
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/Sources/AppServices/AppServices.swift
git commit -m "refactor: remove hotkeyService and shortcutSettingsStore from AppServices"
```

---

### Task 5: 重写 PromptPanelController

**Files:**
- Modify: `apps/desktop/Sources/PromptPanel/PromptPanelController.swift`

- [ ] **Step 1: 重写 PromptPanelController.swift**

```swift
import AppKit
import Carbon.HIToolbox
import KeyboardShortcuts
import SwiftUI

@MainActor
final class PromptPanelController {
    var onSubmit: ((String, [PromptAttachmentResult]) -> Void)?
    var onOpenSettings: (() -> Void)?

    private var actions: [PromptAction] = []
    private var focusSeed = 0
    private var panel: PromptPanelWindow?
    private var eventMonitor: Any?

    func register(actions: [PromptAction]) {
        self.actions = actions
        for action in actions {
            if let defaultShortcut = action.defaultShortcut {
                let name = action.shortcutName
                if KeyboardShortcuts.getShortcut(for: name) == nil {
                    KeyboardShortcuts.setShortcut(defaultShortcut, for: name)
                }
            }
        }
        refreshContent()
    }

    func show() {
        ensurePanel()
        focusSeed += 1
        refreshContent()

        guard let panel else { return }

        panel.center()
        panel.orderFrontRegardless()
        panel.makeKey()
        installEventMonitor()
    }

    func hide() {
        panel?.orderOut(nil)
        removeEventMonitor()
    }

    func submit(draft: String, attachments: [PromptAttachmentResult]) {
        let trimmedDraft = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedDraft.isEmpty else { return }

        onSubmit?(trimmedDraft, attachments)
        hide()
    }

    private func ensurePanel() {
        guard panel == nil else { return }

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
        panel.hidesOnDeactivate = true
        panel.onDidResignKey = { [weak self] in
            self?.hide()
        }
        panel.contentView = makeContentView()
        panel.orderOut(nil)

        self.panel = panel
    }

    private func refreshContent() {
        guard let panel else { return }
        panel.contentView = makeContentView()
    }

    private func makeContentView() -> NSView {
        NSHostingView(
            rootView: PromptPanelView(
                actions: actions,
                shortcutLabelProvider: { action in
                    KeyboardShortcuts.getShortcut(for: action.shortcutName)?
                        .description
                },
                focusSeed: focusSeed,
                onOpenSettings: { [weak self] in
                    self?.openSettings()
                },
                onSubmitDraft: { [weak self] draft in
                    self?.submit(draft: draft, attachments: [])
                },
                onSubmitAction: { [weak self] action in
                    action.perform()
                    self?.hide()
                }
            )
        )
    }

    private func installEventMonitor() {
        guard eventMonitor == nil else { return }
        eventMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard let self else { return event }
            return self.handle(event: event)
        }
    }

    private func removeEventMonitor() {
        if let eventMonitor {
            NSEvent.removeMonitor(eventMonitor)
            self.eventMonitor = nil
        }
    }

    private func handle(event: NSEvent) -> NSEvent? {
        if event.keyCode == UInt16(kVK_Escape) {
            hide()
            return nil
        }

        guard panel?.isKeyWindow == true else { return event }

        guard let eventShortcut = KeyboardShortcuts.Shortcut(event: event) else { return event }

        for action in actions {
            guard let shortcut = KeyboardShortcuts.getShortcut(for: action.shortcutName) else { continue }
            if shortcut == eventShortcut {
                action.perform()
                hide()
                return nil
            }
        }

        return event
    }

    private func openSettings() {
        onOpenSettings?()
        hide()
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/Sources/PromptPanel/PromptPanelController.swift
git commit -m "refactor: rewrite PromptPanelController to use KeyboardShortcuts for action matching"
```

---

### Task 6: 重写 ShortcutSettingsView

**Files:**
- Modify: `apps/desktop/Sources/Settings/ShortcutSettingsView.swift`

- [ ] **Step 1: 重写 ShortcutSettingsView.swift**

```swift
import KeyboardShortcuts
import SwiftUI

struct ShortcutSettingsView: View {
    let actions: [PromptAction]

    var body: some View {
        Form {
            Section("全局快捷键") {
                KeyboardShortcuts.Recorder("唤起 PromptPanel", name: .showPromptPanel)
            }

            Section("PromptAction 快捷键") {
                if actions.isEmpty {
                    Text("当前没有可配置的 PromptAction。")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(actions) { action in
                        KeyboardShortcuts.Recorder(action.title, name: action.shortcutName)
                    }
                }
            }
        }
        .formStyle(.grouped)
        .padding(20)
        .frame(width: 560, height: 320)
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/Sources/Settings/ShortcutSettingsView.swift
git commit -m "refactor: rewrite ShortcutSettingsView with KeyboardShortcuts.Recorder"
```

---

### Task 7: 重写 HandAgentApp.swift

**Files:**
- Modify: `apps/desktop/HandAgentApp.swift`

- [ ] **Step 1: 重写 HandAgentApp.swift**

```swift
import AppKit
import Carbon.HIToolbox
import KeyboardShortcuts
import SwiftUI

@main
struct HandAgentApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var settingsStore = AgentSettingsStore()

    var body: some Scene {
        Settings {
            AgentSettingsView(store: settingsStore)
            appDelegate.makeSettingsView()
        }
        .commands {
            CommandGroup(replacing: .appSettings) {
                Button("设置…") {
                    appDelegate.openSettingsWindow()
                }
                .keyboardShortcut(",", modifiers: .command)
            }
        }
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private let services = AppServices()
    private let agentServerURL = URL(string: "ws://127.0.0.1:4317/api/session")!
    private lazy var promptPanelController = PromptPanelController()
    private let activationPolicyCoordinator = AppActivationPolicyCoordinator()
    private lazy var statusBubbleController = StatusBubbleController(registry: services.sessionRegistry)
    private var sessionWindows: [String: SessionWindowController] = [:]
    private var agentServerStartupError: String?
    private lazy var promptActions: [PromptAction] = [
        PromptAction(
            id: "open-settings",
            title: "打开设置",
            keywords: ["settings", "preferences", "shortcut", "hotkey"],
            defaultShortcut: .init(.comma, modifiers: [.command]),
            perform: { [weak self] in
                self?.openSettingsWindow()
            }
        )
    ]

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(
            activationPolicyCoordinator.policyAfterUpdatingOpenSessionWindows(by: 0)
        )

        promptPanelController.register(actions: promptActions)
        promptPanelController.onSubmit = { [weak self] draft, attachments in
            self?.openSessionWindow(for: draft, attachments: attachments)
        }
        promptPanelController.onOpenSettings = { [weak self] in
            self?.openSettingsWindow()
        }

        KeyboardShortcuts.onKeyUp(for: .showPromptPanel) { [weak promptPanelController] in
            promptPanelController?.show()
        }

        statusBubbleController.onTap = { [weak self] sessionID in
            self?.handleStatusBubbleTap(sessionID: sessionID)
        }

        do {
            try services.agentServerService.start()
            agentServerStartupError = nil
        } catch {
            agentServerStartupError =
                services.agentServerService.lastStartupError
                ?? error.localizedDescription
        }
        statusBubbleController.show()
    }

    func makeSettingsView() -> some View {
        ShortcutSettingsView(actions: promptActions)
    }

    func openSettingsWindow() {
        NSApp.sendAction(Selector(("showSettingsWindow:")), to: nil, from: nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationWillTerminate(_ notification: Notification) {
        services.agentServerService.stop()
        sessionWindows.values.forEach { $0.close() }
        sessionWindows.removeAll()
    }

    private func openSessionWindow(for draft: String, attachments: [PromptAttachmentResult]) {
        let trimmedDraft = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedDraft.isEmpty else { return }

        let attachmentText = attachments.compactMap { attachment -> String? in
            switch attachment {
            case .noAttachment:
                return nil
            case .textToken(let token):
                return token
            }
        }

        let composedPrompt = ([trimmedDraft] + attachmentText).joined(separator: "\n\n")
        let sessionID = UUID().uuidString
        let viewModel = SessionViewModel(
            sessionID: sessionID,
            socketClient: SessionSocketClient(serverURL: agentServerURL)
        )
        let windowController = SessionWindowController(viewModel: viewModel)
        NSApp.setActivationPolicy(
            activationPolicyCoordinator.policyAfterUpdatingOpenSessionWindows(by: 1)
        )

        windowController.onClose = { [weak self, weak viewModel] in
            guard let self else { return }

            self.sessionWindows[sessionID] = nil
            NSApp.setActivationPolicy(
                self.activationPolicyCoordinator.policyAfterUpdatingOpenSessionWindows(by: -1)
            )
            self.services.sessionRegistry.upsert(
                SessionSummary(
                    sessionId: sessionID,
                    isRunning: viewModel?.status == "running",
                    latestSummary: viewModel?.messages.last?.text ?? trimmedDraft,
                    lastActiveAt: .now,
                    windowIsOpen: false
                )
            )
        }

        sessionWindows[sessionID] = windowController
        services.sessionRegistry.upsert(
            SessionSummary(
                sessionId: sessionID,
                isRunning: true,
                latestSummary: composedPrompt,
                lastActiveAt: .now,
                windowIsOpen: true
            )
        )

        windowController.showWindow(nil)
        viewModel.start(
            initialPrompt: composedPrompt,
            startupError: agentServerStartupError
        )
    }

    private func handleStatusBubbleTap(sessionID: String?) {
        if let sessionID {
            focusSessionWindow(with: sessionID)
            return
        }

        promptPanelController.show()
    }

    private func focusSessionWindow(with sessionID: String) {
        if let windowController = sessionWindows[sessionID] {
            windowController.showWindow(nil)
        } else {
            promptPanelController.show()
        }
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/HandAgentApp.swift
git commit -m "refactor: wire up KeyboardShortcuts.onKeyUp for global hotkey, remove HotkeyService usage"
```

---

### Task 8: 构建验证并修复编译错误

**Files:**
- Possibly any file from above if there are compilation issues

- [ ] **Step 1: 构建项目**

Run: `bash ./scripts/swiftw build`
Expected: Build complete

如果有编译错误，根据错误信息修复。常见问题：
- `KeyboardShortcuts.Shortcut` 的 `description` 属性可能不存在，需要改用 `shortcut.description` 或自定义格式化
- Swift 6 strict concurrency 可能对 `KeyboardShortcuts.onKeyUp` 闭包有要求

- [ ] **Step 2: 运行测试**

Run: `bash ./scripts/test.sh`
Expected: 所有测试通过

Run: `bash ./scripts/swiftw test`
Expected: Swift 测试通过

- [ ] **Step 3: 修复任何失败并 commit**

```bash
git add -A
git commit -m "fix: resolve compilation and test issues after KeyboardShortcuts migration"
```

---

### Task 9: 更新文档

**Files:**
- Modify: `apps/desktop/Sources/AppServices/Hotkey/hotkey.md`

- [ ] **Step 1: 重写 hotkey.md**

```markdown
# Hotkey 模块

全局快捷键与 PromptAction 快捷键，基于 [KeyboardShortcuts](https://github.com/sindresorhus/KeyboardShortcuts) 库。

## 文件

| 文件 | 职责 |
|------|------|
| `GlobalShortcutNames.swift` | 定义 `KeyboardShortcuts.Name` 扩展（全局热键名称与默认值） |

## 架构

### 全局热键

- 通过 `KeyboardShortcuts.Name.showPromptPanel` 定义，默认 Cmd+Shift+Space
- `AppDelegate.applicationDidFinishLaunching` 中调用 `KeyboardShortcuts.onKeyUp(for:)` 注册监听
- 库内部使用 Carbon Events API 注册系统级热键
- 用户自定义值自动存储在 UserDefaults 中（由库管理）

### Action 快捷键（局部）

- 每个 `PromptAction` 通过 `shortcutName` 属性生成 `KeyboardShortcuts.Name("action.\(id)")`
- 不注册全局监听，仅在 PromptPanel 可见时通过本地事件监听匹配
- 匹配方式：`KeyboardShortcuts.Shortcut(event:)` 构造后与存储值 `==` 比较
- 默认值在 `PromptPanelController.register(actions:)` 中设置（仅当用户未自定义时）

### 设置界面

- 全局热键：`KeyboardShortcuts.Recorder(name: .showPromptPanel)` — 录制后自动生效
- Action 快捷键：`KeyboardShortcuts.Recorder(name: action.shortcutName)` — 录制后下次匹配生效

## 与其他模块的关系

- `HandAgentApp.swift` 注册全局热键回调
- `PromptPanelController`（PromptPanel 模块）注册 action 默认值并做局部匹配
- `Settings/ShortcutSettingsView` 提供配置 UI
```

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/Sources/AppServices/Hotkey/hotkey.md
git commit -m "docs: update hotkey module documentation for KeyboardShortcuts migration"
```

---

### Task 10: 最终验证

- [ ] **Step 1: 完整构建**

Run: `bash ./scripts/swiftw build`
Expected: Build complete

- [ ] **Step 2: 运行所有测试**

Run: `bash ./scripts/test.sh`
Expected: 全部通过

Run: `bash ./scripts/swiftw test`
Expected: 全部通过

- [ ] **Step 3: 运行 app 手动验证**

Run: `bash ./scripts/swiftw run HandAgentDesktop`

验证项：
1. Cmd+Shift+Space 唤起 PromptPanel
2. PromptPanel 中 Cmd+, 触发打开设置
3. 设置界面中可以录制新的全局快捷键，录制后立即生效
4. 设置界面中可以录制新的 action 快捷键
5. App 重启后快捷键配置保持

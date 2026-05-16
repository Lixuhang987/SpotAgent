# 前端架构重构实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 SwiftUI 前端重构为 @Observable + ViewModel + Theme + AppCoordinator 架构，修复 PromptPanel 不显示和 Settings 无法打开的 bug。

**Architecture:** AppCoordinator 单向事件流管理全局状态；每个 View 模块拆为 View（纯 UI）+ ViewModel（@Observable 逻辑）+ Styles（ViewModifier）；全局 Theme token 通过 Environment 注入；SwiftUI 原生 Window scene 替代手动 NSWindowController（仅 PromptPanel/StatusBubble 保留 NSPanel/NSWindow）。

**Tech Stack:** Swift 6.0, SwiftUI (macOS 15+), Observation framework, KeyboardShortcuts library

---

## 文件结构

### 新增文件

| 路径 | 职责 |
|------|------|
| `apps/desktop/Sources/Theme/AppTheme.swift` | Theme struct：颜色/字体/间距 token |
| `apps/desktop/Sources/Theme/ThemeEnvironment.swift` | EnvironmentKey + View extension |
| `apps/desktop/Sources/Coordinator/AppCoordinator.swift` | 单向事件流，全局状态协调 |
| `apps/desktop/Sources/PromptPanel/PromptPanelViewModel.swift` | PromptPanel 状态 + 交互逻辑 |
| `apps/desktop/Sources/PromptPanel/PromptPanelStyles.swift` | PromptPanel ViewModifier |
| `apps/desktop/Sources/SessionWindow/SessionStyles.swift` | Session ViewModifier |
| `apps/desktop/Sources/StatusBubble/StatusBubbleViewModel.swift` | StatusBubble 状态逻辑 |
| `apps/desktop/Sources/StatusBubble/StatusBubbleStyles.swift` | StatusBubble ViewModifier |
| `apps/desktop/Sources/Settings/SettingsView.swift` | TabView 容器 |
| `apps/desktop/Sources/Settings/AgentSettingsViewModel.swift` | 设置逻辑代理 |
| `apps/desktop/TestsSwift/AppThemeTests.swift` | Theme 测试 |
| `apps/desktop/TestsSwift/PromptPanelViewModelTests.swift` | PromptPanel ViewModel 测试 |
| `apps/desktop/TestsSwift/AppCoordinatorTests.swift` | Coordinator 测试 |
| `apps/desktop/TestsSwift/AgentSettingsViewModelTests.swift` | Settings ViewModel 测试 |
| `apps/desktop/TestsSwift/StatusBubbleViewModelTests.swift` | StatusBubble ViewModel 测试 |

### 删除文件

| 路径 | 原因 |
|------|------|
| `apps/desktop/Sources/SessionWindow/SessionWindowController.swift` | SwiftUI Window scene 替代 |

### 重写文件

| 路径 | 变更 |
|------|------|
| `apps/desktop/HandAgentApp.swift` | 删除 AppDelegate，纯 Scene 声明 |
| `apps/desktop/Sources/PromptPanel/PromptPanelView.swift` | 纯 UI + Theme + ViewModel 绑定 |
| `apps/desktop/Sources/PromptPanel/PromptPanelController.swift` | 精简为纯窗口管理 |
| `apps/desktop/Sources/SessionWindow/SessionWindowView.swift` | 纯 UI + Theme |
| `apps/desktop/Sources/SessionWindow/SessionViewModel.swift` | ObservableObject → @Observable |
| `apps/desktop/Sources/StatusBubble/StatusBubbleView.swift` | 纯 UI + Theme + ViewModel |
| `apps/desktop/Sources/StatusBubble/StatusBubbleController.swift` | 注入 ViewModel |
| `apps/desktop/Sources/Settings/AgentSettingsView.swift` | 纯 UI + ViewModel |
| `apps/desktop/Sources/Settings/ShortcutSettingsView.swift` | 引用 Theme |
| `apps/desktop/Sources/AppServices/Session/SessionRegistry.swift` | ObservableObject → @Observable |
| `apps/desktop/Sources/AppServices/AgentSettings/AgentSettingsStore.swift` | ObservableObject → @Observable |

---

## Task 1: Theme 基础设施

**Files:**
- Create: `apps/desktop/Sources/Theme/AppTheme.swift`
- Create: `apps/desktop/Sources/Theme/ThemeEnvironment.swift`
- Test: `apps/desktop/TestsSwift/AppThemeTests.swift`

- [ ] **Step 1: Write failing test for AppTheme**

```swift
// apps/desktop/TestsSwift/AppThemeTests.swift
import XCTest
@testable import HandAgentDesktop

final class AppThemeTests: XCTestCase {
    func testDefaultThemeHasExpectedSpacing() {
        let theme = AppTheme.default
        XCTAssertEqual(theme.spacing.sm, 8)
        XCTAssertEqual(theme.spacing.lg, 16)
        XCTAssertEqual(theme.spacing.xl, 20)
    }

    func testDefaultThemeTypographyIsNotNil() {
        let theme = AppTheme.default
        // Font 无法直接比较，验证能访问即可
        _ = theme.typography.promptInputFont
        _ = theme.typography.titleFont
        _ = theme.typography.bodyFont
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash ./scripts/swiftw test`
Expected: FAIL — `AppTheme` not found

- [ ] **Step 3: Implement AppTheme**

```swift
// apps/desktop/Sources/Theme/AppTheme.swift
import SwiftUI

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
    let xs: CGFloat
    let sm: CGFloat
    let md: CGFloat
    let lg: CGFloat
    let xl: CGFloat
    let xxl: CGFloat

    static let `default` = ThemeSpacing(
        xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24
    )
}
```

- [ ] **Step 4: Implement ThemeEnvironment**

```swift
// apps/desktop/Sources/Theme/ThemeEnvironment.swift
import SwiftUI

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

- [ ] **Step 5: Run tests to verify they pass**

Run: `bash ./scripts/swiftw test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/Sources/Theme/ apps/desktop/TestsSwift/AppThemeTests.swift
git commit -m "feat(desktop): add Theme infrastructure with token definitions"
```

---

## Task 2: 迁移 SessionRegistry 到 @Observable

**Files:**
- Modify: `apps/desktop/Sources/AppServices/Session/SessionRegistry.swift`
- Modify: `apps/desktop/TestsSwift/SessionRegistryTests.swift`

- [ ] **Step 1: Rewrite SessionRegistry using @Observable**

```swift
// apps/desktop/Sources/AppServices/Session/SessionRegistry.swift
import Foundation

struct SessionSummary: Equatable {
    let sessionId: String
    let isRunning: Bool
    let latestSummary: String
    let lastActiveAt: Date
    let windowIsOpen: Bool
}

@Observable
@MainActor
final class SessionRegistry {
    private(set) var summaries: [String: SessionSummary] = [:]
    private(set) var recentSessionIDs: [String] = []

    func upsert(_ summary: SessionSummary) {
        summaries[summary.sessionId] = summary
        recentSessionIDs = summaries.values
            .sorted { $0.lastActiveAt > $1.lastActiveAt }
            .map(\.sessionId)
    }

    var primarySessionID: String? {
        recentSessionIDs.first {
            summaries[$0]?.isRunning == true && summaries[$0]?.windowIsOpen == true
        } ?? recentSessionIDs.first {
            summaries[$0]?.windowIsOpen == true
        }
    }
}
```

- [ ] **Step 2: Run existing tests to verify they still pass**

Run: `bash ./scripts/swiftw test`
Expected: PASS (existing SessionRegistryTests should work unchanged since @Observable properties are accessed the same way)

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/Sources/AppServices/Session/SessionRegistry.swift
git commit -m "refactor(desktop): migrate SessionRegistry to @Observable"
```

---

## Task 3: 迁移 AgentSettingsStore 到 @Observable

**Files:**
- Modify: `apps/desktop/Sources/AppServices/AgentSettings/AgentSettingsStore.swift`

- [ ] **Step 1: Rewrite AgentSettingsStore using @Observable**

```swift
// apps/desktop/Sources/AppServices/AgentSettings/AgentSettingsStore.swift
import Foundation

enum AgentAPIType: String, CaseIterable, Codable, Equatable, Identifiable {
    case responses
    case chat
    case completion

    var id: String { rawValue }

    var title: String {
        switch self {
        case .responses: return "Responses"
        case .chat: return "Chat Completions"
        case .completion: return "Completions"
        }
    }
}

struct AgentSettings: Codable, Equatable {
    var model: String
    var apiKey: String
    var baseURL: String
    var api: AgentAPIType

    static let defaultValue = AgentSettings(
        model: "gpt-5-mini",
        apiKey: "",
        baseURL: "",
        api: .responses
    )

    enum CodingKeys: String, CodingKey {
        case model
        case apiKey
        case baseURL = "baseUrl"
        case api
    }
}

private struct AgentSettingsFile: Codable {
    var llm: AgentSettings
}

@Observable
@MainActor
final class AgentSettingsStore {
    private(set) var settings: AgentSettings
    private(set) var saveErrorMessage: String?

    @ObservationIgnored private let fileManager: FileManager
    @ObservationIgnored private let homeDirectoryURL: URL
    @ObservationIgnored private var lastLoadedData: Data?
    @ObservationIgnored private var pollingTask: Task<Void, Never>?

    init(
        fileManager: FileManager = .default,
        homeDirectoryURL: URL = FileManager.default.homeDirectoryForCurrentUser
    ) {
        self.fileManager = fileManager
        self.homeDirectoryURL = homeDirectoryURL
        let loadedState = Self.loadState(fileManager: fileManager, homeDirectoryURL: homeDirectoryURL)
        self.settings = loadedState.settings
        self.lastLoadedData = loadedState.data
        startPolling()
    }

    deinit {
        pollingTask?.cancel()
    }

    func update(_ mutate: (inout AgentSettings) -> Void) {
        var nextSettings = settings
        mutate(&nextSettings)
        settings = nextSettings
        persist()
    }

    func reloadFromDisk() {
        let loadedState = Self.loadState(fileManager: fileManager, homeDirectoryURL: homeDirectoryURL)
        guard loadedState.data != lastLoadedData else { return }
        settings = loadedState.settings
        lastLoadedData = loadedState.data
        saveErrorMessage = nil
    }

    static func settingsFileURL(homeDirectoryURL: URL) -> URL {
        homeDirectoryURL
            .appendingPathComponent(".spotAgent", isDirectory: true)
            .appendingPathComponent("settings.json")
    }

    private static func loadState(fileManager: FileManager, homeDirectoryURL: URL) -> (
        settings: AgentSettings,
        data: Data?
    ) {
        let fileURL = settingsFileURL(homeDirectoryURL: homeDirectoryURL)
        guard let data = try? Data(contentsOf: fileURL),
              let persisted = try? JSONDecoder().decode(AgentSettingsFile.self, from: data)
        else {
            return (.defaultValue, nil)
        }
        return (persisted.llm, data)
    }

    private func persist() {
        let directoryURL = homeDirectoryURL.appendingPathComponent(".spotAgent", isDirectory: true)
        let fileURL = Self.settingsFileURL(homeDirectoryURL: homeDirectoryURL)

        do {
            try fileManager.createDirectory(at: directoryURL, withIntermediateDirectories: true)
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            let data = try encoder.encode(AgentSettingsFile(llm: settings))
            try data.write(to: fileURL, options: .atomic)
            lastLoadedData = data
            saveErrorMessage = nil
        } catch {
            saveErrorMessage = "保存设置失败：\(error.localizedDescription)"
        }
    }

    private func startPolling() {
        pollingTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(500))
                guard let self else { return }
                self.reloadFromDisk()
            }
        }
    }
}
```

- [ ] **Step 2: Run existing tests**

Run: `bash ./scripts/swiftw test`
Expected: PASS (AgentSettingsStoreTests access properties directly, no Combine dependency)

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/Sources/AppServices/AgentSettings/AgentSettingsStore.swift
git commit -m "refactor(desktop): migrate AgentSettingsStore to @Observable"
```

---

## Task 4: 迁移 SessionViewModel 到 @Observable

**Files:**
- Modify: `apps/desktop/Sources/SessionWindow/SessionViewModel.swift`

- [ ] **Step 1: Rewrite SessionViewModel using @Observable**

```swift
// apps/desktop/Sources/SessionWindow/SessionViewModel.swift
import Foundation

struct SessionBubble: Identifiable, Equatable {
    let id: String
    let role: String
    var text: String
}

@Observable
@MainActor
final class SessionViewModel {
    private(set) var messages: [SessionBubble] = []
    private(set) var status: String = "idle"
    private(set) var error: String?

    let sessionID: String
    @ObservationIgnored let socketClient: SessionSocketClient

    init(sessionID: String, socketClient: SessionSocketClient) {
        self.sessionID = sessionID
        self.socketClient = socketClient
    }

    func start(initialPrompt: String, startupError: String? = nil) {
        if let startupError,
           !startupError.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            handle(
                .error(
                    messageID: UUID().uuidString,
                    message: startupError,
                    timestamp: Self.timestamp()
                )
            )
            return
        }

        socketClient.onEvent = { [weak self] event in
            Task { @MainActor in
                self?.handle(event)
            }
        }

        socketClient.connect(sessionID: sessionID)
        sendPrompt(initialPrompt)
    }

    func stop() {
        socketClient.disconnect()
    }

    func sendPrompt(_ text: String) {
        let trimmedText = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedText.isEmpty else { return }

        let messageID = UUID().uuidString
        let timestamp = Self.timestamp()
        handle(.userMessage(messageID: messageID, text: trimmedText, timestamp: timestamp))
        socketClient.sendUserMessage(
            sessionID: sessionID,
            messageID: messageID,
            text: trimmedText,
            timestamp: timestamp
        )
    }

    func handle(_ event: SessionEvent) {
        switch event {
        case .userMessage(let messageID, let text, _):
            status = "running"
            error = nil
            messages.append(SessionBubble(id: messageID, role: "user", text: text))
        case .assistantMessageStart(let messageID, _):
            status = "running"
            error = nil
            messages.append(SessionBubble(id: messageID, role: "assistant", text: ""))
        case .assistantMessageDelta(let messageID, let text, _):
            guard let index = messages.firstIndex(where: { $0.id == messageID }) else { return }
            messages[index].text += text
        case .assistantMessageEnd(_, let status, _):
            self.status = status == "completed" ? "idle" : status
        case .toolMessage(let messageID, let name, let text, _, _):
            messages.append(SessionBubble(id: messageID, role: "tool", text: "\(name): \(text)"))
        case .status(let value):
            status = value
            if value != "failed" { error = nil }
        case .error(let messageID, let message, _):
            status = "failed"
            error = message
            if messages.last?.role == "assistant", messages.last?.text == message { return }
            messages.append(SessionBubble(id: messageID, role: "assistant", text: message))
        case .sessionSnapshot(let messages, let status):
            self.messages = messages
            self.status = status
            error = nil
        }
    }

    private static func timestamp() -> String {
        ISO8601DateFormatter().string(from: Date())
    }
}
```

- [ ] **Step 2: Run existing tests**

Run: `bash ./scripts/swiftw test`
Expected: PASS (SessionViewModelTests access properties directly)

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/Sources/SessionWindow/SessionViewModel.swift
git commit -m "refactor(desktop): migrate SessionViewModel to @Observable"
```

---

## Task 5: AgentSettingsViewModel

**Files:**
- Create: `apps/desktop/Sources/Settings/AgentSettingsViewModel.swift`
- Test: `apps/desktop/TestsSwift/AgentSettingsViewModelTests.swift`

- [ ] **Step 1: Write failing test**

```swift
// apps/desktop/TestsSwift/AgentSettingsViewModelTests.swift
import XCTest
@testable import HandAgentDesktop

final class AgentSettingsViewModelTests: XCTestCase {
    @MainActor
    func testModelPropertyReadsFromStore() {
        let homeURL = makeTemporaryHomeDirectory()
        defer { try? FileManager.default.removeItem(at: homeURL) }

        let store = AgentSettingsStore(homeDirectoryURL: homeURL)
        let vm = AgentSettingsViewModel(store: store)

        XCTAssertEqual(vm.model, "gpt-5-mini")
    }

    @MainActor
    func testSettingModelPersistsToStore() {
        let homeURL = makeTemporaryHomeDirectory()
        defer { try? FileManager.default.removeItem(at: homeURL) }

        let store = AgentSettingsStore(homeDirectoryURL: homeURL)
        let vm = AgentSettingsViewModel(store: store)

        vm.model = "  gpt-4.1  "

        XCTAssertEqual(store.settings.model, "gpt-4.1")
    }

    @MainActor
    func testSettingAPIPersistsToStore() {
        let homeURL = makeTemporaryHomeDirectory()
        defer { try? FileManager.default.removeItem(at: homeURL) }

        let store = AgentSettingsStore(homeDirectoryURL: homeURL)
        let vm = AgentSettingsViewModel(store: store)

        vm.api = .chat

        XCTAssertEqual(store.settings.api, .chat)
    }

    private func makeTemporaryHomeDirectory() -> URL {
        let root = URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
        let directory = root.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash ./scripts/swiftw test`
Expected: FAIL — `AgentSettingsViewModel` not found

- [ ] **Step 3: Implement AgentSettingsViewModel**

```swift
// apps/desktop/Sources/Settings/AgentSettingsViewModel.swift
import Foundation

@Observable
@MainActor
final class AgentSettingsViewModel {
    @ObservationIgnored private let store: AgentSettingsStore

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

- [ ] **Step 4: Run tests**

Run: `bash ./scripts/swiftw test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/Sources/Settings/AgentSettingsViewModel.swift apps/desktop/TestsSwift/AgentSettingsViewModelTests.swift
git commit -m "feat(desktop): add AgentSettingsViewModel with store proxy pattern"
```

---

## Task 6: PromptPanelViewModel

**Files:**
- Create: `apps/desktop/Sources/PromptPanel/PromptPanelViewModel.swift`
- Test: `apps/desktop/TestsSwift/PromptPanelViewModelTests.swift`

- [ ] **Step 1: Write failing test**

```swift
// apps/desktop/TestsSwift/PromptPanelViewModelTests.swift
import XCTest
import KeyboardShortcuts
@testable import HandAgentDesktop

final class PromptPanelViewModelTests: XCTestCase {
    @MainActor
    func testFilteredActionsReturnsAllWhenDraftIsEmpty() {
        let actions = makeTestActions()
        let vm = PromptPanelViewModel(actions: actions)

        XCTAssertEqual(vm.filteredActions.map(\.id), ["open-settings", "new-session"])
    }

    @MainActor
    func testFilteredActionsFiltersByDraft() {
        let actions = makeTestActions()
        let vm = PromptPanelViewModel(actions: actions)

        vm.draft = "settings"

        XCTAssertEqual(vm.filteredActions.map(\.id), ["open-settings"])
    }

    @MainActor
    func testSubmitCallsOnSubmitWithTrimmedDraft() {
        let actions = makeTestActions()
        let vm = PromptPanelViewModel(actions: actions)
        var submitted: String?
        vm.onSubmit = { draft, _ in submitted = draft }

        vm.draft = "  hello world  "
        vm.submit()

        XCTAssertEqual(submitted, "hello world")
        XCTAssertEqual(vm.draft, "")
    }

    @MainActor
    func testSubmitIgnoresEmptyDraft() {
        let actions = makeTestActions()
        let vm = PromptPanelViewModel(actions: actions)
        var submitted: String?
        vm.onSubmit = { draft, _ in submitted = draft }

        vm.draft = "   "
        vm.submit()

        XCTAssertNil(submitted)
    }

    @MainActor
    func testSubmitActionCallsPerformAndOnHide() {
        let actions = makeTestActions()
        let vm = PromptPanelViewModel(actions: actions)
        var performed = false
        var hidden = false
        vm.onHide = { hidden = true }

        let action = PromptAction(
            id: "test",
            title: "Test",
            keywords: [],
            defaultShortcut: nil,
            perform: { performed = true }
        )
        vm.submitAction(action)

        XCTAssertTrue(performed)
        XCTAssertTrue(hidden)
    }

    private func makeTestActions() -> [PromptAction] {
        [
            PromptAction(
                id: "open-settings",
                title: "打开设置",
                keywords: ["settings", "preferences"],
                defaultShortcut: .init(.comma, modifiers: [.command]),
                perform: {}
            ),
            PromptAction(
                id: "new-session",
                title: "新建会话",
                keywords: ["session", "new"],
                defaultShortcut: nil,
                perform: {}
            )
        ]
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash ./scripts/swiftw test`
Expected: FAIL — `PromptPanelViewModel` not found

- [ ] **Step 3: Implement PromptPanelViewModel**

```swift
// apps/desktop/Sources/PromptPanel/PromptPanelViewModel.swift
import Foundation
import KeyboardShortcuts

@Observable
@MainActor
final class PromptPanelViewModel {
    var draft = ""
    var focusSeed = 0

    var onSubmit: ((String, [PromptAttachmentResult]) -> Void)?
    var onHide: (() -> Void)?
    var onOpenSettings: (() -> Void)?

    @ObservationIgnored private let actions: [PromptAction]

    var filteredActions: [PromptAction] {
        PromptAction.filter(actions, query: draft)
    }

    init(actions: [PromptAction]) {
        self.actions = actions
    }

    func submit() {
        let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        onSubmit?(trimmed, [])
        draft = ""
    }

    func submitAction(_ action: PromptAction) {
        action.perform()
        draft = ""
        onHide?()
    }

    func openSettings() {
        onOpenSettings?()
        onHide?()
    }

    func shortcutLabel(for action: PromptAction) -> String? {
        KeyboardShortcuts.getShortcut(for: action.shortcutName)?.description
    }
}
```

- [ ] **Step 4: Run tests**

Run: `bash ./scripts/swiftw test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/Sources/PromptPanel/PromptPanelViewModel.swift apps/desktop/TestsSwift/PromptPanelViewModelTests.swift
git commit -m "feat(desktop): add PromptPanelViewModel with action filtering and submission"
```

---

## Task 7: StatusBubbleViewModel

**Files:**
- Create: `apps/desktop/Sources/StatusBubble/StatusBubbleViewModel.swift`
- Test: `apps/desktop/TestsSwift/StatusBubbleViewModelTests.swift`

- [ ] **Step 1: Write failing test**

```swift
// apps/desktop/TestsSwift/StatusBubbleViewModelTests.swift
import XCTest
@testable import HandAgentDesktop

final class StatusBubbleViewModelTests: XCTestCase {
    @MainActor
    func testIsRunningReturnsFalseWhenNoSessions() {
        let registry = SessionRegistry()
        let vm = StatusBubbleViewModel(registry: registry)

        XCTAssertFalse(vm.isRunning)
    }

    @MainActor
    func testIsRunningReturnsTrueWhenPrimarySessionIsRunning() {
        let registry = SessionRegistry()
        registry.upsert(SessionSummary(
            sessionId: "s1",
            isRunning: true,
            latestSummary: "hello",
            lastActiveAt: .now,
            windowIsOpen: true
        ))
        let vm = StatusBubbleViewModel(registry: registry)

        XCTAssertTrue(vm.isRunning)
    }

    @MainActor
    func testLatestSummaryShowsDefaultWhenEmpty() {
        let registry = SessionRegistry()
        let vm = StatusBubbleViewModel(registry: registry)

        XCTAssertEqual(vm.latestSummary, "点击开始")
    }

    @MainActor
    func testLatestSummaryShowsPrimarySessionSummary() {
        let registry = SessionRegistry()
        registry.upsert(SessionSummary(
            sessionId: "s1",
            isRunning: false,
            latestSummary: "分析完成",
            lastActiveAt: .now,
            windowIsOpen: true
        ))
        let vm = StatusBubbleViewModel(registry: registry)

        XCTAssertEqual(vm.latestSummary, "分析完成")
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash ./scripts/swiftw test`
Expected: FAIL — `StatusBubbleViewModel` not found

- [ ] **Step 3: Implement StatusBubbleViewModel**

```swift
// apps/desktop/Sources/StatusBubble/StatusBubbleViewModel.swift
import Foundation

@Observable
@MainActor
final class StatusBubbleViewModel {
    @ObservationIgnored private let registry: SessionRegistry

    var onTap: ((String?) -> Void)?

    var isRunning: Bool {
        primarySummary?.isRunning ?? false
    }

    var latestSummary: String {
        primarySummary?.latestSummary ?? "点击开始"
    }

    init(registry: SessionRegistry) {
        self.registry = registry
    }

    func tap() {
        onTap?(registry.primarySessionID)
    }

    private var primarySummary: SessionSummary? {
        registry.primarySessionID.flatMap { registry.summaries[$0] }
    }
}
```

- [ ] **Step 4: Run tests**

Run: `bash ./scripts/swiftw test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/Sources/StatusBubble/StatusBubbleViewModel.swift apps/desktop/TestsSwift/StatusBubbleViewModelTests.swift
git commit -m "feat(desktop): add StatusBubbleViewModel"
```

---

## Task 8: Styles 文件

**Files:**
- Create: `apps/desktop/Sources/PromptPanel/PromptPanelStyles.swift`
- Create: `apps/desktop/Sources/SessionWindow/SessionStyles.swift`
- Create: `apps/desktop/Sources/StatusBubble/StatusBubbleStyles.swift`

- [ ] **Step 1: Create PromptPanelStyles**

```swift
// apps/desktop/Sources/PromptPanel/PromptPanelStyles.swift
import SwiftUI

struct PromptPanelContainerModifier: ViewModifier {
    @Environment(\.appTheme) private var theme

    func body(content: Content) -> some View {
        content
            .padding(theme.spacing.xl)
            .frame(minWidth: 640, minHeight: 420)
            .background(theme.colors.background)
    }
}

struct ActionRowModifier: ViewModifier {
    @Environment(\.appTheme) private var theme

    func body(content: Content) -> some View {
        content
            .padding(.vertical, theme.spacing.sm)
            .contentShape(Rectangle())
    }
}

extension View {
    func promptPanelContainer() -> some View {
        modifier(PromptPanelContainerModifier())
    }

    func actionRow() -> some View {
        modifier(ActionRowModifier())
    }
}
```

- [ ] **Step 2: Create SessionStyles**

```swift
// apps/desktop/Sources/SessionWindow/SessionStyles.swift
import SwiftUI

struct MessageBubbleModifier: ViewModifier {
    let role: String
    @Environment(\.appTheme) private var theme

    func body(content: Content) -> some View {
        content
            .frame(
                maxWidth: .infinity,
                alignment: role == "user" ? .trailing : .leading
            )
            .padding(.horizontal, theme.spacing.md)
            .padding(.vertical, 10)
            .background(bubbleColor)
            .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private var bubbleColor: Color {
        switch role {
        case "user": return theme.colors.userBubble
        case "tool": return theme.colors.toolBubble
        default: return theme.colors.assistantBubble
        }
    }
}

extension View {
    func messageBubble(role: String) -> some View {
        modifier(MessageBubbleModifier(role: role))
    }
}
```

- [ ] **Step 3: Create StatusBubbleStyles**

```swift
// apps/desktop/Sources/StatusBubble/StatusBubbleStyles.swift
import SwiftUI

struct StatusBubbleContainerModifier: ViewModifier {
    @Environment(\.appTheme) private var theme

    func body(content: Content) -> some View {
        content
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(theme.colors.background)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .overlay {
                RoundedRectangle(cornerRadius: 16)
                    .stroke(theme.colors.border, lineWidth: 1)
            }
    }
}

extension View {
    func statusBubbleContainer() -> some View {
        modifier(StatusBubbleContainerModifier())
    }
}
```

- [ ] **Step 4: Run build to verify compilation**

Run: `bash ./scripts/swiftw build`
Expected: BUILD SUCCEEDED

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/Sources/PromptPanel/PromptPanelStyles.swift apps/desktop/Sources/SessionWindow/SessionStyles.swift apps/desktop/Sources/StatusBubble/StatusBubbleStyles.swift
git commit -m "feat(desktop): add Styles files with ViewModifiers for each module"
```

---

## Task 9: AppCoordinator

**Files:**
- Create: `apps/desktop/Sources/Coordinator/AppCoordinator.swift`
- Test: `apps/desktop/TestsSwift/AppCoordinatorTests.swift`

- [ ] **Step 1: Write failing test**

```swift
// apps/desktop/TestsSwift/AppCoordinatorTests.swift
import XCTest
@testable import HandAgentDesktop

final class AppCoordinatorTests: XCTestCase {
    @MainActor
    func testSubmitPromptCreatesSessionViewModel() {
        let coordinator = AppCoordinator(skipServerStart: true)

        coordinator.send(.submitPrompt("hello", attachments: []))

        XCTAssertEqual(coordinator.sessionViewModels.count, 1)
        XCTAssertEqual(coordinator.sessionViewModels.values.first?.messages.first?.text, "hello")
    }

    @MainActor
    func testSessionClosedRemovesViewModel() {
        let coordinator = AppCoordinator(skipServerStart: true)

        coordinator.send(.submitPrompt("hello", attachments: []))
        let sessionID = coordinator.sessionViewModels.keys.first!

        coordinator.send(.sessionClosed(sessionID))

        XCTAssertTrue(coordinator.sessionViewModels.isEmpty)
    }

    @MainActor
    func testSubmitPromptIgnoresEmptyString() {
        let coordinator = AppCoordinator(skipServerStart: true)

        coordinator.send(.submitPrompt("   ", attachments: []))

        XCTAssertTrue(coordinator.sessionViewModels.isEmpty)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash ./scripts/swiftw test`
Expected: FAIL — `AppCoordinator` not found

- [ ] **Step 3: Implement AppCoordinator**

```swift
// apps/desktop/Sources/Coordinator/AppCoordinator.swift
import AppKit
import Foundation
import KeyboardShortcuts

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

    private(set) var sessionViewModels: [String: SessionViewModel] = [:]
    private(set) var agentServerError: String?

    @ObservationIgnored private let agentServerService: AgentServerService
    @ObservationIgnored private let sessionRegistry: SessionRegistry
    @ObservationIgnored private let settingsStore: AgentSettingsStore
    @ObservationIgnored private let activationPolicy = AppActivationPolicyCoordinator()
    @ObservationIgnored private lazy var promptPanelController = PromptPanelController()
    @ObservationIgnored private lazy var statusBubbleController: StatusBubbleController = {
        StatusBubbleController(registry: sessionRegistry)
    }()
    @ObservationIgnored private lazy var promptPanelViewModel: PromptPanelViewModel = {
        let vm = PromptPanelViewModel(actions: promptActions)
        vm.onSubmit = { [weak self] draft, attachments in
            self?.send(.submitPrompt(draft, attachments: attachments))
        }
        vm.onHide = { [weak self] in
            self?.promptPanelController.hide()
        }
        vm.onOpenSettings = { [weak self] in
            self?.send(.openSettings)
        }
        return vm
    }()
    @ObservationIgnored private lazy var statusBubbleViewModel: StatusBubbleViewModel = {
        let vm = StatusBubbleViewModel(registry: sessionRegistry)
        vm.onTap = { [weak self] sessionID in
            self?.send(.statusBubbleTapped(sessionID))
        }
        return vm
    }()

    @ObservationIgnored private let agentServerURL = URL(string: "ws://127.0.0.1:4317/api/session")!
    @ObservationIgnored private let skipServerStart: Bool

    @ObservationIgnored private lazy var promptActions: [PromptAction] = [
        PromptAction(
            id: "open-settings",
            title: "打开设置",
            keywords: ["settings", "preferences", "shortcut", "hotkey"],
            defaultShortcut: .init(.comma, modifiers: [.command]),
            perform: { [weak self] in
                self?.send(.openSettings)
            }
        )
    ]

    init(skipServerStart: Bool = false) {
        self.skipServerStart = skipServerStart
        self.agentServerService = AgentServerService()
        self.sessionRegistry = SessionRegistry()
        self.settingsStore = AgentSettingsStore()
    }

    func bootstrap() {
        setupPromptPanel()
        setupHotkey()
        startAgentServer()
        statusBubbleController.show()
    }

    func shutdown() {
        agentServerService.stop()
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

    func makeSettingsViewModel() -> AgentSettingsViewModel {
        AgentSettingsViewModel(store: settingsStore)
    }

    func makeShortcutActions() -> [PromptAction] {
        promptActions
    }

    private func setupPromptPanel() {
        promptPanelController.configure(viewModel: promptPanelViewModel)
        promptPanelViewModel.onSubmit = { [weak self] draft, attachments in
            self?.send(.submitPrompt(draft, attachments: attachments))
        }
        promptPanelViewModel.onHide = { [weak self] in
            self?.promptPanelController.hide()
        }
        promptPanelViewModel.onOpenSettings = { [weak self] in
            self?.send(.openSettings)
        }
    }

    private func setupHotkey() {
        KeyboardShortcuts.onKeyUp(for: .showPromptPanel) { [weak self] in
            Task { @MainActor in
                self?.send(.showPromptPanel)
            }
        }
    }

    private func startAgentServer() {
        guard !skipServerStart else { return }
        do {
            try agentServerService.start()
            agentServerError = nil
        } catch {
            agentServerError = agentServerService.lastStartupError ?? error.localizedDescription
        }
    }

    private func handleSubmitPrompt(_ draft: String, attachments: [PromptAttachmentResult]) {
        let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        let attachmentText = attachments.compactMap { attachment -> String? in
            switch attachment {
            case .noAttachment: return nil
            case .textToken(let token): return token
            }
        }

        let composedPrompt = ([trimmed] + attachmentText).joined(separator: "\n\n")
        let sessionID = UUID().uuidString
        let viewModel = SessionViewModel(
            sessionID: sessionID,
            socketClient: SessionSocketClient(serverURL: agentServerURL)
        )

        NSApp.setActivationPolicy(
            activationPolicy.policyAfterUpdatingOpenSessionWindows(by: 1)
        )

        sessionViewModels[sessionID] = viewModel
        sessionRegistry.upsert(
            SessionSummary(
                sessionId: sessionID,
                isRunning: true,
                latestSummary: composedPrompt,
                lastActiveAt: .now,
                windowIsOpen: true
            )
        )

        promptPanelController.hide()

        viewModel.start(
            initialPrompt: composedPrompt,
            startupError: agentServerError
        )
    }

    private func handleSessionClosed(_ sessionID: String) {
        let viewModel = sessionViewModels.removeValue(forKey: sessionID)

        NSApp.setActivationPolicy(
            activationPolicy.policyAfterUpdatingOpenSessionWindows(by: -1)
        )

        sessionRegistry.upsert(
            SessionSummary(
                sessionId: sessionID,
                isRunning: viewModel?.status == "running",
                latestSummary: viewModel?.messages.last?.text ?? "",
                lastActiveAt: .now,
                windowIsOpen: false
            )
        )
    }

    private func handleStatusBubbleTap(_ sessionID: String?) {
        if sessionID != nil, sessionViewModels[sessionID!] != nil {
            // Session 窗口存在，SwiftUI 会通过 WindowGroup 聚焦
            return
        }
        promptPanelController.show()
    }

    private func openSettingsWindow() {
        NSApp.sendAction(Selector(("showSettingsWindow:")), to: nil, from: nil)
        NSApp.activate(ignoringOtherApps: true)
    }
}
```

- [ ] **Step 4: Run tests**

Run: `bash ./scripts/swiftw test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/Sources/Coordinator/AppCoordinator.swift apps/desktop/TestsSwift/AppCoordinatorTests.swift
git commit -m "feat(desktop): add AppCoordinator with unidirectional action flow"
```

---

## Task 10: 重写 PromptPanelView + PromptPanelController

**Files:**
- Modify: `apps/desktop/Sources/PromptPanel/PromptPanelView.swift`
- Modify: `apps/desktop/Sources/PromptPanel/PromptPanelController.swift`

- [ ] **Step 1: Rewrite PromptPanelView as pure UI**

```swift
// apps/desktop/Sources/PromptPanel/PromptPanelView.swift
import SwiftUI

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
        .promptPanelContainer()
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
            .actionRow()
        }
        .buttonStyle(.plain)
    }
}
```

- [ ] **Step 2: Rewrite PromptPanelController as pure window manager**

```swift
// apps/desktop/Sources/PromptPanel/PromptPanelController.swift
import AppKit
import Carbon.HIToolbox
import KeyboardShortcuts
import SwiftUI

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
        NSApp.activate(ignoringOtherApps: true)
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

- [ ] **Step 3: Run build**

Run: `bash ./scripts/swiftw build`
Expected: BUILD SUCCEEDED (may have warnings from unused old code in HandAgentApp.swift — that's fine, we'll rewrite it in Task 13)

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/Sources/PromptPanel/PromptPanelView.swift apps/desktop/Sources/PromptPanel/PromptPanelController.swift
git commit -m "refactor(desktop): rewrite PromptPanelView + Controller with ViewModel separation"
```

---

## Task 11: 重写 SessionWindowView + StatusBubbleView

**Files:**
- Modify: `apps/desktop/Sources/SessionWindow/SessionWindowView.swift`
- Modify: `apps/desktop/Sources/StatusBubble/StatusBubbleView.swift`
- Modify: `apps/desktop/Sources/StatusBubble/StatusBubbleController.swift`

- [ ] **Step 1: Rewrite SessionWindowView with Theme**

```swift
// apps/desktop/Sources/SessionWindow/SessionWindowView.swift
import SwiftUI

struct SessionWindowView: View {
    @Bindable var viewModel: SessionViewModel
    @Environment(\.appTheme) private var theme
    @State private var draft = ""

    var body: some View {
        VStack(spacing: theme.spacing.lg) {
            statusHeader
            messageList
            if let error = viewModel.error {
                errorBanner(error)
            }
            inputField
        }
        .padding(theme.spacing.xl)
    }

    private var statusHeader: some View {
        HStack {
            Text("状态：\(viewModel.status)")
                .font(theme.typography.titleFont)
            Spacer()
        }
    }

    private var messageList: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: theme.spacing.md) {
                ForEach(viewModel.messages) { message in
                    Text(message.text)
                        .messageBubble(role: message.role)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func errorBanner(_ error: String) -> some View {
        Text(error)
            .foregroundStyle(theme.colors.error)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var inputField: some View {
        TextField("继续追问", text: $draft)
            .textFieldStyle(.roundedBorder)
            .onSubmit {
                let currentDraft = draft
                draft = ""
                viewModel.sendPrompt(currentDraft)
            }
    }
}
```

- [ ] **Step 2: Rewrite StatusBubbleView with ViewModel + Theme**

```swift
// apps/desktop/Sources/StatusBubble/StatusBubbleView.swift
import SwiftUI

struct StatusBubbleView: View {
    @Bindable var viewModel: StatusBubbleViewModel
    @Environment(\.appTheme) private var theme

    var body: some View {
        Button { viewModel.tap() } label: {
            VStack(alignment: .leading, spacing: 6) {
                Text(viewModel.isRunning ? "Running" : "Idle")
                    .font(theme.typography.titleFont)
                Text(viewModel.latestSummary)
                    .font(theme.typography.captionFont)
                    .foregroundStyle(theme.colors.textSecondary)
                    .lineLimit(2)
            }
            .statusBubbleContainer()
        }
        .buttonStyle(.plain)
    }
}
```

- [ ] **Step 3: Update StatusBubbleController to use ViewModel**

```swift
// apps/desktop/Sources/StatusBubble/StatusBubbleController.swift
import AppKit
import SwiftUI

@MainActor
final class StatusBubbleController {
    private let viewModel: StatusBubbleViewModel
    private var window: NSWindow?

    init(registry: SessionRegistry) {
        self.viewModel = StatusBubbleViewModel(registry: registry)
    }

    var onTap: ((String?) -> Void)? {
        get { viewModel.onTap }
        set { viewModel.onTap = newValue }
    }

    func show() {
        if window == nil {
            let hosting = NSHostingController(
                rootView: StatusBubbleView(viewModel: viewModel)
            )
            let window = NSWindow(contentViewController: hosting)
            window.setContentSize(NSSize(width: 280, height: 96))
            window.level = .floating
            window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
            window.isReleasedWhenClosed = false
            window.titleVisibility = .hidden
            window.titlebarAppearsTransparent = true
            window.standardWindowButton(.closeButton)?.isHidden = true
            window.standardWindowButton(.miniaturizeButton)?.isHidden = true
            window.standardWindowButton(.zoomButton)?.isHidden = true
            self.window = window
        }

        positionWindowIfNeeded()
        window?.makeKeyAndOrderFront(nil)
    }

    private func positionWindowIfNeeded() {
        guard let window, let screen = NSScreen.main else { return }
        let visibleFrame = screen.visibleFrame
        let origin = NSPoint(
            x: visibleFrame.maxX - window.frame.width - 24,
            y: visibleFrame.minY + 24
        )
        window.setFrameOrigin(origin)
    }
}
```

- [ ] **Step 4: Run build**

Run: `bash ./scripts/swiftw build`
Expected: BUILD SUCCEEDED

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/Sources/SessionWindow/SessionWindowView.swift apps/desktop/Sources/StatusBubble/StatusBubbleView.swift apps/desktop/Sources/StatusBubble/StatusBubbleController.swift
git commit -m "refactor(desktop): rewrite SessionWindowView + StatusBubbleView with ViewModel + Theme"
```

---

## Task 12: 重写 Settings 模块

**Files:**
- Create: `apps/desktop/Sources/Settings/SettingsView.swift`
- Modify: `apps/desktop/Sources/Settings/AgentSettingsView.swift`
- Modify: `apps/desktop/Sources/Settings/ShortcutSettingsView.swift`

- [ ] **Step 1: Create SettingsView TabView container**

```swift
// apps/desktop/Sources/Settings/SettingsView.swift
import SwiftUI

struct SettingsView: View {
    @Bindable var settingsViewModel: AgentSettingsViewModel
    let shortcutActions: [PromptAction]

    var body: some View {
        TabView {
            Tab("模型", systemImage: "cpu") {
                AgentSettingsView(viewModel: settingsViewModel)
            }
            Tab("快捷键", systemImage: "keyboard") {
                ShortcutSettingsView(actions: shortcutActions)
            }
        }
        .frame(width: 580, height: 480)
    }
}
```

- [ ] **Step 2: Rewrite AgentSettingsView with ViewModel**

```swift
// apps/desktop/Sources/Settings/AgentSettingsView.swift
import SwiftUI

struct AgentSettingsView: View {
    @Bindable var viewModel: AgentSettingsViewModel
    @Environment(\.appTheme) private var theme

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: theme.spacing.xl) {
                GroupBox("模型") {
                    VStack(alignment: .leading, spacing: theme.spacing.md) {
                        TextField("gpt-5-mini", text: $viewModel.model)

                        Picker("接口", selection: $viewModel.api) {
                            ForEach(AgentAPIType.allCases) { api in
                                Text(api.title).tag(api)
                            }
                        }

                        TextField("https://api.openai.com/v1", text: $viewModel.baseURL)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }

                GroupBox("认证") {
                    TextField("sk-...", text: $viewModel.apiKey)
                        .privacySensitive()
                        .textFieldStyle(.roundedBorder)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                VStack(alignment: .leading, spacing: theme.spacing.sm) {
                    Text("设置会自动保存到 `~/.spotAgent/settings.json`。")
                        .foregroundStyle(theme.colors.textSecondary)

                    if let saveErrorMessage = viewModel.saveErrorMessage {
                        Text(saveErrorMessage)
                            .foregroundStyle(theme.colors.error)
                    }
                }
            }
            .padding(theme.spacing.xl)
        }
        .frame(width: 520)
    }
}
```

- [ ] **Step 3: Update ShortcutSettingsView with Theme**

```swift
// apps/desktop/Sources/Settings/ShortcutSettingsView.swift
import KeyboardShortcuts
import SwiftUI

struct ShortcutSettingsView: View {
    let actions: [PromptAction]
    @Environment(\.appTheme) private var theme

    var body: some View {
        Form {
            Section("全局快捷键") {
                KeyboardShortcuts.Recorder("唤起 PromptPanel", name: .showPromptPanel)
            }

            Section("PromptAction 快捷键") {
                if actions.isEmpty {
                    Text("当前没有可配置的 PromptAction。")
                        .foregroundStyle(theme.colors.textSecondary)
                } else {
                    ForEach(actions) { action in
                        KeyboardShortcuts.Recorder(action.title, name: action.shortcutName)
                    }
                }
            }
        }
        .formStyle(.grouped)
        .padding(theme.spacing.xl)
    }
}
```

- [ ] **Step 4: Run build**

Run: `bash ./scripts/swiftw build`
Expected: BUILD SUCCEEDED

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/Sources/Settings/
git commit -m "refactor(desktop): rewrite Settings module with TabView + ViewModel + Theme"
```

---

## Task 13: 重写 HandAgentApp 入口 + 删除旧代码

**Files:**
- Modify: `apps/desktop/HandAgentApp.swift`
- Modify: `apps/desktop/Sources/Coordinator/AppCoordinator.swift`
- Delete: `apps/desktop/Sources/SessionWindow/SessionWindowController.swift`

Session 窗口由 AppCoordinator 通过 NSWindow + NSHostingController 直接管理（和 PromptPanel/StatusBubble 一致），避免 SwiftUI WindowGroup 在非 View 代码中无法调用 `openWindow` 的限制。Settings 窗口使用 SwiftUI `Window` scene。

- [ ] **Step 1: Rewrite HandAgentApp**

```swift
// apps/desktop/HandAgentApp.swift
import AppKit
import KeyboardShortcuts
import SwiftUI

@main
struct HandAgentApp: App {
    @State private var coordinator = AppCoordinator()

    var body: some Scene {
        Window("设置", id: "settings") {
            SettingsView(
                settingsViewModel: coordinator.makeSettingsViewModel(),
                shortcutActions: coordinator.makeShortcutActions()
            )
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

- [ ] **Step 2: Update AppCoordinator — auto-bootstrap + session window management**

在 `AppCoordinator.swift` 中：

1. 修改 `init` 使非测试模式自动 bootstrap：

```swift
    init(skipServerStart: Bool = false) {
        self.skipServerStart = skipServerStart
        self.agentServerService = AgentServerService()
        self.sessionRegistry = SessionRegistry()
        self.settingsStore = AgentSettingsStore()
        if !skipServerStart {
            bootstrap()
        }
    }
```

2. 添加 `sessionWindows` 字典和窗口创建逻辑到 `handleSubmitPrompt`：

```swift
    @ObservationIgnored private var sessionWindows: [String: NSWindow] = []
```

在 `handleSubmitPrompt` 的 `viewModel.start(...)` 之前添加窗口创建：

```swift
        let hosting = NSHostingController(rootView: SessionWindowView(viewModel: viewModel))
        let window = NSWindow(contentViewController: hosting)
        window.title = "Session \(sessionID.prefix(8))"
        window.setContentSize(NSSize(width: 760, height: 560))
        window.center()

        NotificationCenter.default.addObserver(
            forName: NSWindow.willCloseNotification,
            object: window,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.send(.sessionClosed(sessionID))
                self?.sessionWindows.removeValue(forKey: sessionID)
            }
        }

        sessionWindows[sessionID] = window
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
```

3. 更新 `handleStatusBubbleTap` 使其能聚焦已有窗口：

```swift
    private func handleStatusBubbleTap(_ sessionID: String?) {
        if let sessionID, let window = sessionWindows[sessionID] {
            window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }
        promptPanelController.show()
    }
```

4. 添加 `shutdown` 中的窗口清理：

```swift
    func shutdown() {
        agentServerService.stop()
        sessionWindows.values.forEach { $0.close() }
        sessionWindows.removeAll()
    }
```

5. 更新 `handleSessionClosed` 中停止 viewModel：

```swift
    private func handleSessionClosed(_ sessionID: String) {
        let viewModel = sessionViewModels.removeValue(forKey: sessionID)
        viewModel?.stop()

        NSApp.setActivationPolicy(
            activationPolicy.policyAfterUpdatingOpenSessionWindows(by: -1)
        )

        sessionRegistry.upsert(
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

- [ ] **Step 3: Delete SessionWindowController**

```bash
rm apps/desktop/Sources/SessionWindow/SessionWindowController.swift
```

- [ ] **Step 4: Run build**

Run: `bash ./scripts/swiftw build`
Expected: BUILD SUCCEEDED

- [ ] **Step 5: Run all tests**

Run: `bash ./scripts/swiftw test`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(desktop): rewrite HandAgentApp entry point, delete AppDelegate and SessionWindowController"
```

---

## Task 14: 最终验证 + 文档更新

**Files:**
- Modify: `apps/desktop/desktop.md`

- [ ] **Step 1: Run full test suite**

Run: `bash ./scripts/swiftw test`
Expected: ALL PASS

- [ ] **Step 2: Run build**

Run: `bash ./scripts/swiftw build`
Expected: BUILD SUCCEEDED

- [ ] **Step 3: Run TypeScript tests**

Run: `bash ./scripts/test.sh`
Expected: ALL PASS

- [ ] **Step 4: Update desktop.md architecture doc**

更新 `apps/desktop/desktop.md` 反映新架构：

- 删除 AppDelegate 相关描述
- 添加 AppCoordinator 说明
- 添加 Theme 层说明
- 更新模块职责描述（View/ViewModel/Styles 三层）
- 更新目录结构

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/desktop.md
git commit -m "docs(desktop): update architecture doc for new ViewModel + Theme + Coordinator architecture"
```

---

## 执行顺序总结

| Task | 内容 | 依赖 |
|------|------|------|
| 1 | Theme 基础设施 | 无 |
| 2 | SessionRegistry → @Observable | 无 |
| 3 | AgentSettingsStore → @Observable | 无 |
| 4 | SessionViewModel → @Observable | 无 |
| 5 | AgentSettingsViewModel | Task 3 |
| 6 | PromptPanelViewModel | 无 |
| 7 | StatusBubbleViewModel | Task 2 |
| 8 | Styles 文件 | Task 1 |
| 9 | AppCoordinator | Task 2, 4, 6, 7 |
| 10 | PromptPanelView + Controller 重写 | Task 6, 8 |
| 11 | SessionWindowView + StatusBubbleView 重写 | Task 4, 7, 8 |
| 12 | Settings 模块重写 | Task 5, 8 |
| 13 | HandAgentApp 入口重写 + 删除旧代码 | Task 9, 10, 11, 12 |
| 14 | 最终验证 + 文档 | Task 13 |

Task 1-4 可并行执行（无依赖）。Task 5-8 可在对应依赖完成后并行。Task 9 需要等 2/4/6/7 完成。Task 10-12 可在 Task 9 后并行。Task 13 是最终汇合点。

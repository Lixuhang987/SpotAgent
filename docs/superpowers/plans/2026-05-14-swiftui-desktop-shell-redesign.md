# SwiftUI Desktop Shell Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 `AppKit + SwiftUI` 重写桌面交互壳，移除 `WKWebView`，落地 `StatusBubble + PromptPanel + 多 SessionWindow`，并为 `agent-server` 增加 session 管理抽象。

**Architecture:** 宿主层拆成 `AppServices + Controller + ViewModel`。Swift 只通过 `WebSocket + SessionMessage` 与 TS 边界交互；每个 `SessionWindow` 自治持有消息与连接状态；全局仅通过 `SessionRegistry` 聚合轻量摘要给 `StatusBubble` 和唤起逻辑使用。

**Tech Stack:** SwiftUI, AppKit, Carbon global hotkey, WebSocket (`URLSessionWebSocketTask`), TypeScript, Vitest, SwiftPM

---

## File Structure

- Create: `apps/desktop/Sources/AppServices/AppServices.swift`
- Create: `apps/desktop/Sources/AppServices/HotkeyService.swift`
- Create: `apps/desktop/Sources/AppServices/AgentServerService.swift`
- Create: `apps/desktop/Sources/AppServices/SessionRegistry.swift`
- Create: `apps/desktop/Sources/PromptPanel/PromptPanelController.swift`
- Create: `apps/desktop/Sources/PromptPanel/PromptPanelView.swift`
- Create: `apps/desktop/Sources/PromptPanel/PromptAction.swift`
- Create: `apps/desktop/Sources/SessionWindow/SessionWindowController.swift`
- Create: `apps/desktop/Sources/SessionWindow/SessionWindowView.swift`
- Create: `apps/desktop/Sources/SessionWindow/SessionViewModel.swift`
- Create: `apps/desktop/Sources/SessionWindow/SessionSocketClient.swift`
- Create: `apps/desktop/Sources/StatusBubble/StatusBubbleController.swift`
- Create: `apps/desktop/Sources/StatusBubble/StatusBubbleView.swift`
- Create: `apps/desktop/TestsSwift/SessionRegistryTests.swift`
- Create: `apps/desktop/TestsSwift/PromptActionTests.swift`
- Modify: `apps/desktop/HandAgentApp.swift`
- Modify: `apps/agent-server/src/SessionManager.ts`
- Create: `apps/agent-server/src/SessionStore.ts`
- Modify: `apps/agent-server/src/SessionManager.test.ts`
- Modify: `apps/agent-server/src/server.ts`
- Modify: `packages/core/src/protocol/SessionMessage.ts`
- Modify: `apps/desktop/desktop.md`
- Modify: `apps/apps.md`
- Modify: `handAgent.md`
- Modify: `AGENTS.md`
- Delete: `apps/desktop/Web/App.tsx`
- Delete: `apps/desktop/Web/BubbleList.tsx`
- Delete: `apps/desktop/Web/PromptBox.tsx`
- Delete: `apps/desktop/Web/bridge.ts`
- Delete: `apps/desktop/Web/main.tsx`
- Delete: `apps/desktop/Web/sessionState.ts`
- Delete: `apps/desktop/Web/sessionState.test.ts`
- Delete: `apps/desktop/Web/index.html`
- Delete: `apps/desktop/Web/build.mjs`
- Delete: `apps/desktop/Web/package.json`
- Delete: `apps/desktop/Web/tsconfig.json`
- Delete: `apps/desktop/Web/vitest.config.ts`
- Delete: `apps/desktop/Web/dist/app.js`

### Task 1: 拆出宿主服务骨架

**Files:**
- Modify: `apps/desktop/HandAgentApp.swift`
- Create: `apps/desktop/Sources/AppServices/AppServices.swift`
- Create: `apps/desktop/Sources/AppServices/HotkeyService.swift`
- Create: `apps/desktop/Sources/AppServices/AgentServerService.swift`
- Create: `apps/desktop/Sources/AppServices/SessionRegistry.swift`
- Test: `apps/desktop/TestsSwift/SessionRegistryTests.swift`

- [ ] **Step 1: 先写 `SessionRegistry` 的失败测试**

```swift
import XCTest
@testable import HandAgentDesktop

final class SessionRegistryTests: XCTestCase {
    func testPrefersMostRecentRunningSessionForBubbleTarget() {
        let registry = SessionRegistry()

        registry.upsert(
            SessionSummary(sessionId: "s1", isRunning: false, latestSummary: "idle", lastActiveAt: .distantPast, windowIsOpen: true)
        )
        registry.upsert(
            SessionSummary(sessionId: "s2", isRunning: true, latestSummary: "running", lastActiveAt: .now, windowIsOpen: true)
        )

        XCTAssertEqual(registry.primarySessionID, "s2")
    }
}
```

- [ ] **Step 2: 运行测试，确认当前失败**

Run: `swift test --filter SessionRegistryTests/testPrefersMostRecentRunningSessionForBubbleTarget`
Expected: FAIL，提示 `SessionRegistry` 或 `SessionSummary` 未定义。

- [ ] **Step 3: 增加宿主服务与 session 摘要实现**

```swift
import Foundation

struct SessionSummary: Equatable {
    let sessionId: String
    let isRunning: Bool
    let latestSummary: String
    let lastActiveAt: Date
    let windowIsOpen: Bool
}

@MainActor
final class SessionRegistry: ObservableObject {
    @Published private(set) var summaries: [String: SessionSummary] = [:]
    @Published private(set) var recentSessionIDs: [String] = []

    func upsert(_ summary: SessionSummary) {
        summaries[summary.sessionId] = summary
        recentSessionIDs.removeAll { $0 == summary.sessionId }
        recentSessionIDs.insert(summary.sessionId, at: 0)
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

- [ ] **Step 4: 拆出 `AppServices` 与热键/server 服务骨架**

```swift
import Foundation

@MainActor
final class AppServices {
    let hotkeyService: HotkeyService
    let agentServerService: AgentServerService
    let sessionRegistry: SessionRegistry

    init() {
        self.sessionRegistry = SessionRegistry()
        self.hotkeyService = HotkeyService()
        self.agentServerService = AgentServerService()
    }
}
```

```swift
import Foundation

final class AgentServerService {
    private(set) var process: Process?

    func start() throws {}
    func stop() {
        process?.terminate()
        process = nil
    }
}
```

```swift
import Foundation

final class HotkeyService {
    var onTrigger: (() -> Void)?

    func start() -> Bool { true }
    func stop() {}
}
```

- [ ] **Step 5: 用新骨架收敛 `HandAgentApp.swift`**

```swift
@main
struct HandAgentApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        Settings { EmptyView() }
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private let services = AppServices()

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        _ = services.hotkeyService.start()
        try? services.agentServerService.start()
    }

    func applicationWillTerminate(_ notification: Notification) {
        services.hotkeyService.stop()
        services.agentServerService.stop()
    }
}
```

- [ ] **Step 6: 运行测试确认通过**

Run: `swift test --filter SessionRegistryTests`
Expected: PASS，显示 `Executed 1 test, with 0 failures`。

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/HandAgentApp.swift apps/desktop/Sources/AppServices apps/desktop/TestsSwift/SessionRegistryTests.swift
git commit -m "refactor: split desktop app services shell"
```

### Task 2: 实现 Raycast 风格 PromptPanel 与 action 注册接口

**Files:**
- Create: `apps/desktop/Sources/PromptPanel/PromptPanelController.swift`
- Create: `apps/desktop/Sources/PromptPanel/PromptPanelView.swift`
- Create: `apps/desktop/Sources/PromptPanel/PromptAction.swift`
- Create: `apps/desktop/TestsSwift/PromptActionTests.swift`
- Modify: `apps/desktop/HandAgentApp.swift`

- [ ] **Step 1: 先写 action 过滤测试**

```swift
import XCTest
@testable import HandAgentDesktop

final class PromptActionTests: XCTestCase {
    func testFiltersActionsByKeyword() {
        let actions = [
            PromptAction(id: "selection-text", title: "插入选区文本", keywords: ["selection", "text"], shortcut: "Tab") { _ in .noAttachment },
            PromptAction(id: "selection-image", title: "插入选区图片", keywords: ["selection", "image"], shortcut: "Shift+Tab") { _ in .noAttachment }
        ]

        let result = PromptAction.filter(actions, query: "image")
        XCTAssertEqual(result.map(\.id), ["selection-image"])
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `swift test --filter PromptActionTests/testFiltersActionsByKeyword`
Expected: FAIL，提示 `PromptAction` 未定义。

- [ ] **Step 3: 定义 action 接口与最小过滤逻辑**

```swift
import Foundation

struct PromptActionContext {
    let draft: String
}

enum PromptAttachmentResult: Equatable {
    case noAttachment
    case textToken(String)
}

struct PromptAction {
    let id: String
    let title: String
    let keywords: [String]
    let shortcut: String
    let perform: (PromptActionContext) -> PromptAttachmentResult

    static func filter(_ actions: [PromptAction], query: String) -> [PromptAction] {
        let normalized = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !normalized.isEmpty else { return actions }
        return actions.filter { action in
            action.title.lowercased().contains(normalized) ||
            action.keywords.contains(where: { $0.lowercased().contains(normalized) })
        }
    }
}
```

- [ ] **Step 4: 实现 `PromptPanelController` 和 SwiftUI 面板内容**

```swift
import AppKit
import SwiftUI

@MainActor
final class PromptPanelController: NSObject {
    private var panel: NSPanel?
    private(set) var lastFrontmostAppBundleID: String?

    func show() {
        if panel == nil {
            let contentView = PromptPanelView()
            let hosting = NSHostingView(rootView: contentView)
            let panel = NSPanel(contentRect: NSRect(x: 0, y: 0, width: 720, height: 420), styleMask: [.nonactivatingPanel], backing: .buffered, defer: false)
            panel.contentView = hosting
            self.panel = panel
        }
        NSApp.activate(ignoringOtherApps: true)
        panel?.makeKeyAndOrderFront(nil)
    }

    func hide() {
        panel?.orderOut(nil)
    }
}
```

```swift
import SwiftUI

struct PromptPanelView: View {
    @State private var draft = ""
    let actions: [PromptAction] = []

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            TextField("输入你的请求", text: $draft)
                .textFieldStyle(.roundedBorder)
            ForEach(PromptAction.filter(actions, query: draft), id: \.id) { action in
                HStack {
                    Text(action.title)
                    Spacer()
                    Text(action.shortcut).foregroundStyle(.secondary)
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
```

- [ ] **Step 5: 把热键回调接到 `PromptPanelController`**

```swift
@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private let services = AppServices()
    private let promptPanelController = PromptPanelController()

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        services.hotkeyService.onTrigger = { [weak self] in
            Task { @MainActor in self?.promptPanelController.show() }
        }
        _ = services.hotkeyService.start()
        try? services.agentServerService.start()
    }
}
```

- [ ] **Step 6: 运行 Swift 测试和构建**

Run: `swift test --filter PromptActionTests && swift build`
Expected: PASS；`swift build` 成功结束，无编译错误。

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/HandAgentApp.swift apps/desktop/Sources/PromptPanel apps/desktop/TestsSwift/PromptActionTests.swift
git commit -m "feat: add prompt panel shell and action registry"
```

### Task 3: 落地 SessionWindow、协议客户端与 ReAct loop 渲染

**Files:**
- Create: `apps/desktop/Sources/SessionWindow/SessionSocketClient.swift`
- Create: `apps/desktop/Sources/SessionWindow/SessionViewModel.swift`
- Create: `apps/desktop/Sources/SessionWindow/SessionWindowController.swift`
- Create: `apps/desktop/Sources/SessionWindow/SessionWindowView.swift`
- Modify: `packages/core/src/protocol/SessionMessage.ts`
- Modify: `apps/desktop/HandAgentApp.swift`

- [ ] **Step 1: 先定义 Swift 侧协议 DTO 与 reducer 的失败测试**

```swift
import XCTest
@testable import HandAgentDesktop

final class SessionViewModelTests: XCTestCase {
    func testAppendsAssistantDeltaIntoStreamingMessage() {
        let model = SessionViewModel(sessionID: "session-1", socketClient: .noop)

        model.handle(.assistantMessageStart(messageID: "m1"))
        model.handle(.assistantMessageDelta(messageID: "m1", text: "hello"))

        XCTAssertEqual(model.messages.last?.text, "hello")
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `swift test --filter SessionViewModelTests/testAppendsAssistantDeltaIntoStreamingMessage`
Expected: FAIL，提示 `SessionViewModel` 未定义。

- [ ] **Step 3: 定义 `SessionViewModel` 与最小消息 reducer**

```swift
import Foundation

struct SessionBubble: Identifiable, Equatable {
    let id: String
    let role: String
    var text: String
}

@MainActor
final class SessionViewModel: ObservableObject {
    @Published private(set) var messages: [SessionBubble] = []
    @Published private(set) var status: String = "idle"
    let sessionID: String
    let socketClient: SessionSocketClient

    init(sessionID: String, socketClient: SessionSocketClient) {
        self.sessionID = sessionID
        self.socketClient = socketClient
    }

    func handle(_ event: SessionEvent) {
        switch event {
        case .assistantMessageStart(let messageID):
            messages.append(SessionBubble(id: messageID, role: "assistant", text: ""))
            status = "running"
        case .assistantMessageDelta(let messageID, let text):
            guard let index = messages.firstIndex(where: { $0.id == messageID }) else { return }
            messages[index].text += text
        case .assistantMessageEnd:
            status = "idle"
        }
    }
}
```

- [ ] **Step 4: 实现窗口控制器、WebSocket client 和 SwiftUI 会话窗口**

```swift
import AppKit
import SwiftUI

@MainActor
final class SessionWindowController: NSWindowController {
    init(viewModel: SessionViewModel) {
        let view = SessionWindowView(viewModel: viewModel)
        let hosting = NSHostingController(rootView: view)
        let window = NSWindow(contentViewController: hosting)
        window.title = "Session \(viewModel.sessionID)"
        super.init(window: window)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { nil }
}
```

```swift
import SwiftUI

struct SessionWindowView: View {
    @ObservedObject var viewModel: SessionViewModel

    var body: some View {
        VStack(spacing: 0) {
            Text("状态：\(viewModel.status)")
            ScrollView {
                LazyVStack(alignment: .leading) {
                    ForEach(viewModel.messages) { message in
                        Text(message.text)
                            .frame(maxWidth: .infinity, alignment: message.role == "user" ? .trailing : .leading)
                    }
                }
            }
            TextField("继续追问", text: .constant(""))
                .textFieldStyle(.roundedBorder)
        }
        .padding(16)
    }
}
```

- [ ] **Step 5: 从 `PromptPanel` 提交后真正创建 `SessionWindow`**

```swift
@MainActor
final class PromptPanelController: NSObject {
    var onSubmit: ((String, [PromptAttachmentResult]) -> Void)?

    func submit(draft: String, attachments: [PromptAttachmentResult]) {
        onSubmit?(draft, attachments)
        hide()
    }
}
```

```swift
promptPanelController.onSubmit = { [weak self] draft, attachments in
    let sessionID = UUID().uuidString
    let client = SessionSocketClient(sessionID: sessionID, serverURL: URL(string: "ws://127.0.0.1:4317/api/session")!)
    let viewModel = SessionViewModel(sessionID: sessionID, socketClient: client)
    let controller = SessionWindowController(viewModel: viewModel)
    controller.showWindow(nil)
    self?.services.sessionRegistry.upsert(
        SessionSummary(sessionId: sessionID, isRunning: true, latestSummary: draft, lastActiveAt: .now, windowIsOpen: true)
    )
}
```

- [ ] **Step 6: 运行 Swift 测试和构建**

Run: `swift test --filter SessionViewModelTests && swift build`
Expected: PASS；会话窗口相关 Swift 文件编译通过。

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/Sources/SessionWindow apps/desktop/HandAgentApp.swift packages/core/src/protocol/SessionMessage.ts
git commit -m "feat: add swift session windows and websocket client"
```

### Task 4: 增加 StatusBubble 与全局回跳规则

**Files:**
- Create: `apps/desktop/Sources/StatusBubble/StatusBubbleController.swift`
- Create: `apps/desktop/Sources/StatusBubble/StatusBubbleView.swift`
- Modify: `apps/desktop/Sources/AppServices/SessionRegistry.swift`
- Modify: `apps/desktop/HandAgentApp.swift`
- Test: `apps/desktop/TestsSwift/SessionRegistryTests.swift`

- [ ] **Step 1: 为回跳规则补测试**

```swift
func testFallsBackToMostRecentWindowWhenNoRunningSessionExists() {
    let registry = SessionRegistry()
    registry.upsert(SessionSummary(sessionId: "s1", isRunning: false, latestSummary: "older", lastActiveAt: .distantPast, windowIsOpen: true))
    registry.upsert(SessionSummary(sessionId: "s2", isRunning: false, latestSummary: "newer", lastActiveAt: .now, windowIsOpen: true))

    XCTAssertEqual(registry.primarySessionID, "s2")
}
```

- [ ] **Step 2: 运行测试确认规则覆盖到位**

Run: `swift test --filter SessionRegistryTests`
Expected: PASS 现有测试，或若新增逻辑未实现则 FAIL。

- [ ] **Step 3: 实现 `StatusBubble` 视图和控制器**

```swift
import AppKit
import SwiftUI

@MainActor
final class StatusBubbleController {
    private let registry: SessionRegistry
    private var window: NSWindow?
    var onTap: ((String?) -> Void)?

    init(registry: SessionRegistry) {
        self.registry = registry
    }

    func show() {
        if window == nil {
            let view = StatusBubbleView(registry: registry) {
                self.onTap?(registry.primarySessionID)
            }
            let hosting = NSHostingController(rootView: view)
            let window = NSWindow(contentViewController: hosting)
            self.window = window
        }
        window?.makeKeyAndOrderFront(nil)
    }
}
```

```swift
import SwiftUI

struct StatusBubbleView: View {
    @ObservedObject var registry: SessionRegistry
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 4) {
                Text(registry.primarySessionID == nil ? "Idle" : "Running")
                Text(registry.primarySessionID.flatMap { registry.summaries[$0]?.latestSummary } ?? "点击开始")
                    .lineLimit(2)
            }
            .padding(12)
        }
        .buttonStyle(.plain)
    }
}
```

- [ ] **Step 4: 把气泡点击接到“回到 session 或打开 PromptPanel”**

```swift
statusBubbleController.onTap = { [weak self] sessionID in
    if let sessionID {
        self?.focusSessionWindow(with: sessionID)
    } else {
        self?.promptPanelController.show()
    }
}
```

- [ ] **Step 5: 运行 Swift 构建验证**

Run: `swift test --filter SessionRegistryTests && swift build`
Expected: PASS；状态气泡代码编译成功。

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/Sources/StatusBubble apps/desktop/Sources/AppServices/SessionRegistry.swift apps/desktop/HandAgentApp.swift apps/desktop/TestsSwift/SessionRegistryTests.swift
git commit -m "feat: add desktop status bubble routing"
```

### Task 5: 为 agent-server 增加 session store 抽象

**Files:**
- Create: `apps/agent-server/src/SessionStore.ts`
- Modify: `apps/agent-server/src/SessionManager.ts`
- Modify: `apps/agent-server/src/SessionManager.test.ts`
- Modify: `apps/agent-server/src/server.ts`

- [ ] **Step 1: 先写 session store 接口测试**

```ts
it("lists sessions and returns history through the store abstraction", async () => {
  const store = new InMemorySessionStore();
  store.save({ sessionId: "session-1", messages: [{ role: "user", content: "hello" }], updatedAt: "2026-05-14T00:00:00.000Z" });

  expect(store.listSessions()).toEqual([
    expect.objectContaining({ sessionId: "session-1" }),
  ]);
  expect(store.getSessionHistory("session-1")).toEqual([
    { role: "user", content: "hello" },
  ]);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm exec vitest run apps/agent-server/src/SessionManager.test.ts`
Expected: FAIL，提示 `InMemorySessionStore` 未定义。

- [ ] **Step 3: 定义 store 抽象并接入 `SessionManager`**

```ts
import type { AgentMessage } from "../../../packages/core/src/runtime/AgentMessage.ts";

export type SessionRecord = {
  sessionId: string;
  messages: AgentMessage[];
  updatedAt: string;
};

export interface SessionStore {
  save(record: SessionRecord): void;
  get(sessionId: string): SessionRecord | null;
  listSessions(): Array<Pick<SessionRecord, "sessionId" | "updatedAt">>;
  getSessionHistory(sessionId: string): AgentMessage[];
}

export class InMemorySessionStore implements SessionStore {
  private readonly records = new Map<string, SessionRecord>();
  save(record: SessionRecord) { this.records.set(record.sessionId, record); }
  get(sessionId: string) { return this.records.get(sessionId) ?? null; }
  listSessions() { return [...this.records.values()].map(({ sessionId, updatedAt }) => ({ sessionId, updatedAt })); }
  getSessionHistory(sessionId: string) { return this.records.get(sessionId)?.messages ?? []; }
}
```

```ts
export class SessionManager {
  constructor(
    private readonly runtime: RuntimeLike,
    private readonly store: SessionStore = new InMemorySessionStore(),
    private readonly pushMessage: PushMessage = () => {},
    options: SessionManagerOptions = {},
  ) {}
}
```

- [ ] **Step 4: 用 store 替换内部 `Map` 并补查询接口**

```ts
getSessionMessages(sessionId: string): AgentMessage[] {
  return this.store.getSessionHistory(sessionId);
}

listSessions() {
  return this.store.listSessions();
}

getSessionHistory(sessionId: string) {
  return this.store.getSessionHistory(sessionId);
}
```

- [ ] **Step 5: 运行 agent-server 测试**

Run: `pnpm exec vitest run apps/agent-server/src/SessionManager.test.ts`
Expected: PASS，包含新增 `SessionStore` 相关断言。

- [ ] **Step 6: Commit**

```bash
git add apps/agent-server/src/SessionStore.ts apps/agent-server/src/SessionManager.ts apps/agent-server/src/SessionManager.test.ts apps/agent-server/src/server.ts
git commit -m "refactor: add session store abstraction"
```

### Task 6: 移除旧 Web 主链路并更新验证命令

**Files:**
- Delete: `apps/desktop/Web/*`
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `handAgent.md`
- Modify: `apps/apps.md`
- Modify: `apps/desktop/desktop.md`

- [ ] **Step 1: 删除不再使用的 Web 入口文件**

```bash
rm apps/desktop/Web/App.tsx
rm apps/desktop/Web/BubbleList.tsx
rm apps/desktop/Web/PromptBox.tsx
rm apps/desktop/Web/bridge.ts
rm apps/desktop/Web/main.tsx
rm apps/desktop/Web/sessionState.ts
rm apps/desktop/Web/sessionState.test.ts
rm apps/desktop/Web/index.html
rm apps/desktop/Web/build.mjs
rm apps/desktop/Web/package.json
rm apps/desktop/Web/tsconfig.json
rm apps/desktop/Web/vitest.config.ts
rm apps/desktop/Web/dist/app.js
```

- [ ] **Step 2: 更新仓库级文档中的架构描述**

```md
- `apps/desktop`：负责 macOS 宿主生命周期、状态气泡、PromptPanel、SessionWindow 与本地 agent-server 生命周期。
- Swift 与 TS 的边界统一为 `WebSocket + SessionMessage`。
- `apps/desktop/Web` 已移除，原有 `WKWebView` 主链路废弃。
```

- [ ] **Step 3: 更新提交前验证命令**

```md
- `bash ./scripts/test.sh`
- `bash ./scripts/swiftw test`
- `bash ./scripts/swiftw build`
```

- [ ] **Step 4: 运行全量验证**

Run: `bash ./scripts/test.sh && bash ./scripts/swiftw test && bash ./scripts/swiftw build`
Expected: 全部 PASS；若某条失败，先修复失败项再继续。

- [ ] **Step 5: Commit**

```bash
git add README.md AGENTS.md handAgent.md apps/apps.md apps/desktop/desktop.md
git add -u apps/desktop/Web
git commit -m "refactor: remove webview desktop shell"
```

### Task 7: 收尾检查与手工验收

**Files:**
- Modify: `docs/manual-qa.md`

- [ ] **Step 1: 补充手工验收步骤**

```md
1. 启动桌面应用后确认状态气泡显示在桌面边缘。
2. 按全局热键，确认 PromptPanel 打开且输入框自动聚焦。
3. 在 PromptPanel 输入 prompt 并回车，确认新建 SessionWindow。
4. 观察 assistant 流式输出，确认 StatusBubble 同步显示最新摘要。
5. 点击 StatusBubble，确认优先回到 running session；无 running session 时回最近活跃窗口。
6. 关闭 PromptPanel，确认焦点返还到原前台应用。
7. 打开两个 SessionWindow，确认 `Command+\`` 可切换。
```

- [ ] **Step 2: 执行手工验收**

Run: `swift build`
Expected: 构建成功，然后按 `docs/manual-qa.md` 完成手工验证。

- [ ] **Step 3: Commit**

```bash
git add docs/manual-qa.md
git commit -m "docs: add swiftui desktop shell qa checklist"
```

## Self-Review

- Spec coverage:
  - `StatusBubble`、`PromptPanel`、`SessionWindow` 各自有独立任务。
  - `HotkeyService`、`AgentServerService`、`SessionRegistry` 的宿主拆分在 Task 1 与 Task 4。
  - `SessionManager` 的 session store 抽象在 Task 5。
  - 旧 `WKWebView`/Web 链路清理与文档更新在 Task 6。
- Placeholder scan:
  - 未使用 `TODO`、`TBD`、`later` 等占位词。
  - 每个代码步骤都给了具体代码或命令。
- Type consistency:
  - Swift 侧统一使用 `SessionSummary`、`PromptAction`、`SessionViewModel`、`SessionSocketClient`。
  - TS 侧统一使用 `SessionStore`、`InMemorySessionStore`、`SessionRecord`。

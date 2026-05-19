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
    func testViewModelErrorUpdatesRegistrySummary() {
        let registry = SessionRegistry()
        let lifecycle = SessionLifecycle(
            registry: registry,
            windowPresenter: SpySessionWindowPresenter(),
            agentServerURL: URL(string: "ws://127.0.0.1:0/noop")!,
            activationPolicy: AppActivationPolicyCoordinator(),
            setActivationPolicy: { _ in }
        )
        let prompt = PromptSubmission.compose(draft: "hello", attachments: [])!
        let id = lifecycle.open(prompt: prompt, startupError: nil) { _ in }

        lifecycle.viewModels[id]?.handle(
            .error(messageID: "error-1", message: "agent failed", timestamp: "2026-05-20T00:00:00Z")
        )

        XCTAssertEqual(registry.summaries[id]?.isRunning, false)
        XCTAssertEqual(registry.summaries[id]?.latestSummary, "agent failed")
        XCTAssertEqual(registry.summaries[id]?.windowIsOpen, true)
    }

    @MainActor
    func testAssistantMessageEndUpdatesRegistrySummaryToIdle() {
        let registry = SessionRegistry()
        let lifecycle = SessionLifecycle(
            registry: registry,
            windowPresenter: SpySessionWindowPresenter(),
            agentServerURL: URL(string: "ws://127.0.0.1:0/noop")!,
            activationPolicy: AppActivationPolicyCoordinator(),
            setActivationPolicy: { _ in }
        )
        let prompt = PromptSubmission.compose(draft: "hello", attachments: [])!
        let id = lifecycle.open(prompt: prompt, startupError: nil) { _ in }

        lifecycle.viewModels[id]?.handle(
            .assistantMessageStart(messageID: "assistant-1", timestamp: "2026-05-20T00:00:00Z")
        )
        lifecycle.viewModels[id]?.handle(
            .assistantMessageDelta(messageID: "assistant-1", text: "done", timestamp: "2026-05-20T00:00:01Z")
        )
        lifecycle.viewModels[id]?.handle(
            .assistantMessageEnd(messageID: "assistant-1", status: "completed", timestamp: "2026-05-20T00:00:02Z")
        )

        XCTAssertEqual(registry.summaries[id]?.isRunning, false)
        XCTAssertEqual(registry.summaries[id]?.latestSummary, "done")
        XCTAssertEqual(registry.summaries[id]?.windowIsOpen, true)
    }

    @MainActor
    func testStatusEventsUpdateRegistryRunningStateWhilePreservingSummary() {
        let registry = SessionRegistry()
        let lifecycle = SessionLifecycle(
            registry: registry,
            windowPresenter: SpySessionWindowPresenter(),
            agentServerURL: URL(string: "ws://127.0.0.1:0/noop")!,
            activationPolicy: AppActivationPolicyCoordinator(),
            setActivationPolicy: { _ in }
        )
        let prompt = PromptSubmission.compose(draft: "hello", attachments: [])!
        let id = lifecycle.open(prompt: prompt, startupError: nil) { _ in }

        lifecycle.viewModels[id]?.handle(.status(value: "idle"))

        XCTAssertEqual(registry.summaries[id]?.isRunning, false)
        XCTAssertEqual(registry.summaries[id]?.latestSummary, "hello")

        lifecycle.viewModels[id]?.handle(.status(value: "running"))

        XCTAssertEqual(registry.summaries[id]?.isRunning, true)
        XCTAssertEqual(registry.summaries[id]?.latestSummary, "hello")
        XCTAssertEqual(registry.summaries[id]?.windowIsOpen, true)
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

    @MainActor
    func testRestoreExistingSessionFocusesOpenWindowWithoutSubmittingPrompt() {
        let registry = SessionRegistry()
        let presenter = SpySessionWindowPresenter()
        let lifecycle = SessionLifecycle(
            registry: registry,
            windowPresenter: presenter,
            agentServerURL: URL(string: "ws://127.0.0.1:0/noop")!,
            activationPolicy: AppActivationPolicyCoordinator(),
            setActivationPolicy: { _ in }
        )

        let prompt = PromptSubmission.compose(draft: "hello", attachments: [])!
        let sessionID = lifecycle.open(prompt: prompt, startupError: nil) { _ in }

        lifecycle.close(sessionID)
        XCTAssertTrue(lifecycle.restore(sessionID: sessionID))
        XCTAssertEqual(lifecycle.viewModels[sessionID]?.messages.map(\.text), [])
        XCTAssertEqual(lifecycle.viewModels[sessionID]?.sessionID, sessionID)
        XCTAssertEqual(presenter.presentCallCount, 2)
    }
}

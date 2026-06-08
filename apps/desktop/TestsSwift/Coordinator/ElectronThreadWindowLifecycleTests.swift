import XCTest
@testable import HandAgentDesktop

@MainActor
final class ElectronThreadWindowLifecycleTests: XCTestCase {
    func testPrepareSendsPrepareCommand() {
        let client = RecordingThreadWindowCommandClient()
        let lifecycle = ElectronThreadWindowLifecycle(client: client)

        lifecycle.prepareForPromptPanel()

        XCTAssertEqual(client.prepareCount, 1)
    }

    func testInitialPromptSendsOpenInitialPromptAndMarksOpen() throws {
        let client = RecordingThreadWindowCommandClient()
        let lifecycle = ElectronThreadWindowLifecycle(client: client)
        let prompt = try XCTUnwrap(PromptSubmission.compose(draft: "hello", attachments: []))
        var openedCount = 0

        lifecycle.createTabWithInitialPrompt(
            prompt,
            onOpened: { openedCount += 1 },
            onFailed: { _ in },
            onClosed: {}
        )

        XCTAssertEqual(client.openedPrompts.map(\.composed), ["hello"])
        XCTAssertFalse(lifecycle.focus(threadID: nil, onFailure: {}))
        client.complete(commandId: "open-initial-prompt-1", kind: .openInitialPrompt, ok: true)
        XCTAssertEqual(openedCount, 1)
        XCTAssertTrue(lifecycle.focus(threadID: nil))
    }

    func testOpenHistorySendsOpenHistory() {
        let client = RecordingThreadWindowCommandClient()
        let lifecycle = ElectronThreadWindowLifecycle(client: client)
        var openedCount = 0

        lifecycle.openOrFocusHistory(
            onOpened: { openedCount += 1 },
            onFailed: { _ in },
            onClosed: {}
        )

        XCTAssertEqual(client.openHistoryCount, 1)
        client.complete(commandId: "open-history-1", kind: .openHistory, ok: true)
        XCTAssertEqual(openedCount, 1)
        XCTAssertTrue(lifecycle.focus(threadID: nil))
    }

    func testOpenFailureDoesNotMarkWindowOpenAndReportsFailure() throws {
        let client = RecordingThreadWindowCommandClient()
        let lifecycle = ElectronThreadWindowLifecycle(client: client)
        let prompt = try XCTUnwrap(PromptSubmission.compose(draft: "hello", attachments: []))
        var failures: [String] = []

        lifecycle.createTabWithInitialPrompt(
            prompt,
            onOpened: {},
            onFailed: { failures.append($0) },
            onClosed: {}
        )
        client.complete(
            commandId: "open-initial-prompt-1",
            kind: .openInitialPrompt,
            ok: false,
            error: "renderer unavailable"
        )

        XCTAssertEqual(failures, ["renderer unavailable"])
        XCTAssertFalse(lifecycle.focus(threadID: nil, onFailure: {}))
    }

    func testFocusFailureClearsOpenStateAndCallsFallback() {
        let client = RecordingThreadWindowCommandClient()
        let lifecycle = ElectronThreadWindowLifecycle(client: client)
        var focusFailureCount = 0

        lifecycle.openOrFocusHistory(
            onOpened: {},
            onFailed: { _ in },
            onClosed: {}
        )
        client.complete(commandId: "open-history-1", kind: .openHistory, ok: true)

        XCTAssertTrue(lifecycle.focus(threadID: "thread-1") {
            focusFailureCount += 1
        })
        client.complete(
            commandId: "focus-1",
            kind: .focus,
            ok: false,
            error: "thread window is not visible"
        )

        XCTAssertEqual(focusFailureCount, 1)
        XCTAssertFalse(lifecycle.focus(threadID: "thread-1", onFailure: {}))
    }

    func testVisibleCloseCallbackClearsOpenStateAndCallsOnClosed() {
        let client = RecordingThreadWindowCommandClient()
        let lifecycle = ElectronThreadWindowLifecycle(client: client)
        var closeCount = 0

        lifecycle.openOrFocusHistory(
            onOpened: {},
            onFailed: { _ in },
            onClosed: { closeCount += 1 }
        )
        client.complete(commandId: "open-history-1", kind: .openHistory, ok: true)
        client.onThreadWindowClosed?()

        XCTAssertEqual(closeCount, 1)
        XCTAssertFalse(lifecycle.focus(threadID: nil, onFailure: {}))
    }
}

@MainActor
private final class RecordingThreadWindowCommandClient: ThreadWindowCommanding {
    var onThreadWindowClosed: (() -> Void)?
    var onCommandResult: ((ThreadWindowCommandResult) -> Void)?
    private(set) var prepareCount = 0
    private(set) var openedPrompts: [PromptSubmission] = []
    private(set) var openHistoryCount = 0
    private(set) var focusedThreadIDs: [String?] = []
    private var commandCounters: [ThreadWindowCommandKind: Int] = [:]

    func prepareThreadWindow() throws -> String {
        prepareCount += 1
        return nextCommandId(for: .prepare)
    }

    func openInitialPrompt(_ prompt: PromptSubmission) throws -> String {
        openedPrompts.append(prompt)
        return nextCommandId(for: .openInitialPrompt)
    }

    func openHistory() throws -> String {
        openHistoryCount += 1
        return nextCommandId(for: .openHistory)
    }

    func focus(threadId: String?) throws -> String {
        focusedThreadIDs.append(threadId)
        return nextCommandId(for: .focus)
    }

    func complete(
        commandId: String,
        kind: ThreadWindowCommandKind,
        ok: Bool,
        error: String? = nil
    ) {
        onCommandResult?(
            ThreadWindowCommandResult(
                commandId: commandId,
                kind: kind,
                ok: ok,
                error: error
            )
        )
    }

    private func nextCommandId(for kind: ThreadWindowCommandKind) -> String {
        let next = (commandCounters[kind] ?? 0) + 1
        commandCounters[kind] = next
        switch kind {
        case .prepare:
            return "prepare-\(next)"
        case .openInitialPrompt:
            return "open-initial-prompt-\(next)"
        case .openHistory:
            return "open-history-\(next)"
        case .focus:
            return "focus-\(next)"
        }
    }
}

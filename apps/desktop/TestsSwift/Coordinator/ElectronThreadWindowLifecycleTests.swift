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

        lifecycle.createTabWithInitialPrompt(prompt, onClosed: {})

        XCTAssertEqual(client.openedPrompts.map(\.composed), ["hello"])
        XCTAssertTrue(lifecycle.focus(threadID: nil))
    }

    func testOpenHistorySendsOpenHistory() {
        let client = RecordingThreadWindowCommandClient()
        let lifecycle = ElectronThreadWindowLifecycle(client: client)

        lifecycle.openOrFocusHistory(onClosed: {})

        XCTAssertEqual(client.openHistoryCount, 1)
        XCTAssertTrue(lifecycle.focus(threadID: nil))
    }

    func testVisibleCloseCallbackClearsOpenStateAndCallsOnClosed() {
        let client = RecordingThreadWindowCommandClient()
        let lifecycle = ElectronThreadWindowLifecycle(client: client)
        var closeCount = 0

        lifecycle.openOrFocusHistory { closeCount += 1 }
        client.onThreadWindowClosed?()

        XCTAssertEqual(closeCount, 1)
        XCTAssertFalse(lifecycle.focus(threadID: nil))
    }
}

@MainActor
private final class RecordingThreadWindowCommandClient: ThreadWindowCommanding {
    var onThreadWindowClosed: (() -> Void)?
    private(set) var prepareCount = 0
    private(set) var openedPrompts: [PromptSubmission] = []
    private(set) var openHistoryCount = 0
    private(set) var focusedThreadIDs: [String?] = []

    func prepareThreadWindow() throws {
        prepareCount += 1
    }

    func openInitialPrompt(_ prompt: PromptSubmission) throws {
        openedPrompts.append(prompt)
    }

    func openHistory() throws {
        openHistoryCount += 1
    }

    func focus(threadId: String?) throws {
        focusedThreadIDs.append(threadId)
    }
}

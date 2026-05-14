import XCTest
@testable import HandAgentDesktop

final class SessionViewModelTests: XCTestCase {
    @MainActor
    func testAppendsAssistantDeltaIntoStreamingMessage() {
        let model = SessionViewModel(sessionID: "session-1", socketClient: .noop)

        model.handle(.assistantMessageStart(messageID: "m1", timestamp: "2026-05-14T00:00:00.000Z"))
        model.handle(
            .assistantMessageDelta(
                messageID: "m1",
                text: "hello",
                timestamp: "2026-05-14T00:00:00.100Z"
            )
        )

        XCTAssertEqual(model.messages.last?.text, "hello")
    }

    @MainActor
    func testStartShowsStartupErrorWithoutSendingPrompt() {
        let model = SessionViewModel(sessionID: "session-1", socketClient: .noop)

        model.start(initialPrompt: "hello", startupError: "Node.js not found.")

        XCTAssertEqual(model.status, "failed")
        XCTAssertEqual(model.error, "Node.js not found.")
        XCTAssertEqual(model.messages.map(\.text), ["Node.js not found."])
    }

    @MainActor
    func testIgnoresDuplicateConsecutiveErrorsWithSameMessage() {
        let model = SessionViewModel(sessionID: "session-1", socketClient: .noop)

        model.handle(
            .error(
                messageID: "e1",
                message: "Could not connect to the server.",
                timestamp: "2026-05-14T00:00:00.000Z"
            )
        )
        model.handle(
            .error(
                messageID: "e2",
                message: "Could not connect to the server.",
                timestamp: "2026-05-14T00:00:00.100Z"
            )
        )

        XCTAssertEqual(model.messages.map(\.text), ["Could not connect to the server."])
        XCTAssertEqual(model.error, "Could not connect to the server.")
        XCTAssertEqual(model.status, "failed")
    }
}

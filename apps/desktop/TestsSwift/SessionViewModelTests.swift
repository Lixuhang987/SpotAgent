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
}

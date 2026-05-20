import XCTest
@testable import HandAgentDesktop

final class SessionTabViewModelTests: XCTestCase {
    @MainActor
    func testSnapshotFillsMessages() {
        let tab = SessionTabViewModel(
            tabID: "tab-1",
            sessionID: "session-1",
            socketClient: .noop
        )

        tab.handle(.sessionSnapshot(
            messages: [SessionBubble(id: "m1", role: "user", text: "hello")],
            status: "idle"
        ))

        XCTAssertEqual(tab.messages.map(\.text), ["hello"])
        XCTAssertEqual(tab.status, "idle")
    }

    @MainActor
    func testBackgroundTabKeepsRunningState() {
        let tab = SessionTabViewModel(
            tabID: "tab-1",
            sessionID: "session-1",
            socketClient: .noop
        )

        tab.handle(.assistantMessageStart(
            messageID: "a1",
            timestamp: "2026-05-20T00:00:00.000Z"
        ))
        tab.handle(.assistantMessageDelta(
            messageID: "a1",
            text: "hello",
            timestamp: "2026-05-20T00:00:00.100Z"
        ))

        XCTAssertEqual(tab.status, "running")
        XCTAssertEqual(tab.messages.last?.text, "hello")
    }

    @MainActor
    func testOpenFailedMarksTabInvalid() {
        let tab = SessionTabViewModel(
            tabID: "tab-1",
            sessionID: "session-1",
            socketClient: .noop
        )

        tab.handle(.sessionOpenFailed(reason: "not_found", message: "Session not found: session-1"))

        XCTAssertTrue(tab.isInvalid)
        XCTAssertEqual(tab.invalidReason, "Session not found: session-1")
    }
}

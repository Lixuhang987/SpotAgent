import XCTest
@testable import HandAgentDesktop

final class SessionWindowViewModelTests: XCTestCase {
    @MainActor
    func testOpenHistorySessionCreatesAndActivatesTab() {
        let model = SessionWindowViewModel(socketFactory: { _ in .noop })

        model.openHistorySession("session-1")

        XCTAssertEqual(model.tabs.map(\.sessionID), ["session-1"])
        XCTAssertEqual(model.activeTab?.sessionID, "session-1")
    }

    @MainActor
    func testOpenHistorySessionReusesExistingTab() {
        let model = SessionWindowViewModel(socketFactory: { _ in .noop })

        model.openHistorySession("session-1")
        model.openHistorySession("session-1")

        XCTAssertEqual(model.tabs.count, 1)
        XCTAssertEqual(model.activeTab?.sessionID, "session-1")
    }

    @MainActor
    func testHistoryActionDoesNotChangeActiveTab() {
        let model = SessionWindowViewModel(socketFactory: { _ in .noop })
        model.openHistorySession("session-1")
        model.openHistorySession("session-2")

        model.openOrFocusHistory()

        XCTAssertEqual(model.activeTab?.sessionID, "session-2")
    }

    @MainActor
    func testInvalidActiveTabClosesToEmptyState() {
        let model = SessionWindowViewModel(socketFactory: { _ in .noop })
        model.openHistorySession("session-1")

        model.activeTab?.handle(.sessionOpenFailed(reason: "not_found", message: "missing"))
        model.pruneInvalidTabs()

        XCTAssertTrue(model.tabs.isEmpty)
        XCTAssertNil(model.activeTab)
        XCTAssertEqual(model.noticeMessage, "missing")
    }
}

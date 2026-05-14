import XCTest
@testable import HandAgentDesktop

final class SessionRegistryTests: XCTestCase {
    @MainActor
    func testPrefersMostRecentRunningSessionForBubbleTarget() {
        let registry = SessionRegistry()

        registry.upsert(
            SessionSummary(
                sessionId: "s1",
                isRunning: false,
                latestSummary: "idle",
                lastActiveAt: .distantPast,
                windowIsOpen: true
            )
        )
        registry.upsert(
            SessionSummary(
                sessionId: "s2",
                isRunning: true,
                latestSummary: "running",
                lastActiveAt: .now,
                windowIsOpen: true
            )
        )

        XCTAssertEqual(registry.primarySessionID, "s2")
    }
}

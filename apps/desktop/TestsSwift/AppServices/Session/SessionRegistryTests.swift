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

    @MainActor
    func testRanksByLastActiveAtInsteadOfInsertionOrder() {
        let registry = SessionRegistry()

        registry.upsert(
            SessionSummary(
                sessionId: "s1",
                isRunning: true,
                latestSummary: "older",
                lastActiveAt: .distantPast,
                windowIsOpen: true
            )
        )
        registry.upsert(
            SessionSummary(
                sessionId: "s2",
                isRunning: true,
                latestSummary: "newer",
                lastActiveAt: .now,
                windowIsOpen: true
            )
        )
        registry.upsert(
            SessionSummary(
                sessionId: "s1",
                isRunning: true,
                latestSummary: "older refresh",
                lastActiveAt: .distantPast,
                windowIsOpen: true
            )
        )

        XCTAssertEqual(registry.primarySessionID, "s2")
    }

    @MainActor
    func testFallsBackToMostRecentWindowWhenNoRunningSessionExists() {
        let registry = SessionRegistry()

        registry.upsert(
            SessionSummary(
                sessionId: "s1",
                isRunning: false,
                latestSummary: "older",
                lastActiveAt: .distantPast,
                windowIsOpen: true
            )
        )
        registry.upsert(
            SessionSummary(
                sessionId: "s2",
                isRunning: false,
                latestSummary: "newer",
                lastActiveAt: .now,
                windowIsOpen: true
            )
        )

        XCTAssertEqual(registry.primarySessionID, "s2")
    }

    @MainActor
    func testPrimarySessionPrefersRunningOpenTab() {
        let registry = SessionRegistry()

        registry.upsert(
            SessionSummary(
                sessionId: "idle-session",
                isRunning: false,
                latestSummary: "idle",
                lastActiveAt: Date(timeIntervalSince1970: 1),
                windowIsOpen: true
            )
        )
        registry.upsert(
            SessionSummary(
                sessionId: "running-session",
                isRunning: true,
                latestSummary: "running",
                lastActiveAt: Date(timeIntervalSince1970: 2),
                windowIsOpen: true
            )
        )

        XCTAssertEqual(registry.primarySessionID, "running-session")
    }
}

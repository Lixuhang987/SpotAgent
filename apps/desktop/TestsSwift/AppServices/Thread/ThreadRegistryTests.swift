import XCTest
@testable import HandAgentDesktop

final class ThreadRegistryTests: XCTestCase {
    @MainActor
    func testPrefersMostRecentRunningThreadForBubbleTarget() {
        let registry = ThreadRegistry()

        registry.upsert(
            ThreadSummary(
                threadId: "t1",
                isRunning: false,
                latestSummary: "idle",
                lastActiveAt: .distantPast,
                windowIsOpen: true
            )
        )
        registry.upsert(
            ThreadSummary(
                threadId: "t2",
                isRunning: true,
                latestSummary: "running",
                lastActiveAt: .now,
                windowIsOpen: true
            )
        )

        XCTAssertEqual(registry.primaryThreadID, "t2")
    }

    @MainActor
    func testRanksByLastActiveAtInsteadOfInsertionOrder() {
        let registry = ThreadRegistry()

        registry.upsert(
            ThreadSummary(
                threadId: "t1",
                isRunning: true,
                latestSummary: "older",
                lastActiveAt: .distantPast,
                windowIsOpen: true
            )
        )
        registry.upsert(
            ThreadSummary(
                threadId: "t2",
                isRunning: true,
                latestSummary: "newer",
                lastActiveAt: .now,
                windowIsOpen: true
            )
        )
        registry.upsert(
            ThreadSummary(
                threadId: "t1",
                isRunning: true,
                latestSummary: "older refresh",
                lastActiveAt: .distantPast,
                windowIsOpen: true
            )
        )

        XCTAssertEqual(registry.primaryThreadID, "t2")
    }

    @MainActor
    func testFallsBackToMostRecentWindowWhenNoRunningThreadExists() {
        let registry = ThreadRegistry()

        registry.upsert(
            ThreadSummary(
                threadId: "t1",
                isRunning: false,
                latestSummary: "older",
                lastActiveAt: .distantPast,
                windowIsOpen: true
            )
        )
        registry.upsert(
            ThreadSummary(
                threadId: "t2",
                isRunning: false,
                latestSummary: "newer",
                lastActiveAt: .now,
                windowIsOpen: true
            )
        )

        XCTAssertEqual(registry.primaryThreadID, "t2")
    }

    @MainActor
    func testPrimaryThreadPrefersRunningOpenTab() {
        let registry = ThreadRegistry()

        registry.upsert(
            ThreadSummary(
                threadId: "idle-thread",
                isRunning: false,
                latestSummary: "idle",
                lastActiveAt: Date(timeIntervalSince1970: 1),
                windowIsOpen: true
            )
        )
        registry.upsert(
            ThreadSummary(
                threadId: "running-thread",
                isRunning: true,
                latestSummary: "running",
                lastActiveAt: Date(timeIntervalSince1970: 2),
                windowIsOpen: true
            )
        )

        XCTAssertEqual(registry.primaryThreadID, "running-thread")
    }
}

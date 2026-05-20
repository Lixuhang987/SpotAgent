import XCTest
@testable import HandAgentDesktop

final class StatusBubbleViewModelTests: XCTestCase {
    @MainActor
    func testIsRunningReturnsFalseWhenNoSessions() {
        let registry = SessionRegistry()
        let vm = StatusBubbleViewModel(registry: registry)

        XCTAssertFalse(vm.isRunning)
    }

    @MainActor
    func testIsRunningReturnsTrueWhenPrimarySessionIsRunning() {
        let registry = SessionRegistry()
        registry.upsert(SessionSummary(
            sessionId: "s1",
            isRunning: true,
            latestSummary: "hello",
            lastActiveAt: .now,
            windowIsOpen: true
        ))
        let vm = StatusBubbleViewModel(registry: registry)

        XCTAssertTrue(vm.isRunning)
    }

    @MainActor
    func testLatestSummaryShowsDefaultWhenEmpty() {
        let registry = SessionRegistry()
        let vm = StatusBubbleViewModel(registry: registry)

        XCTAssertEqual(vm.latestSummary, "点击开始")
    }

    @MainActor
    func testLatestSummaryShowsPrimarySessionSummary() {
        let registry = SessionRegistry()
        registry.upsert(SessionSummary(
            sessionId: "s1",
            isRunning: false,
            latestSummary: "分析完成",
            lastActiveAt: .now,
            windowIsOpen: true
        ))
        let vm = StatusBubbleViewModel(registry: registry)

        XCTAssertEqual(vm.latestSummary, "分析完成")
    }
}

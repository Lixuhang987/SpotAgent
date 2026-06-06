import XCTest
@testable import HandAgentDesktop

final class StatusBubbleViewModelTests: XCTestCase {
    @MainActor
    func testIsRunningReturnsFalseWhenNoThreads() {
        let registry = ThreadRegistry()
        let vm = StatusBubbleViewModel(registry: registry)

        XCTAssertFalse(vm.isRunning)
    }

    @MainActor
    func testIsRunningReturnsTrueWhenPrimaryThreadIsRunning() {
        let registry = ThreadRegistry()
        registry.upsert(ThreadSummary(
            threadId: "s1",
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
        let registry = ThreadRegistry()
        let vm = StatusBubbleViewModel(registry: registry)

        XCTAssertEqual(vm.latestSummary, "点击开始")
    }

    @MainActor
    func testLatestSummaryShowsPrimaryThreadSummary() {
        let registry = ThreadRegistry()
        registry.upsert(ThreadSummary(
            threadId: "s1",
            isRunning: false,
            latestSummary: "分析完成",
            lastActiveAt: .now,
            windowIsOpen: true
        ))
        let vm = StatusBubbleViewModel(registry: registry)

        XCTAssertEqual(vm.latestSummary, "分析完成")
    }
}

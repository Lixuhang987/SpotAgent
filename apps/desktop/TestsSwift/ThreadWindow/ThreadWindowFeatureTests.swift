import ComposableArchitecture
import XCTest
@testable import HandAgentDesktop

final class ThreadWindowFeatureTests: XCTestCase {
    @MainActor
    func testThreadStartedOpensTabAndActivatesThread() {
        let store = Store(initialState: ThreadWindowFeature.State()) {
            ThreadWindowFeature()
        }

        store.send(.windowEvent(.threadStarted(
            threadID: "thread-1",
            title: nil,
            responseMessageID: "cmd-1"
        )))

        XCTAssertEqual(store.state.tabs.map(\.thread.id), ["thread-1"])
        XCTAssertEqual(store.state.activeTabID, "thread-1")
    }

    @MainActor
    func testThreadListUpdatesWindowDomainOnly() {
        let store = Store(initialState: ThreadWindowFeature.State()) {
            ThreadWindowFeature()
        }
        let item = ThreadListItem(
            id: "thread-1",
            title: "Plan",
            updatedAt: "2026-06-06T00:00:00.000Z",
            messageCount: 2,
            workspaceId: "docs"
        )

        store.send(.windowEvent(.threadList(threads: [item])))

        XCTAssertEqual(store.state.threadList, [item])
        XCTAssertTrue(store.state.tabs.isEmpty)
    }
}

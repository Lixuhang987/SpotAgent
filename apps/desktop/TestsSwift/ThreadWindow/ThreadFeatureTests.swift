import ComposableArchitecture
import XCTest
@testable import HandAgentDesktop

final class ThreadFeatureTests: XCTestCase {
    @MainActor
    func testThreadSnapshotUpdatesThreadStateWithoutOverwritingEventCache() {
        let store = Store(initialState: ThreadFeature.State(threadID: "thread-1")) {
            ThreadFeature()
        }

        store.send(.localUserMessage(
            messageID: "local-1",
            text: "hello",
            attachments: []
        ))
        store.send(.event(.threadSnapshot(
            messages: [],
            status: "idle"
        )))

        XCTAssertEqual(store.state.thread.id, "thread-1")
        XCTAssertEqual(store.state.thread.status, .running)
        XCTAssertEqual(store.state.events.messages.map(\.text), ["hello"])
    }

    @MainActor
    func testPermissionRequestLivesInEventStore() {
        let store = Store(initialState: ThreadFeature.State(threadID: "thread-1")) {
            ThreadFeature()
        }

        store.send(.event(.permissionRequest(
            requestId: "req-1",
            toolName: "workspace.askUser",
            toolCallId: "tool-1",
            argumentsJSON: "{}"
        )))

        XCTAssertEqual(store.state.thread.pendingRequestCount, 0)
        XCTAssertEqual(store.state.events.pendingPermissionRequests.map(\.id), ["req-1"])
        XCTAssertEqual(store.state.thread.status, .running)
    }
}

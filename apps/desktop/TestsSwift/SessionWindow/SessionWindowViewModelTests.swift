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

    @MainActor
    func testActiveTabExposesInputTarget() {
        let model = SessionWindowViewModel(socketFactory: { _ in .noop })

        XCTAssertNil(model.activeTab)
        model.openHistorySession("session-1")

        XCTAssertEqual(model.activeTab?.sessionID, "session-1")
    }

    @MainActor
    func testPromptPanelSubmitCreatesTabThenSendsPromptThroughTabSocket() async {
        let historyTransport = ViewModelRecordingSessionSocketTransport()
        let historyClient = SessionSocketClient(
            serverURL: URL(string: "ws://127.0.0.1:4317/api/session")!,
            transport: historyTransport,
            reconnectDelay: 0
        )
        var tabTransports: [String: ViewModelRecordingSessionSocketTransport] = [:]
        let model = SessionWindowViewModel(
            socketFactory: { sessionID in
                let transport = ViewModelRecordingSessionSocketTransport()
                tabTransports[sessionID] = transport
                return SessionSocketClient(
                    serverURL: URL(string: "ws://127.0.0.1:4317/api/session")!,
                    transport: transport,
                    reconnectDelay: 0
                )
            },
            historySocketClient: historyClient
        )

        model.sendPrompt("hello from panel")

        XCTAssertEqual(historyTransport.tasks[0].sentTypes.suffix(1), ["create_session_request"])
        XCTAssertNil(historyTransport.tasks[0].lastPayload?["initialText"])

        historyClient.handleIncomingTextForTesting(
            """
            {
              "type": "create_session_response",
              "sessionId": "session-created",
              "messageId": "create-1",
              "timestamp": "2026-05-20T00:00:00.000Z",
              "payload": { "title": null }
            }
            """,
            currentSessionID: ""
        )
        await Task.yield()

        XCTAssertEqual(model.activeTab?.sessionID, "session-created")
        XCTAssertEqual(model.activeTab?.messages.map(\.text), ["hello from panel"])
        XCTAssertEqual(tabTransports["session-created"]?.tasks[0].sentTypes, ["open_session", "user_message"])
    }
}

private final class ViewModelRecordingSessionSocketTransport: SessionSocketTransport {
    private(set) var tasks: [ViewModelRecordingSessionWebSocketTask] = []

    func makeWebSocketTask(with url: URL) -> any SessionWebSocketTask {
        let task = ViewModelRecordingSessionWebSocketTask()
        tasks.append(task)
        return task
    }
}

private final class ViewModelRecordingSessionWebSocketTask: SessionWebSocketTask {
    private(set) var sentTypes: [String] = []
    private(set) var lastPayload: [String: Any]?

    func resume() {}

    func cancel(with closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {}

    func send(
        _ message: URLSessionWebSocketTask.Message,
        completionHandler: @escaping @Sendable (Error?) -> Void
    ) {
        guard case .string(let text) = message,
              let data = text.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = object["type"] as? String else {
            completionHandler(nil)
            return
        }
        sentTypes.append(type)
        lastPayload = object["payload"] as? [String: Any]
        completionHandler(nil)
    }

    func receive(
        completionHandler: @escaping @Sendable (Result<URLSessionWebSocketTask.Message, Error>) -> Void
    ) {}
}

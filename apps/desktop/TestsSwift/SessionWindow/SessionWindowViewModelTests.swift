import XCTest
@testable import HandAgentDesktop

final class SessionWindowViewModelTests: XCTestCase {
    @MainActor
    func testInitializesHistoryListRequestWhenWindowModelIsCreated() {
        let transport = RecordingSessionSocketTransport()
        _ = SessionWindowViewModel(
            socketFactory: { _ in .noop },
            historySocketClient: SessionSocketClient(
                serverURL: URL(string: "ws://127.0.0.1:4317/api/session")!,
                transport: transport,
                reconnectDelay: 0
            )
        )

        XCTAssertEqual(transport.tasks.count, 1)
        XCTAssertEqual(transport.tasks[0].sentTypes, ["open_session", "list_sessions_request"])
    }

    @MainActor
    func testCreateSessionResponseOpensTabAndRefreshesHistoryList() {
        let historyTransport = RecordingSessionSocketTransport()
        let tabTransport = RecordingSessionSocketTransport()
        let model = SessionWindowViewModel(
            socketFactory: { _ in
                SessionSocketClient(
                    serverURL: URL(string: "ws://127.0.0.1:4317/api/session")!,
                    transport: tabTransport,
                    reconnectDelay: 0
                )
            },
            historySocketClient: SessionSocketClient(
                serverURL: URL(string: "ws://127.0.0.1:4317/api/session")!,
                transport: historyTransport,
                reconnectDelay: 0
            )
        )

        model.handleWindowEvent(.createSessionResponse(sessionID: "session-1", title: nil))

        XCTAssertEqual(model.activeTab?.sessionID, "session-1")
        XCTAssertEqual(
            historyTransport.tasks[0].sentTypes,
            ["open_session", "list_sessions_request", "list_sessions_request"]
        )
    }

    @MainActor
    func testSuccessfulDeleteSessionResponseClosesOpenRunningTabAndRefreshesHistoryList() {
        let historyTransport = RecordingSessionSocketTransport()
        var tabTransports: [String: RecordingSessionSocketTransport] = [:]
        var closedSessionIDs: [String] = []
        let model = SessionWindowViewModel(
            socketFactory: { sessionID in
                let transport = RecordingSessionSocketTransport()
                tabTransports[sessionID] = transport
                return SessionSocketClient(
                    serverURL: URL(string: "ws://127.0.0.1:4317/api/session")!,
                    transport: transport,
                    reconnectDelay: 0
                )
            },
            historySocketClient: SessionSocketClient(
                serverURL: URL(string: "ws://127.0.0.1:4317/api/session")!,
                transport: historyTransport,
                reconnectDelay: 0
            ),
            onTabClosed: { tab in
                closedSessionIDs.append(tab.sessionID)
            }
        )

        model.openHistorySession("finished-session")
        model.openHistorySession("running-session")
        model.activeTab?.sendPrompt("still running")

        model.handleWindowEvent(.deleteSessionResponse(targetSessionID: "running-session", status: "deleted"))

        XCTAssertEqual(model.tabs.map(\.sessionID), ["finished-session"])
        XCTAssertEqual(model.activeTab?.sessionID, "finished-session")
        XCTAssertEqual(closedSessionIDs, ["running-session"])
        XCTAssertEqual(
            historyTransport.tasks[0].sentTypes,
            ["open_session", "list_sessions_request", "list_sessions_request"]
        )
        XCTAssertEqual(tabTransports["running-session"]?.tasks[0].cancelCount, 1)
    }

    @MainActor
    func testNonDeletedDeleteSessionResponseKeepsOpenTabAndRefreshesHistoryList() {
        let historyTransport = RecordingSessionSocketTransport()
        var tabTransports: [String: RecordingSessionSocketTransport] = [:]
        var closedSessionIDs: [String] = []
        let model = SessionWindowViewModel(
            socketFactory: { sessionID in
                let transport = RecordingSessionSocketTransport()
                tabTransports[sessionID] = transport
                return SessionSocketClient(
                    serverURL: URL(string: "ws://127.0.0.1:4317/api/session")!,
                    transport: transport,
                    reconnectDelay: 0
                )
            },
            historySocketClient: SessionSocketClient(
                serverURL: URL(string: "ws://127.0.0.1:4317/api/session")!,
                transport: historyTransport,
                reconnectDelay: 0
            ),
            onTabClosed: { tab in
                closedSessionIDs.append(tab.sessionID)
            }
        )

        model.openHistorySession("target-session")

        model.handleWindowEvent(.deleteSessionResponse(targetSessionID: "target-session", status: "not_found"))

        XCTAssertEqual(model.tabs.map(\.sessionID), ["target-session"])
        XCTAssertEqual(model.activeTab?.sessionID, "target-session")
        XCTAssertTrue(closedSessionIDs.isEmpty)
        XCTAssertEqual(
            historyTransport.tasks[0].sentTypes,
            ["open_session", "list_sessions_request", "list_sessions_request"]
        )
        XCTAssertEqual(tabTransports["target-session"]?.tasks[0].cancelCount, 0)
    }

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
    func testComposerSubmitFromEmptyWorkspaceCreatesTabThenSendsPromptThroughTabSocket() async {
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

    @MainActor
    func testPromptPanelInitialSubmitCreatesNewSessionEvenWhenATabIsActive() async {
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
        model.openHistorySession("existing-session")

        model.createTabWithInitialPrompt("new prompt")

        XCTAssertEqual(model.activeTab?.sessionID, "existing-session")
        XCTAssertEqual(tabTransports["existing-session"]?.tasks[0].sentTypes, ["open_session"])
        XCTAssertEqual(historyTransport.tasks[0].sentTypes.suffix(1), ["create_session_request"])
        XCTAssertNil(historyTransport.tasks[0].lastPayload?["initialText"])

        historyClient.handleIncomingTextForTesting(
            """
            {
              "type": "create_session_response",
              "sessionId": "new-session",
              "messageId": "create-1",
              "timestamp": "2026-05-20T00:00:00.000Z",
              "payload": { "title": null }
            }
            """,
            currentSessionID: ""
        )
        await Task.yield()

        XCTAssertEqual(model.activeTab?.sessionID, "new-session")
        XCTAssertEqual(model.tabs.map(\.sessionID), ["existing-session", "new-session"])
        XCTAssertEqual(tabTransports["existing-session"]?.tasks[0].sentTypes, ["open_session"])
        XCTAssertEqual(tabTransports["new-session"]?.tasks[0].sentTypes, ["open_session", "user_message"])
        XCTAssertEqual(model.activeTab?.messages.map(\.text), ["new prompt"])
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
    private(set) var cancelCount = 0

    func resume() {}

    func cancel(with closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
        cancelCount += 1
    }

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

private final class RecordingSessionSocketTransport: SessionSocketTransport {
    private(set) var tasks: [RecordingSessionWebSocketTask] = []

    func makeWebSocketTask(with url: URL) -> any SessionWebSocketTask {
        let task = RecordingSessionWebSocketTask()
        tasks.append(task)
        return task
    }
}

private final class RecordingSessionWebSocketTask: SessionWebSocketTask {
    private(set) var sentTypes: [String] = []
    private(set) var cancelCount = 0

    func resume() {}

    func cancel(with closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
        cancelCount += 1
    }

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
        completionHandler(nil)
    }

    func receive(
        completionHandler: @escaping @Sendable (Result<URLSessionWebSocketTask.Message, Error>) -> Void
    ) {}
}

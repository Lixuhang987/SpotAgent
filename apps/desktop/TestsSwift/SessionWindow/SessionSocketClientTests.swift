import XCTest
@testable import HandAgentDesktop

final class SessionSocketClientTests: XCTestCase {
    func testReconnectCreatesNewSocketAndSendsOpenSessionAgain() {
        let transport = RecordingSessionSocketTransport()
        let client = SessionSocketClient(
            serverURL: URL(string: "ws://127.0.0.1:4317/api/session")!,
            transport: transport,
            reconnectDelay: 0
        )
        var connectionStates: [SessionConnectionState] = []
        client.onEvent = { event in
            if case .connectionState(let state) = event {
                connectionStates.append(state)
            }
        }

        client.connect(sessionID: "session-1")
        XCTAssertEqual(transport.tasks.count, 1)
        XCTAssertEqual(transport.tasks[0].sentTypes, ["open_session"])

        transport.tasks[0].failReceive()

        XCTAssertEqual(transport.tasks.count, 2)
        XCTAssertEqual(transport.tasks[1].sentTypes, ["open_session"])
        XCTAssertEqual(connectionStates, [.connecting, .connected, .reconnecting, .connected])
    }

    func testManualDisconnectDoesNotReconnectWhenReceiveLaterFails() {
        let transport = RecordingSessionSocketTransport()
        let client = SessionSocketClient(
            serverURL: URL(string: "ws://127.0.0.1:4317/api/session")!,
            transport: transport,
            reconnectDelay: 0
        )
        var connectionStates: [SessionConnectionState] = []
        client.onEvent = { event in
            if case .connectionState(let state) = event {
                connectionStates.append(state)
            }
        }

        client.connect(sessionID: "session-1")
        client.disconnect()
        transport.tasks[0].failReceive()

        XCTAssertEqual(transport.tasks.count, 1)
        XCTAssertEqual(connectionStates, [.connecting, .connected, .disconnected])
    }

    func testSendInterruptSendsInterruptEnvelopeWithoutDisconnecting() {
        let transport = RecordingSessionSocketTransport()
        let client = SessionSocketClient(
            serverURL: URL(string: "ws://127.0.0.1:4317/api/session")!,
            transport: transport,
            reconnectDelay: 0
        )
        var connectionStates: [SessionConnectionState] = []
        client.onEvent = { event in
            if case .connectionState(let state) = event {
                connectionStates.append(state)
            }
        }

        client.connect(sessionID: "session-1")
        client.sendInterrupt(sessionID: "session-1")

        XCTAssertEqual(transport.tasks.count, 1)
        XCTAssertEqual(transport.tasks[0].sentTypes, ["open_session", "interrupt"])
        XCTAssertEqual(connectionStates, [.connecting, .connected])
    }

    func testExtractPermissionArgumentsJSONReturnsPrettyPayload() {
        let raw = """
        {
          "type": "permission_request",
          "sessionId": "s1",
          "messageId": "m1",
          "timestamp": "2026-05-18T00:00:00.000Z",
          "payload": {
            "requestId": "r1",
            "toolName": "file.write",
            "toolCallId": "tc-1",
            "arguments": { "workspaceId": "default", "relativePath": "notes.md" }
          }
        }
        """
        let data = Data(raw.utf8)
        let json = SessionSocketClient.extractPermissionArgumentsJSON(from: data)

        XCTAssertTrue(json.contains("\"workspaceId\""))
        XCTAssertTrue(json.contains("\"default\""))
        XCTAssertTrue(json.contains("\"relativePath\""))
        XCTAssertTrue(json.contains("\"notes.md\""))
    }

    func testExtractPermissionArgumentsJSONFallsBackToEmptyObject() {
        let raw = """
        {"type":"permission_request","sessionId":"s","messageId":"m","timestamp":"t","payload":{}}
        """
        let json = SessionSocketClient.extractPermissionArgumentsJSON(from: Data(raw.utf8))
        XCTAssertEqual(json, "{}")
    }

    func testDecodesSessionOpenFailed() {
        let client = SessionSocketClient.noop
        var received: SessionEvent?
        client.onEvent = { received = $0 }

        client.handleIncomingTextForTesting(
            """
            {
              "type": "session_open_failed",
              "sessionId": "session-1",
              "messageId": "open-1",
              "timestamp": "2026-05-20T00:00:00.000Z",
              "payload": {
                "reason": "not_found",
                "message": "Session not found: session-1"
              }
            }
            """,
            currentSessionID: "session-1"
        )

        XCTAssertEqual(
            received,
            .sessionOpenFailed(reason: "not_found", message: "Session not found: session-1")
        )
    }

    func testSendsCreateSessionRequestWithInitialText() {
        let transport = RecordingSessionSocketTransport()
        let client = SessionSocketClient(
            serverURL: URL(string: "ws://127.0.0.1:4317/api/session")!,
            transport: transport,
            reconnectDelay: 0
        )

        client.connect(sessionID: "")
        client.sendCreateSession(initialText: "hello", attachments: [])

        XCTAssertEqual(transport.tasks[0].sentTypes.suffix(1), ["create_session_request"])
    }

    func testSendsCreateSessionRequestWithActionBinding() {
        let transport = RecordingSessionSocketTransport()
        let client = SessionSocketClient(
            serverURL: URL(string: "ws://127.0.0.1:4317/api/session")!,
            transport: transport,
            reconnectDelay: 0
        )

        client.connect(sessionID: "")
        client.sendCreateSession(
            initialText: "Review:\\ncode",
            attachments: [],
            actionBinding: ActionBindingPayload(pluginId: "review", promptName: "code_review")
        )

        let payload = transport.tasks[0].sentObjects.last?["payload"] as? [String: Any]
        let binding = payload?["actionBinding"] as? [String: Any]
        XCTAssertEqual(binding?["pluginId"] as? String, "review")
        XCTAssertEqual(binding?["promptName"] as? String, "code_review")
    }

    func testDecodesWorkspaceAskRequest() {
        let transport = RecordingSessionSocketTransport()
        let client = SessionSocketClient(
            serverURL: URL(string: "ws://127.0.0.1:4317/api/session")!,
            transport: transport,
            reconnectDelay: 0
        )
        var events: [SessionEvent] = []
        client.onEvent = { events.append($0) }

        client.connect(sessionID: "session-1")
        transport.tasks[0].receiveString(
            """
            {
              "type": "workspace_ask_request",
              "sessionId": "session-1",
              "messageId": "m1",
              "timestamp": "2026-05-19T00:00:00.000Z",
              "payload": {
                "requestId": "r1",
                "toolCallId": "tc1",
                "prompt": "请选择 workspace",
                "candidates": [
                  { "id": "docs", "name": "文档", "description": "产品文档", "isDefault": false },
                  { "id": "code", "name": "代码", "description": "源码", "isDefault": true }
                ],
                "timeoutMs": 60000
              }
            }
            """
        )

        XCTAssertTrue(
            events.contains(
                .workspaceAskRequest(
                    requestId: "r1",
                    prompt: "请选择 workspace",
                    candidates: [
                        WorkspaceAskCandidate(
                            id: "docs",
                            name: "文档",
                            description: "产品文档",
                            isDefault: false
                        ),
                        WorkspaceAskCandidate(
                            id: "code",
                            name: "代码",
                            description: "源码",
                            isDefault: true
                        ),
                    ]
                )
            )
        )
    }
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
    private var receiveHandler: ((Result<URLSessionWebSocketTask.Message, Error>) -> Void)?
    private(set) var sentTypes: [String] = []
    private(set) var sentObjects: [[String: Any]] = []

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
        sentObjects.append(object)
        completionHandler(nil)
    }

    func receive(
        completionHandler: @escaping @Sendable (Result<URLSessionWebSocketTask.Message, Error>) -> Void
    ) {
        receiveHandler = completionHandler
    }

    func failReceive() {
        receiveHandler?(.failure(URLError(.cannotConnectToHost)))
    }

    func receiveString(_ text: String) {
        receiveHandler?(.success(.string(text)))
    }
}

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
}

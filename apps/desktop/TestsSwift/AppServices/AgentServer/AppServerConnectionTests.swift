import XCTest
@testable import HandAgentDesktop

final class AppServerConnectionTests: XCTestCase {
    func testConnectOpensSocketAndEmitsConnectedState() {
        let transport = RecordingAppServerConnectionTransport()
        let connection = AppServerConnection(
            serverURL: URL(string: "ws://127.0.0.1:4317/api/thread")!,
            transport: transport,
            reconnectDelay: 0
        )
        var states: [AppServerConnection.State] = []
        connection.onStateChange = { states.append($0) }

        connection.connect()

        XCTAssertEqual(transport.tasks.count, 1)
        XCTAssertEqual(states, [.connecting, .connected])
    }

    func testReceiveFailureReconnectsAndEmitsReconnectingThenConnected() {
        let transport = RecordingAppServerConnectionTransport()
        let connection = AppServerConnection(
            serverURL: URL(string: "ws://127.0.0.1:4317/api/thread")!,
            transport: transport,
            reconnectDelay: 0
        )
        var states: [AppServerConnection.State] = []
        connection.onStateChange = { states.append($0) }

        connection.connect()
        transport.tasks[0].failReceive()

        XCTAssertEqual(transport.tasks.count, 2)
        XCTAssertEqual(states, [.connecting, .connected, .reconnecting, .connected])
    }

    func testManualDisconnectPreventsReconnectAfterReceiveFailure() {
        let transport = RecordingAppServerConnectionTransport()
        let connection = AppServerConnection(
            serverURL: URL(string: "ws://127.0.0.1:4317/api/thread")!,
            transport: transport,
            reconnectDelay: 0
        )
        var states: [AppServerConnection.State] = []
        connection.onStateChange = { states.append($0) }

        connection.connect()
        connection.disconnect()
        transport.tasks[0].failReceive()

        XCTAssertEqual(transport.tasks.count, 1)
        XCTAssertEqual(states, [.connecting, .connected, .disconnected])
    }

    func testSendForwardsRawTextToSocketTask() {
        let transport = RecordingAppServerConnectionTransport()
        let connection = AppServerConnection(
            serverURL: URL(string: "ws://127.0.0.1:4317/api/thread")!,
            transport: transport,
            reconnectDelay: 0
        )

        connection.connect()
        connection.send(text: #"{"type":"ping"}"#)

        XCTAssertEqual(transport.tasks[0].sentTexts, [#"{"type":"ping"}"#])
    }
}

private final class RecordingAppServerConnectionTransport: AppServerConnectionTransport {
    private(set) var tasks: [RecordingAppServerConnectionTask] = []

    func makeWebSocketTask(with url: URL) -> any AppServerWebSocketTask {
        let task = RecordingAppServerConnectionTask()
        tasks.append(task)
        return task
    }
}

private final class RecordingAppServerConnectionTask: AppServerWebSocketTask {
    private var receiveHandler: ((Result<URLSessionWebSocketTask.Message, Error>) -> Void)?
    private(set) var sentTexts: [String] = []

    func resume() {}

    func cancel(with closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {}

    func send(
        _ message: URLSessionWebSocketTask.Message,
        completionHandler: @escaping @Sendable (Error?) -> Void
    ) {
        if case .string(let text) = message {
            sentTexts.append(text)
        }
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

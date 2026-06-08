import XCTest
@testable import HandAgentDesktop

final class AppServerConnectionTests: XCTestCase {
    func testConnectOpensSocketAndEmitsConnectedState() {
        let transport = RecordingAppServerConnectionTransport()
        let connection = AppServerConnection(
            serverURL: URL(string: "ws://127.0.0.1:4317/api/platform")!,
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
            serverURL: URL(string: "ws://127.0.0.1:4317/api/platform")!,
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
            serverURL: URL(string: "ws://127.0.0.1:4317/api/platform")!,
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
            serverURL: URL(string: "ws://127.0.0.1:4317/api/platform")!,
            transport: transport,
            reconnectDelay: 0
        )

        connection.connect()
        connection.send(text: #"{"type":"ping"}"#)

        XCTAssertEqual(transport.tasks[0].sentTexts, [#"{"type":"ping"}"#])
    }
}

@MainActor
final class AgentActivityConnectionClientTests: XCTestCase {
    func testRunningActivitySnapshotUpdatesThreadRegistry() async {
        let transport = RecordingAppServerConnectionTransport()
        let connection = AppServerConnection(
            serverURL: URL(string: "ws://127.0.0.1:4317/api/activity")!,
            transport: transport,
            reconnectDelay: 0
        )
        let registry = ThreadRegistry()
        let client = AgentActivityConnectionClient(connection: connection, registry: registry)

        client.connect()
        transport.tasks[0].succeedReceive(
            """
            {
              "channel": "activity",
              "type": "activity.snapshot",
              "activeThreadId": "thread-1",
              "status": "running",
              "latestSummary": "正在回复",
              "waitingRequest": null,
              "error": null,
              "updatedAt": "2026-06-09T01:02:03.000Z"
            }
            """
        )
        await Task.yield()

        XCTAssertEqual(registry.primaryThreadID, "thread-1")
        XCTAssertEqual(registry.summaries["thread-1"]?.isRunning, true)
        XCTAssertEqual(registry.summaries["thread-1"]?.latestSummary, "正在回复")
    }

    func testIdleActivityKeepsThreadAsFocusTargetWithoutRunningState() async {
        let transport = RecordingAppServerConnectionTransport()
        let connection = AppServerConnection(
            serverURL: URL(string: "ws://127.0.0.1:4317/api/activity")!,
            transport: transport,
            reconnectDelay: 0
        )
        let registry = ThreadRegistry()
        let client = AgentActivityConnectionClient(connection: connection, registry: registry)

        client.connect()
        transport.tasks[0].succeedReceive(
            """
            {
              "channel": "activity",
              "type": "activity.changed",
              "activeThreadId": "thread-1",
              "status": "idle",
              "latestSummary": "点击开始",
              "waitingRequest": null,
              "error": null,
              "updatedAt": "2026-06-09T01:02:04.000Z"
            }
            """
        )
        await Task.yield()

        XCTAssertEqual(registry.primaryThreadID, "thread-1")
        XCTAssertEqual(registry.summaries["thread-1"]?.isRunning, false)
        XCTAssertEqual(registry.summaries["thread-1"]?.latestSummary, "点击开始")
    }
}

@MainActor
final class PlatformBridgeConnectionClientTests: XCTestCase {
    func testConnectPlatformBridgeSendsHelloToPlatformConnection() async {
        let transport = RecordingAppServerConnectionTransport()
        let connection = AppServerConnection(
            serverURL: URL(string: "ws://127.0.0.1:4317/api/platform")!,
            transport: transport,
            reconnectDelay: 0
        )
        let client = PlatformBridgeConnectionClient(
            connection: connection,
            platformBridge: PlatformBridgeService(provider: RecordingAppServerClientPlatformProvider())
        )

        client.connect()
        await Task.yield()

        let sent = transport.tasks[0].sentObjects
        XCTAssertEqual(sent.count, 1)
        XCTAssertEqual(sent[0]["channel"] as? String, "platform")
        XCTAssertEqual(sent[0]["type"] as? String, "platform_bridge_hello")
    }

    func testPlatformConnectionHandlesPlatformRequest() async {
        let transport = RecordingAppServerConnectionTransport()
        let connection = AppServerConnection(
            serverURL: URL(string: "ws://127.0.0.1:4317/api/platform")!,
            transport: transport,
            reconnectDelay: 0
        )
        let provider = RecordingAppServerClientPlatformProvider(result: ["text": "hello"])
        let client = PlatformBridgeConnectionClient(
            connection: connection,
            platformBridge: PlatformBridgeService(provider: provider)
        )

        client.connect()
        transport.tasks[0].succeedReceive(
            """
            {
              "channel": "platform",
              "type": "platform_request",
              "messageId": "m1",
              "timestamp": "2026-05-19T00:00:00Z",
              "payload": {
                "requestId": "r1",
                "method": "clipboard.read",
                "args": {}
              }
            }
            """
        )
        await Task.yield()

        XCTAssertEqual(provider.calls.map(\.method), ["clipboard.read"])
        let response = transport.tasks[0].sentObjects[1]
        XCTAssertEqual(response["channel"] as? String, "platform")
        XCTAssertEqual(response["type"] as? String, "platform_response")
    }

    func testAppServerStartsPlatformAndActivityConnections() async {
        let platformTransport = RecordingAppServerConnectionTransport()
        let platformConnection = AppServerConnection(
            serverURL: URL(string: "ws://127.0.0.1:4317/api/platform")!,
            transport: platformTransport,
            reconnectDelay: 0
        )
        let activityTransport = RecordingAppServerConnectionTransport()
        let activityConnection = AppServerConnection(
            serverURL: URL(string: "ws://127.0.0.1:4317/api/activity")!,
            transport: activityTransport,
            reconnectDelay: 0
        )
        let appServer = AppServer(
            agentServer: RecordingAgentServerStarter(),
            platformClient: PlatformBridgeConnectionClient(
                connection: platformConnection,
                platformBridge: PlatformBridgeService(provider: RecordingAppServerClientPlatformProvider())
            ),
            activityClient: AgentActivityConnectionClient(
                connection: activityConnection,
                registry: ThreadRegistry()
            )
        )

        appServer.start()
        await Task.yield()

        XCTAssertEqual(platformTransport.tasks.count, 1)
        XCTAssertEqual(activityTransport.tasks.count, 1)
        XCTAssertEqual(platformTransport.tasks[0].sentObjects.first?["type"] as? String, "platform_bridge_hello")
    }
}

@MainActor
private final class RecordingAgentServerStarter: AgentServerStarting {
    var lastStartupError: String?
    var fatalErrorMessage: String?
    var isAvailable = true
    var onAvailabilityChange: ((Bool) -> Void)?
    var onFatalError: ((String) -> Void)?

    func start() throws {}
    func stop() {}
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
    var sentObjects: [[String: Any]] {
        sentTexts.compactMap { text in
            guard let data = text.data(using: .utf8) else { return nil }
            return try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        }
    }

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

    func succeedReceive(_ text: String) {
        receiveHandler?(.success(.string(text)))
    }
}

@MainActor
private final class RecordingAppServerClientPlatformProvider: PlatformProvider {
    private(set) var calls: [(method: String, args: Any?)] = []
    let result: Any
    let error: Error?

    init(result: Any = [:] as [String: Any], error: Error? = nil) {
        self.result = result
        self.error = error
    }

    func handle(method: String, args: Any?) async throws -> Any? {
        calls.append((method: method, args: args))
        if let error {
            throw error
        }
        return result
    }
}

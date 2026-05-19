import XCTest
@testable import HandAgentDesktop

@MainActor
final class PlatformBridgeServiceTests: XCTestCase {
    func testHelloUsesPlatformChannelWithoutSessionId() {
        let transport = RecordingPlatformBridgeTransport()
        let service = PlatformBridgeService(
            serverURL: URL(string: "ws://127.0.0.1:4317/api/session")!,
            provider: RecordingPlatformProvider(),
            transport: transport
        )

        service.start()

        let object = transport.tasks[0].sentObjects[0]
        XCTAssertEqual(object["channel"] as? String, "platform")
        XCTAssertEqual(object["type"] as? String, "platform_bridge_hello")
        XCTAssertNil(object["sessionId"])
    }

    func testResponseUsesPlatformChannelWithoutSessionId() async {
        let transport = RecordingPlatformBridgeTransport()
        let service = PlatformBridgeService(
            serverURL: URL(string: "ws://127.0.0.1:4317/api/session")!,
            provider: RecordingPlatformProvider(result: ["text": "hello"]),
            transport: transport
        )
        service.start()

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

        let object = transport.tasks[0].sentObjects[1]
        XCTAssertEqual(object["channel"] as? String, "platform")
        XCTAssertEqual(object["type"] as? String, "platform_response")
        XCTAssertNil(object["sessionId"])
        let payload = object["payload"] as? [String: Any]
        XCTAssertEqual(payload?["requestId"] as? String, "r1")
        XCTAssertEqual(payload?["status"] as? String, "ok")
    }
}

private final class RecordingPlatformBridgeTransport: PlatformBridgeSocketTransport {
    private(set) var tasks: [RecordingPlatformBridgeWebSocketTask] = []

    func makeWebSocketTask(with url: URL) -> any SessionWebSocketTask {
        let task = RecordingPlatformBridgeWebSocketTask()
        tasks.append(task)
        return task
    }
}

private final class RecordingPlatformBridgeWebSocketTask: SessionWebSocketTask {
    private var receiveHandler: ((Result<URLSessionWebSocketTask.Message, Error>) -> Void)?
    private(set) var sentObjects: [[String: Any]] = []

    func resume() {}

    func cancel(with closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {}

    func send(
        _ message: URLSessionWebSocketTask.Message,
        completionHandler: @escaping @Sendable (Error?) -> Void
    ) {
        guard case .string(let text) = message,
              let data = text.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            completionHandler(nil)
            return
        }
        sentObjects.append(object)
        completionHandler(nil)
    }

    func receive(
        completionHandler: @escaping @Sendable (Result<URLSessionWebSocketTask.Message, Error>) -> Void
    ) {
        receiveHandler = completionHandler
    }

    func succeedReceive(_ text: String) {
        receiveHandler?(.success(.string(text)))
    }
}

private struct RecordingPlatformProvider: PlatformProvider {
    let result: Any

    init(result: Any = [:] as [String: Any]) {
        self.result = result
    }

    func handle(method: String, args: Any?) async throws -> Any? {
        result
    }
}

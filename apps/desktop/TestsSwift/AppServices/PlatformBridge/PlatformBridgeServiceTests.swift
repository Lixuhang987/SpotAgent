import XCTest
@testable import HandAgentDesktop

@MainActor
final class PlatformBridgeServiceTests: XCTestCase {
    func testHelloUsesPlatformChannelWithoutThreadRouting() {
        let transport = RecordingPlatformBridgeTransport()
        let service = PlatformBridgeService(
            serverURL: URL(string: "ws://127.0.0.1:4317/api/thread")!,
            provider: RecordingPlatformProvider(),
            transport: transport
        )

        service.start()

        let object = transport.tasks[0].sentObjects[0]
        XCTAssertEqual(object["channel"] as? String, "platform")
        XCTAssertEqual(object["type"] as? String, "platform_bridge_hello")
        XCTAssertNil(object["threadId"])
    }

    func testResponseUsesPlatformChannelWithoutThreadRouting() async {
        let transport = RecordingPlatformBridgeTransport()
        let service = PlatformBridgeService(
            serverURL: URL(string: "ws://127.0.0.1:4317/api/thread")!,
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
        XCTAssertNil(object["threadId"])
        let payload = object["payload"] as? [String: Any]
        XCTAssertEqual(payload?["requestId"] as? String, "r1")
        XCTAssertEqual(payload?["status"] as? String, "ok")
    }

    func testRequestDeliversMethodAndArgsToProvider() async {
        let provider = RecordingPlatformProvider(result: ["ok": true])
        let transport = RecordingPlatformBridgeTransport()
        let service = PlatformBridgeService(
            serverURL: URL(string: "ws://127.0.0.1:4317/api/thread")!,
            provider: provider,
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
                "method": "screen.capture",
                "args": {
                  "target": {
                    "kind": "display",
                    "displayId": "1"
                  }
                }
              }
            }
            """
        )
        await Task.yield()

        XCTAssertEqual(provider.calls.count, 1)
        XCTAssertEqual(provider.calls[0].method, "screen.capture")
        let args = provider.calls[0].args as? [String: Any]
        let target = args?["target"] as? [String: Any]
        XCTAssertEqual(target?["kind"] as? String, "display")
        XCTAssertEqual(target?["displayId"] as? String, "1")
    }

    func testPlatformBridgeErrorResponseIncludesProviderCode() async {
        let transport = RecordingPlatformBridgeTransport()
        let service = PlatformBridgeService(
            serverURL: URL(string: "ws://127.0.0.1:4317/api/thread")!,
            provider: RecordingPlatformProvider(error: PlatformBridgeError(
                code: "capture_failed",
                message: "ScreenCaptureKit failed"
            )),
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
                "method": "screen.capture",
                "args": {}
              }
            }
            """
        )
        await Task.yield()

        let object = transport.tasks[0].sentObjects[1]
        let payload = object["payload"] as? [String: Any]
        XCTAssertEqual(payload?["requestId"] as? String, "r1")
        XCTAssertEqual(payload?["status"] as? String, "error")
        XCTAssertEqual(payload?["code"] as? String, "capture_failed")
        XCTAssertEqual(payload?["message"] as? String, "ScreenCaptureKit failed")
    }
}

private final class RecordingPlatformBridgeTransport: PlatformBridgeSocketTransport {
    private(set) var tasks: [RecordingPlatformBridgeWebSocketTask] = []

    func makeWebSocketTask(with url: URL) -> any AppServerWebSocketTask {
        let task = RecordingPlatformBridgeWebSocketTask()
        tasks.append(task)
        return task
    }
}

private final class RecordingPlatformBridgeWebSocketTask: AppServerWebSocketTask {
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

private final class RecordingPlatformProvider: PlatformProvider {
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

import XCTest
@testable import HandAgentDesktop

@MainActor
final class PlatformBridgeServiceTests: XCTestCase {
    func testHelloUsesPlatformChannelWithoutThreadRouting() {
        let service = PlatformBridgeService(
            provider: RecordingPlatformProvider()
        )

        let object = decodeObject(service.makeHelloMessage())
        XCTAssertEqual(object["channel"] as? String, "platform")
        XCTAssertEqual(object["type"] as? String, "platform_bridge_hello")
        XCTAssertNil(object["threadId"])
    }

    func testResponseUsesPlatformChannelWithoutThreadRouting() async {
        var sentObjects: [[String: Any]] = []
        let service = PlatformBridgeService(
            provider: RecordingPlatformProvider(result: ["text": "hello"])
        )

        await service.handleIncoming(
            raw:
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
            """,
            send: { sentObjects.append(Self.decodeObject($0)) }
        )

        let object = sentObjects[0]
        XCTAssertEqual(object["channel"] as? String, "platform")
        XCTAssertEqual(object["type"] as? String, "platform_response")
        XCTAssertNil(object["threadId"])
        let payload = object["payload"] as? [String: Any]
        XCTAssertEqual(payload?["requestId"] as? String, "r1")
        XCTAssertEqual(payload?["status"] as? String, "ok")
    }

    func testRequestDeliversMethodAndArgsToProvider() async {
        let provider = RecordingPlatformProvider(result: ["ok": true])
        let service = PlatformBridgeService(
            provider: provider
        )

        await service.handleIncoming(
            raw:
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
            """,
            send: { _ in }
        )

        XCTAssertEqual(provider.calls.count, 1)
        XCTAssertEqual(provider.calls[0].method, "screen.capture")
        let args = provider.calls[0].args as? [String: Any]
        let target = args?["target"] as? [String: Any]
        XCTAssertEqual(target?["kind"] as? String, "display")
        XCTAssertEqual(target?["displayId"] as? String, "1")
    }

    func testPlatformBridgeErrorResponseIncludesProviderCode() async {
        var sentObjects: [[String: Any]] = []
        let service = PlatformBridgeService(
            provider: RecordingPlatformProvider(error: PlatformBridgeError(
                code: "capture_failed",
                message: "ScreenCaptureKit failed"
            ))
        )

        await service.handleIncoming(
            raw:
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
            """,
            send: { sentObjects.append(Self.decodeObject($0)) }
        )

        let object = sentObjects[0]
        let payload = object["payload"] as? [String: Any]
        XCTAssertEqual(payload?["requestId"] as? String, "r1")
        XCTAssertEqual(payload?["status"] as? String, "error")
        XCTAssertEqual(payload?["code"] as? String, "capture_failed")
        XCTAssertEqual(payload?["message"] as? String, "ScreenCaptureKit failed")
    }

    private static func decodeObject(_ text: String) -> [String: Any] {
        guard let data = text.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            XCTFail("Expected JSON object")
            return [:]
        }
        return object
    }

    private func decodeObject(_ text: String) -> [String: Any] {
        Self.decodeObject(text)
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

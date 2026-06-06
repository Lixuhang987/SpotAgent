import Foundation

@MainActor
final class PlatformBridgeService {
    typealias Send = (String) -> Void

    private let provider: PlatformProvider

    init(
        provider: PlatformProvider = MacPlatformProvider()
    ) {
        self.provider = provider
    }

    func makeHelloMessage() -> String {
        let envelope: [String: Any] = [
            "channel": "platform",
            "type": "platform_bridge_hello",
            "messageId": UUID().uuidString,
            "timestamp": Self.timestamp(),
            "payload": ["agent": "macos-desktop"],
        ]
        return encodeJSON(envelope)
    }

    func handleIncoming(raw: String, send: @escaping Send) async {
        guard let data = raw.data(using: .utf8) else { return }
        guard let envelope = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return
        }
        guard
            let channel = envelope["channel"] as? String,
            channel == "platform",
            let type = envelope["type"] as? String,
            type == "platform_request",
            let payload = envelope["payload"] as? [String: Any],
            let requestId = payload["requestId"] as? String,
            let method = payload["method"] as? String
        else {
            return
        }

        let args = payload["args"]
        do {
            let result = try await provider.handle(method: method, args: args)
            sendResponse(
                requestId: requestId,
                status: "ok",
                payload: ["result": result as Any?],
                send: send
            )
        } catch let bridgeError as PlatformBridgeError {
            sendResponse(
                requestId: requestId,
                status: "error",
                payload: [
                    "message": bridgeError.message,
                    "code": bridgeError.code,
                ],
                send: send
            )
        } catch {
            sendResponse(
                requestId: requestId,
                status: "error",
                payload: ["message": error.localizedDescription],
                send: send
            )
        }
    }

    private func sendResponse(
        requestId: String,
        status: String,
        payload: [String: Any?],
        send: Send
    ) {
        var responsePayload: [String: Any] = [
            "requestId": requestId,
            "status": status,
        ]
        for (key, value) in payload {
            if let value { responsePayload[key] = value }
        }
        let envelope: [String: Any] = [
            "channel": "platform",
            "type": "platform_response",
            "messageId": UUID().uuidString,
            "timestamp": Self.timestamp(),
            "payload": responsePayload,
        ]
        send(encodeJSON(envelope))
    }

    private func encodeJSON(_ object: [String: Any]) -> String {
        guard
            let data = try? JSONSerialization.data(withJSONObject: object, options: []),
            let string = String(data: data, encoding: .utf8)
        else {
            return "{}"
        }
        return string
    }

    private static func timestamp() -> String {
        ISO8601DateFormatter().string(from: Date())
    }
}

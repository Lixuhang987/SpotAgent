import Foundation

@MainActor
protocol PlatformBridgeRunning: AnyObject {
    func start()
    func stop()
}

@MainActor
final class PlatformBridgeService: PlatformBridgeRunning {
    private let serverURL: URL
    private let session: URLSession
    private let provider: PlatformProvider
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    private var socketTask: URLSessionWebSocketTask?
    private var reconnectWorkItem: DispatchWorkItem?
    private var stopped = false

    init(
        serverURL: URL,
        provider: PlatformProvider = MacPlatformProvider(),
        session: URLSession = .shared
    ) {
        self.serverURL = serverURL
        self.provider = provider
        self.session = session
    }

    func start() {
        stopped = false
        connect()
    }

    func stop() {
        stopped = true
        reconnectWorkItem?.cancel()
        reconnectWorkItem = nil
        socketTask?.cancel(with: .goingAway, reason: nil)
        socketTask = nil
    }

    private func connect() {
        guard !stopped, socketTask == nil else { return }
        let task = session.webSocketTask(with: serverURL)
        socketTask = task
        task.resume()
        sendHello(on: task)
        receiveNext()
    }

    private func sendHello(on task: URLSessionWebSocketTask) {
        let envelope: [String: Any] = [
            "type": "platform_bridge_hello",
            "sessionId": "_platform",
            "messageId": UUID().uuidString,
            "timestamp": Self.timestamp(),
            "payload": ["agent": "macos-desktop"],
        ]
        sendJSON(envelope, on: task)
    }

    private func receiveNext() {
        guard let task = socketTask else { return }
        task.receive { [weak self] result in
            guard let self else { return }
            switch result {
            case .failure:
                Task { @MainActor in self.handleDisconnect() }
            case .success(let message):
                let raw: String? = {
                    switch message {
                    case .string(let s): return s
                    case .data(let d): return String(data: d, encoding: .utf8)
                    @unknown default: return nil
                    }
                }()
                Task { @MainActor in
                    if let raw {
                        await self.handleIncoming(raw: raw)
                    }
                    self.receiveNext()
                }
            }
        }
    }

    private func handleIncoming(raw: String) async {
        guard let data = raw.data(using: .utf8) else { return }
        guard let envelope = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return
        }
        guard
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
            sendResponse(requestId: requestId, status: "ok", payload: ["result": result as Any?])
        } catch let bridgeError as PlatformBridgeError {
            sendResponse(
                requestId: requestId,
                status: "error",
                payload: [
                    "message": bridgeError.message,
                    "code": bridgeError.code,
                ]
            )
        } catch {
            sendResponse(
                requestId: requestId,
                status: "error",
                payload: ["message": error.localizedDescription]
            )
        }
    }

    private func sendResponse(requestId: String, status: String, payload: [String: Any?]) {
        guard let task = socketTask else { return }
        var responsePayload: [String: Any] = [
            "requestId": requestId,
            "status": status,
        ]
        for (key, value) in payload {
            if let value { responsePayload[key] = value }
        }
        let envelope: [String: Any] = [
            "type": "platform_response",
            "sessionId": "_platform",
            "messageId": UUID().uuidString,
            "timestamp": Self.timestamp(),
            "payload": responsePayload,
        ]
        sendJSON(envelope, on: task)
    }

    private func sendJSON(_ object: [String: Any], on task: URLSessionWebSocketTask) {
        guard
            let data = try? JSONSerialization.data(withJSONObject: object, options: []),
            let string = String(data: data, encoding: .utf8)
        else {
            return
        }
        task.send(.string(string)) { _ in }
    }

    private func handleDisconnect() {
        socketTask = nil
        guard !stopped else { return }
        let work = DispatchWorkItem { [weak self] in
            Task { @MainActor in self?.connect() }
        }
        reconnectWorkItem = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0, execute: work)
    }

    private static func timestamp() -> String {
        ISO8601DateFormatter().string(from: Date())
    }
}

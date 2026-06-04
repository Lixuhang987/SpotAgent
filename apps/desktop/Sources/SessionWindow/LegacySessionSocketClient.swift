import Foundation

protocol SessionWebSocketTask: AnyObject {
    func resume()
    func cancel(with closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?)
    func send(
        _ message: URLSessionWebSocketTask.Message,
        completionHandler: @escaping @Sendable (Error?) -> Void
    )
    func receive(
        completionHandler: @escaping @Sendable (Result<URLSessionWebSocketTask.Message, Error>) -> Void
    )
}

extension URLSessionWebSocketTask: SessionWebSocketTask {}

protocol SessionSocketTransport {
    func makeWebSocketTask(with url: URL) -> any SessionWebSocketTask
}

final class URLSessionSocketTransport: SessionSocketTransport {
    private let session: URLSession

    init(session: URLSession = .shared) {
        self.session = session
    }

    func makeWebSocketTask(with url: URL) -> any SessionWebSocketTask {
        session.webSocketTask(with: url)
    }
}

final class SessionSocketClient: @unchecked Sendable {
    var onEvent: ((SessionEvent) -> Void)?

    private let serverURL: URL?
    private let transport: any SessionSocketTransport
    private var socketTask: (any SessionWebSocketTask)?

    init(serverURL: URL?, session: URLSession = .shared) {
        self.serverURL = serverURL
        self.transport = URLSessionSocketTransport(session: session)
    }

    init(
        serverURL: URL?,
        transport: any SessionSocketTransport,
        reconnectDelay _: TimeInterval = 0
    ) {
        self.serverURL = serverURL
        self.transport = transport
    }

    static var noop: SessionSocketClient {
        SessionSocketClient(serverURL: nil)
    }

    func connect(sessionID: String) {
        guard let serverURL else { return }
        let task = transport.makeWebSocketTask(with: serverURL)
        socketTask = task
        task.resume()
        onEvent?(.connectionState(.connected))
        sendJSON([
            "type": "open_session",
            "sessionId": sessionID,
            "messageId": UUID().uuidString,
            "timestamp": Self.timestamp(),
            "payload": [:] as [String: Any],
        ])
    }

    func disconnect() {
        socketTask?.cancel(with: .goingAway, reason: nil)
        socketTask = nil
        onEvent?(.connectionState(.disconnected))
    }

    func sendUserMessage(
        sessionID: String,
        messageID: String,
        text: String,
        timestamp: String,
        attachments: [UserMessageAttachmentPayload] = []
    ) {
        var payload: [String: Any] = ["text": text]
        if !attachments.isEmpty {
            payload["attachments"] = attachments.map(Self.encodeAttachment)
        }
        sendJSON([
            "type": "user_message",
            "sessionId": sessionID,
            "messageId": messageID,
            "timestamp": timestamp,
            "payload": payload,
        ])
    }

    func sendInterrupt(sessionID: String) {
        sendJSON([
            "type": "interrupt",
            "sessionId": sessionID,
            "messageId": UUID().uuidString,
            "timestamp": Self.timestamp(),
            "payload": [:] as [String: Any],
        ])
    }

    @discardableResult
    func sendCreateSession(
        initialText _: String? = nil,
        attachments _: [UserMessageAttachmentPayload] = [],
        actionBinding _: ActionBindingPayload? = nil,
        workspaceId: String? = nil
    ) -> String {
        let messageID = UUID().uuidString
        var payload: [String: Any] = [:]
        if let workspaceId {
            payload["workspaceId"] = workspaceId
        }
        sendJSON([
            "type": "create_session_request",
            "sessionId": "",
            "messageId": messageID,
            "timestamp": Self.timestamp(),
            "payload": payload,
        ])
        return messageID
    }

    func sendListSessions(sessionID: String) {
        sendJSON([
            "type": "list_sessions_request",
            "sessionId": sessionID,
            "messageId": UUID().uuidString,
            "timestamp": Self.timestamp(),
            "payload": [:] as [String: Any],
        ])
    }

    func sendLoadSession(sessionID: String, targetSessionId: String) {
        sendJSON([
            "type": "load_session_request",
            "sessionId": sessionID,
            "messageId": UUID().uuidString,
            "timestamp": Self.timestamp(),
            "payload": ["targetSessionId": targetSessionId],
        ])
    }

    func sendDeleteSession(sessionID: String, targetSessionId: String) {
        sendJSON([
            "type": "delete_session_request",
            "sessionId": sessionID,
            "messageId": UUID().uuidString,
            "timestamp": Self.timestamp(),
            "payload": ["targetSessionId": targetSessionId],
        ])
    }

    func sendPermissionResponse(
        sessionID: String,
        requestId: String,
        decision: String,
        scope: String?
    ) {
        var payload: [String: Any] = ["decision": decision]
        if let scope {
            payload["scope"] = scope
        }
        sendJSON([
            "type": "permission_response",
            "sessionId": sessionID,
            "messageId": requestId,
            "timestamp": Self.timestamp(),
            "payload": payload,
        ])
    }

    func sendWorkspaceAskResponse(
        sessionID: String,
        requestId: String,
        workspaceId: String?,
        cancelled: Bool
    ) {
        var payload: [String: Any] = ["cancelled": cancelled]
        if let workspaceId {
            payload["workspaceId"] = workspaceId
        }
        sendJSON([
            "type": "workspace_ask_response",
            "sessionId": sessionID,
            "messageId": requestId,
            "timestamp": Self.timestamp(),
            "payload": payload,
        ])
    }

    private func sendJSON(_ object: [String: Any]) {
        guard let socketTask,
              let data = try? JSONSerialization.data(withJSONObject: object),
              let text = String(data: data, encoding: .utf8) else { return }
        socketTask.send(.string(text)) { _ in }
    }

    private static func encodeAttachment(_ attachment: UserMessageAttachmentPayload) -> [String: Any] {
        var result: [String: Any] = [
            "kind": attachment.kind.rawValue,
            "id": attachment.id,
        ]
        if let text = attachment.text {
            result["text"] = text
        }
        if let mimeType = attachment.mimeType {
            result["mimeType"] = mimeType
        }
        if let base64 = attachment.base64 {
            result["base64"] = base64
        }
        return result
    }

    private static func timestamp() -> String {
        ISO8601DateFormatter().string(from: Date())
    }
}

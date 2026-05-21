import Foundation

enum SessionConnectionState: Equatable {
    case disconnected
    case connecting
    case connected
    case reconnecting
}

struct SessionListItem: Equatable, Identifiable {
    let id: String
    let title: String?
    let updatedAt: String
    let messageCount: Int
}

struct WorkspaceAskCandidate: Equatable, Identifiable, Decodable {
    let id: String
    let name: String
    let description: String
    let isDefault: Bool
}

enum SessionEvent: Equatable {
    case userMessage(messageID: String, text: String, timestamp: String)
    case assistantMessageStart(messageID: String, timestamp: String)
    case assistantMessageDelta(messageID: String, text: String, timestamp: String)
    case assistantMessageEnd(messageID: String, status: String, timestamp: String)
    case toolMessage(messageID: String, name: String, text: String, status: String, timestamp: String)
    case permissionRequest(requestId: String, toolName: String, toolCallId: String?, argumentsJSON: String)
    case workspaceAskRequest(requestId: String, prompt: String, candidates: [WorkspaceAskCandidate])
    case status(value: String)
    case error(messageID: String, message: String, timestamp: String)
    case sessionSnapshot(messages: [SessionBubble], status: String)
    case sessionOpenFailed(reason: String, message: String)
    case createSessionResponse(sessionID: String, title: String?)
    case userMessageFailed(reason: String, message: String)
    case deleteSessionResponse(targetSessionID: String, status: String)
    case sessionList(sessions: [SessionListItem])
    case sessionLoaded(targetSessionId: String, title: String?, messages: [SessionBubble])
    case connectionState(SessionConnectionState)

    static func == (lhs: SessionEvent, rhs: SessionEvent) -> Bool {
        switch (lhs, rhs) {
        case let (.userMessage(a1, a2, a3), .userMessage(b1, b2, b3)):
            return a1 == b1 && a2 == b2 && a3 == b3
        case let (.assistantMessageStart(a1, a2), .assistantMessageStart(b1, b2)):
            return a1 == b1 && a2 == b2
        case let (.assistantMessageDelta(a1, a2, a3), .assistantMessageDelta(b1, b2, b3)):
            return a1 == b1 && a2 == b2 && a3 == b3
        case let (.assistantMessageEnd(a1, a2, a3), .assistantMessageEnd(b1, b2, b3)):
            return a1 == b1 && a2 == b2 && a3 == b3
        case let (.toolMessage(a1, a2, a3, a4, a5), .toolMessage(b1, b2, b3, b4, b5)):
            return a1 == b1 && a2 == b2 && a3 == b3 && a4 == b4 && a5 == b5
        case let (.permissionRequest(a1, a2, a3, a4), .permissionRequest(b1, b2, b3, b4)):
            return a1 == b1 && a2 == b2 && a3 == b3 && a4 == b4
        case let (.workspaceAskRequest(a1, a2, a3), .workspaceAskRequest(b1, b2, b3)):
            return a1 == b1 && a2 == b2 && a3 == b3
        case let (.status(a), .status(b)):
            return a == b
        case let (.error(a1, a2, a3), .error(b1, b2, b3)):
            return a1 == b1 && a2 == b2 && a3 == b3
        case let (.sessionSnapshot(a1, a2), .sessionSnapshot(b1, b2)):
            return a1 == b1 && a2 == b2
        case let (.sessionOpenFailed(a1, a2), .sessionOpenFailed(b1, b2)):
            return a1 == b1 && a2 == b2
        case let (.createSessionResponse(a1, a2), .createSessionResponse(b1, b2)):
            return a1 == b1 && a2 == b2
        case let (.userMessageFailed(a1, a2), .userMessageFailed(b1, b2)):
            return a1 == b1 && a2 == b2
        case let (.deleteSessionResponse(a1, a2), .deleteSessionResponse(b1, b2)):
            return a1 == b1 && a2 == b2
        case let (.sessionList(a), .sessionList(b)):
            return a == b
        case let (.sessionLoaded(a1, a2, a3), .sessionLoaded(b1, b2, b3)):
            return a1 == b1 && a2 == b2 && a3 == b3
        case let (.connectionState(a), .connectionState(b)):
            return a == b
        default:
            return false
        }
    }
}

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

    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()
    private let serverURL: URL?
    private let transport: any SessionSocketTransport
    private let reconnectDelay: TimeInterval

    private var currentSessionID: String?
    private var socketTask: (any SessionWebSocketTask)?
    private var reconnectWorkItem: DispatchWorkItem?
    private var userRequestedDisconnect = false

    init(serverURL: URL?, session: URLSession = .shared) {
        self.serverURL = serverURL
        self.transport = URLSessionSocketTransport(session: session)
        self.reconnectDelay = 2
    }

    init(
        serverURL: URL?,
        transport: any SessionSocketTransport,
        reconnectDelay: TimeInterval = 2
    ) {
        self.serverURL = serverURL
        self.transport = transport
        self.reconnectDelay = reconnectDelay
    }

    static var noop: SessionSocketClient {
        SessionSocketClient(serverURL: nil)
    }

    func connect(sessionID: String) {
        currentSessionID = sessionID
        userRequestedDisconnect = false

        guard let serverURL, socketTask == nil else { return }
        openSocket(serverURL: serverURL, state: .connecting)
    }

    private func openSocket(serverURL: URL, state: SessionConnectionState?) {
        reconnectWorkItem?.cancel()
        reconnectWorkItem = nil

        if let state {
            onEvent?(.connectionState(state))
        }

        let socketTask = transport.makeWebSocketTask(with: serverURL)
        self.socketTask = socketTask
        socketTask.resume()
        receiveNextMessage()
        onEvent?(.connectionState(.connected))
        if let currentSessionID {
            sendOpenSession(sessionID: currentSessionID)
        }
    }

    func disconnect() {
        userRequestedDisconnect = true
        reconnectWorkItem?.cancel()
        reconnectWorkItem = nil
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
        guard let socketTask else { return }

        let envelope = UserMessageEnvelope(
            sessionId: sessionID,
            messageId: messageID,
            timestamp: timestamp,
            payload: UserMessagePayload(text: text, attachments: attachments.isEmpty ? nil : attachments)
        )
        send(envelope, on: socketTask)
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

    func sendCreateSession(
        initialText: String? = nil,
        attachments: [UserMessageAttachmentPayload] = []
    ) {
        let payload: [String: Any?] = [
            "initialText": initialText,
            "attachments": attachments.isEmpty ? nil : attachments.map(\.jsonObject),
        ]
        sendJSON([
            "type": "create_session_request",
            "sessionId": "",
            "messageId": UUID().uuidString,
            "timestamp": Self.timestamp(),
            "payload": payload.compactMapValues { $0 },
        ])
    }

    private func sendOpenSession(sessionID: String) {
        guard let socketTask else { return }

        let envelope = OpenSessionEnvelope(
            sessionId: sessionID,
            messageId: UUID().uuidString,
            timestamp: Self.timestamp(),
            payload: OpenSessionPayload()
        )
        send(envelope, on: socketTask)
    }

    private func send<T: Encodable>(_ envelope: T, on socketTask: any SessionWebSocketTask) {
        guard let data = try? encoder.encode(envelope),
              let text = String(data: data, encoding: .utf8) else {
            return
        }

        socketTask.send(.string(text)) { [weak self] error in
            guard let self, let error else { return }

            self.onEvent?(
                .error(
                    messageID: UUID().uuidString,
                    message: error.localizedDescription,
                    timestamp: Self.timestamp()
                )
            )
        }
    }

    private func receiveNextMessage() {
        guard let socketTask else { return }

        socketTask.receive { [weak self] result in
            guard let self else { return }

            switch result {
            case .success(let message):
                let payload: String?
                switch message {
                case .string(let string):
                    payload = string
                case .data(let data):
                    payload = String(data: data, encoding: .utf8)
                @unknown default:
                    payload = nil
                }

                if let payload,
                   let event = self.decodeEvent(from: payload) {
                    self.onEvent?(event)
                }

                self.receiveNextMessage()
            case .failure(let error):
                self.socketTask = nil
                self.scheduleReconnect(after: error)
            }
        }
    }

    private func scheduleReconnect(after error: Error) {
        if userRequestedDisconnect {
            return
        }

        guard serverURL != nil else {
            onEvent?(
                .error(
                    messageID: UUID().uuidString,
                    message: error.localizedDescription,
                    timestamp: Self.timestamp()
                )
            )
            return
        }

        onEvent?(.connectionState(.reconnecting))
        reconnectWorkItem?.cancel()

        let work = DispatchWorkItem { [weak self] in
            guard let self, let serverURL = self.serverURL, !self.userRequestedDisconnect else { return }
            self.openSocket(serverURL: serverURL, state: nil)
        }
        reconnectWorkItem = work

        if reconnectDelay <= 0 {
            work.perform()
        } else {
            DispatchQueue.main.asyncAfter(deadline: .now() + reconnectDelay, execute: work)
        }
    }

    private func decodeEvent(from text: String) -> SessionEvent? {
        guard let data = text.data(using: .utf8),
              let envelope = try? decoder.decode(IncomingEnvelope.self, from: data) else {
            return nil
        }

        if let currentSessionID,
           !currentSessionID.isEmpty,
           envelope.sessionId != currentSessionID {
            return nil
        }

        switch envelope.type {
        case "assistant_message_start":
            return .assistantMessageStart(
                messageID: envelope.messageId,
                timestamp: envelope.timestamp
            )
        case "assistant_message_delta":
            return .assistantMessageDelta(
                messageID: envelope.messageId,
                text: envelope.payload.text ?? "",
                timestamp: envelope.timestamp
            )
        case "assistant_message_end":
            return .assistantMessageEnd(
                messageID: envelope.messageId,
                status: envelope.payload.status ?? "completed",
                timestamp: envelope.timestamp
            )
        case "tool_message":
            return .toolMessage(
                messageID: envelope.messageId,
                name: envelope.payload.name ?? "tool",
                text: envelope.payload.text ?? "",
                status: envelope.payload.status ?? "completed",
                timestamp: envelope.timestamp
            )
        case "status":
            return .status(value: envelope.payload.value ?? "idle")
        case "error":
            return .error(
                messageID: envelope.messageId,
                message: envelope.payload.message ?? "Unknown session error.",
                timestamp: envelope.timestamp
            )
        case "session_snapshot":
            let bubbles = envelope.payload.messages?.map {
                SessionBubble(id: $0.id, role: $0.role, text: $0.text)
            } ?? []
            return .sessionSnapshot(
                messages: bubbles,
                status: envelope.payload.value ?? "idle"
            )
        case "session_open_failed":
            return .sessionOpenFailed(
                reason: envelope.payload.reason ?? "unavailable",
                message: envelope.payload.message ?? "Session open failed."
            )
        case "create_session_response":
            return .createSessionResponse(
                sessionID: envelope.sessionId,
                title: envelope.payload.title ?? nil
            )
        case "user_message_failed":
            return .userMessageFailed(
                reason: envelope.payload.reason ?? "invalid_request",
                message: envelope.payload.message ?? "User message failed."
            )
        case "delete_session_response":
            return .deleteSessionResponse(
                targetSessionID: envelope.payload.targetSessionId ?? "",
                status: envelope.payload.status ?? "not_found"
            )
        case "permission_request":
            return .permissionRequest(
                requestId: envelope.payload.requestId ?? envelope.messageId,
                toolName: envelope.payload.toolName ?? "unknown",
                toolCallId: envelope.payload.toolCallId,
                argumentsJSON: Self.extractPermissionArgumentsJSON(from: data)
            )
        case "workspace_ask_request":
            return .workspaceAskRequest(
                requestId: envelope.payload.requestId ?? envelope.messageId,
                prompt: envelope.payload.prompt ?? "请选择 workspace",
                candidates: envelope.payload.candidates ?? []
            )
        case "list_sessions_response":
            let items = envelope.payload.sessions?.map {
                SessionListItem(
                    id: $0.id,
                    title: $0.title,
                    updatedAt: $0.updatedAt ?? "",
                    messageCount: $0.messageCount ?? 0
                )
            } ?? []
            return .sessionList(sessions: items)
        case "load_session_response":
            let bubbles = envelope.payload.messages?.map {
                SessionBubble(id: $0.id, role: $0.role, text: $0.text)
            } ?? []
            return .sessionLoaded(
                targetSessionId: envelope.payload.targetSessionId ?? "",
                title: envelope.payload.title ?? nil,
                messages: bubbles
            )
        default:
            return nil
        }
    }

    func handleIncomingTextForTesting(_ text: String, currentSessionID: String?) {
        self.currentSessionID = currentSessionID
        if let event = decodeEvent(from: text) {
            onEvent?(event)
        }
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

    private func sendJSON(_ object: [String: Any]) {
        guard let socketTask else { return }
        guard
            let data = try? JSONSerialization.data(withJSONObject: object),
            let text = String(data: data, encoding: .utf8)
        else { return }
        socketTask.send(.string(text)) { _ in }
    }

    func sendPermissionResponse(
        sessionID: String,
        requestId: String,
        decision: String,
        scope: String? = nil
    ) {
        guard let socketTask else { return }
        let envelope: [String: Any?] = [
            "type": "permission_response",
            "sessionId": sessionID,
            "messageId": UUID().uuidString,
            "timestamp": Self.timestamp(),
            "payload": [
                "requestId": requestId,
                "decision": decision,
                "scope": scope as Any?,
            ] as [String: Any?],
        ]
        guard
            let data = try? JSONSerialization.data(withJSONObject: envelope.compactMapValues { $0 }),
            let text = String(data: data, encoding: .utf8)
        else { return }
        socketTask.send(.string(text)) { _ in }
    }

    func sendWorkspaceAskResponse(
        sessionID: String,
        requestId: String,
        workspaceId: String?,
        cancelled: Bool
    ) {
        guard socketTask != nil else { return }
        var payload: [String: Any] = [
            "requestId": requestId,
            "cancelled": cancelled,
        ]
        if let workspaceId {
            payload["workspaceId"] = workspaceId
        }
        sendJSON([
            "type": "workspace_ask_response",
            "sessionId": sessionID,
            "messageId": UUID().uuidString,
            "timestamp": Self.timestamp(),
            "payload": payload,
        ])
    }

    private static func timestamp() -> String {
        ISO8601DateFormatter().string(from: Date())
    }

    static func extractPermissionArgumentsJSON(from data: Data) -> String {
        guard
            let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let payload = object["payload"] as? [String: Any],
            let arguments = payload["arguments"] as? [String: Any]
        else {
            return "{}"
        }

        let encoder = JSONSerialization.WritingOptions([.sortedKeys, .prettyPrinted])
        guard
            let encoded = try? JSONSerialization.data(withJSONObject: arguments, options: encoder),
            let text = String(data: encoded, encoding: .utf8)
        else {
            return "{}"
        }
        return text
    }
}

private struct OpenSessionEnvelope: Encodable {
    let type = "open_session"
    let sessionId: String
    let messageId: String
    let timestamp: String
    let payload: OpenSessionPayload
}

private struct OpenSessionPayload: Encodable {}

private struct UserMessageEnvelope: Encodable {
    let type = "user_message"
    let sessionId: String
    let messageId: String
    let timestamp: String
    let payload: UserMessagePayload
}

struct UserMessageAttachmentPayload: Encodable, Equatable {
    enum Kind: String, Encodable {
        case textSelection = "text_selection"
        case image
    }

    let kind: Kind
    let id: String
    let text: String?
    let mimeType: String?
    let base64: String?

    static func textSelection(id: String, text: String) -> UserMessageAttachmentPayload {
        UserMessageAttachmentPayload(
            kind: .textSelection,
            id: id,
            text: text,
            mimeType: nil,
            base64: nil
        )
    }

    static func image(id: String, mimeType: String, base64: String) -> UserMessageAttachmentPayload {
        UserMessageAttachmentPayload(
            kind: .image,
            id: id,
            text: nil,
            mimeType: mimeType,
            base64: base64
        )
    }

    private enum CodingKeys: String, CodingKey {
        case kind, id, text, mimeType, base64
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(kind, forKey: .kind)
        try container.encode(id, forKey: .id)
        try container.encodeIfPresent(text, forKey: .text)
        try container.encodeIfPresent(mimeType, forKey: .mimeType)
        try container.encodeIfPresent(base64, forKey: .base64)
    }
}

private extension UserMessageAttachmentPayload {
    var jsonObject: [String: Any] {
        switch kind {
        case .textSelection:
            return ["kind": kind.rawValue, "id": id, "text": text ?? ""]
        case .image:
            return [
                "kind": kind.rawValue,
                "id": id,
                "mimeType": mimeType ?? "image/png",
                "base64": base64 ?? "",
            ]
        }
    }
}

private struct UserMessagePayload: Encodable {
    let text: String
    let attachments: [UserMessageAttachmentPayload]?
}

private struct IncomingEnvelope: Decodable {
    let type: String
    let sessionId: String
    let messageId: String
    let timestamp: String
    let payload: IncomingPayload
}

private struct IncomingPayload: Decodable {
    let text: String?
    let status: String?
    let name: String?
    let value: String?
    let message: String?
    let reason: String?
    let messages: [IncomingSnapshotMessage]?
    let requestId: String?
    let toolName: String?
    let toolCallId: String?
    let prompt: String?
    let candidates: [WorkspaceAskCandidate]?
    let sessions: [IncomingSessionListItem]?
    let targetSessionId: String?
    let title: String?
}

private struct IncomingSnapshotMessage: Decodable {
    let id: String
    let role: String
    let text: String
}

private struct IncomingSessionListItem: Decodable {
    let id: String
    let title: String?
    let updatedAt: String?
    let messageCount: Int?
}

import Foundation

enum SessionEvent: Equatable {
    case userMessage(messageID: String, text: String, timestamp: String)
    case assistantMessageStart(messageID: String, timestamp: String)
    case assistantMessageDelta(messageID: String, text: String, timestamp: String)
    case assistantMessageEnd(messageID: String, status: String, timestamp: String)
    case toolMessage(messageID: String, name: String, text: String, status: String, timestamp: String)
    case status(value: String)
    case error(messageID: String, message: String, timestamp: String)
    case sessionSnapshot(messages: [SessionBubble], status: String)
}

final class SessionSocketClient {
    var onEvent: ((SessionEvent) -> Void)?

    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()
    private let serverURL: URL?
    private let session: URLSession

    private var currentSessionID: String?
    private var socketTask: URLSessionWebSocketTask?

    init(serverURL: URL?, session: URLSession = .shared) {
        self.serverURL = serverURL
        self.session = session
    }

    static var noop: SessionSocketClient {
        SessionSocketClient(serverURL: nil)
    }

    func connect(sessionID: String) {
        currentSessionID = sessionID

        guard let serverURL, socketTask == nil else { return }

        let socketTask = session.webSocketTask(with: serverURL)
        self.socketTask = socketTask
        socketTask.resume()
        receiveNextMessage()
        sendOpenSession(sessionID: sessionID)
    }

    func disconnect() {
        socketTask?.cancel(with: .goingAway, reason: nil)
        socketTask = nil
    }

    func sendUserMessage(sessionID: String, messageID: String, text: String, timestamp: String) {
        guard let socketTask else { return }

        let envelope = UserMessageEnvelope(
            sessionId: sessionID,
            messageId: messageID,
            timestamp: timestamp,
            payload: UserMessagePayload(text: text, selection: nil)
        )
        send(envelope, on: socketTask)
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

    private func send<T: Encodable>(_ envelope: T, on socketTask: URLSessionWebSocketTask) {
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
                self.onEvent?(
                    .error(
                        messageID: UUID().uuidString,
                        message: error.localizedDescription,
                        timestamp: Self.timestamp()
                    )
                )
                self.socketTask = nil
            }
        }
    }

    private func decodeEvent(from text: String) -> SessionEvent? {
        guard let data = text.data(using: .utf8),
              let envelope = try? decoder.decode(IncomingEnvelope.self, from: data) else {
            return nil
        }

        if let currentSessionID,
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
        default:
            return nil
        }
    }

    private static func timestamp() -> String {
        ISO8601DateFormatter().string(from: Date())
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

private struct UserMessagePayload: Encodable {
    let text: String
    let selection: String?
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
    let messages: [IncomingSnapshotMessage]?
}

private struct IncomingSnapshotMessage: Decodable {
    let id: String
    let role: String
    let text: String
}

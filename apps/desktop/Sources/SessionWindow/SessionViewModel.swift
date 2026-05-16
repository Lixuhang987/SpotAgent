import Foundation

struct SessionBubble: Identifiable, Equatable {
    let id: String
    let role: String
    var text: String
}

struct SessionPermissionRequest: Identifiable, Equatable {
    let id: String
    let toolName: String
}

@Observable
@MainActor
final class SessionViewModel {
    private(set) var messages: [SessionBubble] = []
    private(set) var status: String = "idle"
    private(set) var error: String?
    private(set) var pendingPermissionRequests: [SessionPermissionRequest] = []

    let sessionID: String
    @ObservationIgnored let socketClient: SessionSocketClient

    init(sessionID: String, socketClient: SessionSocketClient) {
        self.sessionID = sessionID
        self.socketClient = socketClient
    }

    func resolvePermission(requestId: String, decision: String, scope: String?) {
        socketClient.sendPermissionResponse(
            sessionID: sessionID,
            requestId: requestId,
            decision: decision,
            scope: scope
        )
        pendingPermissionRequests.removeAll { $0.id == requestId }
    }

    func start(
        initialPrompt: String,
        attachments: [UserMessageAttachmentPayload] = [],
        startupError: String? = nil
    ) {
        if let startupError,
           !startupError.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            handle(
                .error(
                    messageID: UUID().uuidString,
                    message: startupError,
                    timestamp: Self.timestamp()
                )
            )
            return
        }

        socketClient.onEvent = { [weak self] event in
            Task { @MainActor in
                self?.handle(event)
            }
        }

        socketClient.connect(sessionID: sessionID)
        sendPrompt(initialPrompt, attachments: attachments)
    }

    func stop() {
        socketClient.disconnect()
    }

    func sendPrompt(_ text: String, attachments: [UserMessageAttachmentPayload] = []) {
        let trimmedText = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedText.isEmpty else { return }

        let messageID = UUID().uuidString
        let timestamp = Self.timestamp()
        handle(.userMessage(messageID: messageID, text: trimmedText, timestamp: timestamp))
        socketClient.sendUserMessage(
            sessionID: sessionID,
            messageID: messageID,
            text: trimmedText,
            timestamp: timestamp,
            attachments: attachments
        )
    }

    func handle(_ event: SessionEvent) {
        switch event {
        case .userMessage(let messageID, let text, _):
            status = "running"
            error = nil
            messages.append(SessionBubble(id: messageID, role: "user", text: text))
        case .assistantMessageStart(let messageID, _):
            status = "running"
            error = nil
            messages.append(SessionBubble(id: messageID, role: "assistant", text: ""))
        case .assistantMessageDelta(let messageID, let text, _):
            guard let index = messages.firstIndex(where: { $0.id == messageID }) else { return }
            messages[index].text += text
        case .assistantMessageEnd(_, let status, _):
            self.status = status == "completed" ? "idle" : status
        case .toolMessage(let messageID, let name, let text, _, _):
            messages.append(SessionBubble(id: messageID, role: "tool", text: "\(name): \(text)"))
        case .status(let value):
            status = value
            if value != "failed" { error = nil }
        case .error(let messageID, let message, _):
            status = "failed"
            error = message
            if messages.last?.role == "assistant", messages.last?.text == message { return }
            messages.append(SessionBubble(id: messageID, role: "assistant", text: message))
        case .sessionSnapshot(let messages, let status):
            self.messages = messages
            self.status = status
            error = nil
        case .permissionRequest(let requestId, let toolName, _):
            pendingPermissionRequests.append(
                SessionPermissionRequest(id: requestId, toolName: toolName)
            )
        }
    }

    private static func timestamp() -> String {
        ISO8601DateFormatter().string(from: Date())
    }
}

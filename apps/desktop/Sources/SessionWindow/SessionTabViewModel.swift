import Foundation

@Observable
@MainActor
final class SessionTabViewModel: Identifiable {
    let id: String
    let tabID: String
    let sessionID: String

    private(set) var messages: [SessionBubble] = []
    private(set) var status: SessionRunStatus = .idle
    private(set) var error: String?
    private(set) var pendingPermissionRequests: [SessionPermissionRequest] = []
    private(set) var pendingWorkspaceAskRequests: [SessionWorkspaceAskRequest] = []
    private(set) var connectionState: SessionConnectionState = .disconnected
    private(set) var connectionMessage: String?
    private(set) var isInvalid = false
    private(set) var invalidReason: String?

    var canSendPrompt: Bool { connectionState == .connected && !isInvalid }
    var visibleWorkspaceAskRequest: SessionWorkspaceAskRequest? {
        pendingWorkspaceAskRequests.first
    }

    @ObservationIgnored let socketClient: SessionSocketClient
    @ObservationIgnored private let copyMessageText: @MainActor (String) -> Void
    @ObservationIgnored private let onStateChanged: @MainActor (SessionTabViewModel) -> Void
    @ObservationIgnored private var pendingLocalTurnStartIndex: Int?

    init(
        tabID: String,
        sessionID: String,
        socketClient: SessionSocketClient,
        copyMessageText: @escaping @MainActor (String) -> Void = { text in
            SessionMessageClipboard.copy(text)
        },
        onStateChanged: @escaping @MainActor (SessionTabViewModel) -> Void = { _ in }
    ) {
        self.id = tabID
        self.tabID = tabID
        self.sessionID = sessionID
        self.socketClient = socketClient
        self.copyMessageText = copyMessageText
        self.onStateChanged = onStateChanged
    }

    func open() {
        socketClient.onEvent = { [weak self] event in
            Task { @MainActor in self?.handle(event) }
        }
        socketClient.connect(sessionID: sessionID)
    }

    func disconnect() {
        socketClient.disconnect()
    }

    func sendPrompt(_ text: String, attachments: [UserMessageAttachmentPayload] = []) {
        let trimmedText = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedText.isEmpty, !isInvalid else { return }

        let messageID = UUID().uuidString
        let timestamp = Self.timestamp()
        appendUserMessage(messageID: messageID, text: trimmedText, attachments: attachments)
        pendingLocalTurnStartIndex = messages.count - 1
        onStateChanged(self)
        socketClient.sendUserMessage(
            sessionID: sessionID,
            messageID: messageID,
            text: trimmedText,
            timestamp: timestamp,
            attachments: attachments
        )
    }

    func stop() {
        guard status.isRunning else { return }
        status = .interrupted
        socketClient.sendInterrupt(sessionID: sessionID)
        onStateChanged(self)
    }

    func copyMessage(messageID: String) {
        guard let message = messages.first(where: { $0.id == messageID }), !message.text.isEmpty else {
            return
        }
        copyMessageText(message.text)
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

    func resolveWorkspaceAsk(requestId: String, workspaceId: String?) {
        socketClient.sendWorkspaceAskResponse(
            sessionID: sessionID,
            requestId: requestId,
            workspaceId: workspaceId,
            cancelled: workspaceId == nil
        )
        pendingWorkspaceAskRequests.removeAll { $0.id == requestId }
    }

    func handle(_ event: SessionEvent) {
        var shouldNotifyStateChanged = false

        switch event {
        case .userMessage(let messageID, let text, _):
            appendUserMessage(messageID: messageID, text: text, attachments: [])
            shouldNotifyStateChanged = true
        case .assistantMessageStart(let messageID, _):
            status = .running
            error = nil
            messages.append(SessionBubble(id: messageID, role: "assistant", text: ""))
            shouldNotifyStateChanged = true
        case .assistantMessageDelta(let messageID, let text, _):
            guard let index = messages.firstIndex(where: { $0.id == messageID }) else { return }
            messages[index].text += text
            shouldNotifyStateChanged = true
        case .assistantMessageEnd(_, let status, _):
            self.status = .fromProtocolStatus(status)
            shouldNotifyStateChanged = true
        case .toolMessage(let messageID, let name, let text, let status, _):
            let displayText = "\(name): \(text)"
            if let index = messages.firstIndex(where: { $0.id == messageID && $0.role == "tool" }) {
                messages[index].text = displayText
            } else {
                messages.append(SessionBubble(id: messageID, role: "tool", text: displayText))
            }
            clearPendingPermissionIfTerminalToolMessage(
                messageID: messageID,
                toolName: name,
                status: status
            )
            shouldNotifyStateChanged = true
        case .status(let value):
            status = .fromProtocolStatus(value)
            if status.clearsError { error = nil }
            shouldNotifyStateChanged = true
        case .error(let messageID, let message, _):
            status = .failed
            error = message
            if messages.last?.role != "assistant" || messages.last?.text != message {
                messages.append(SessionBubble(id: messageID, role: "assistant", text: message))
            }
            shouldNotifyStateChanged = true
        case .sessionSnapshot(let messages, let status):
            applySessionSnapshot(messages: messages, status: status)
            shouldNotifyStateChanged = true
        case .sessionOpenFailed(_, let message), .userMessageFailed(_, let message, _):
            pendingLocalTurnStartIndex = nil
            isInvalid = true
            invalidReason = message
            status = .failed
            error = message
            shouldNotifyStateChanged = true
        case .permissionRequest(let requestId, let toolName, let toolCallId, let argumentsJSON):
            pendingPermissionRequests.append(
                SessionPermissionRequest(
                    id: requestId,
                    toolName: toolName,
                    toolCallId: toolCallId,
                    argumentsJSON: argumentsJSON
                )
            )
            status = .running
            shouldNotifyStateChanged = true
        case .workspaceAskRequest(let requestId, let prompt, let candidates):
            pendingWorkspaceAskRequests.append(
                SessionWorkspaceAskRequest(id: requestId, prompt: prompt, candidates: candidates)
            )
            status = .running
            shouldNotifyStateChanged = true
        case .connectionState(let state):
            connectionState = state
            switch state {
            case .connected:
                connectionMessage = nil
            case .connecting:
                connectionMessage = "正在连接 agent-server…"
            case .reconnecting:
                connectionMessage = "连接已断开，正在自动重连…"
            case .disconnected:
                connectionMessage = "连接已断开。"
            }
        case .createSessionResponse, .deleteSessionResponse, .sessionList, .sessionLoaded:
            break
        }

        if shouldNotifyStateChanged {
            onStateChanged(self)
        }
    }

    private func appendUserMessage(
        messageID: String,
        text: String,
        attachments: [UserMessageAttachmentPayload]
    ) {
        status = .running
        error = nil
        messages.append(SessionBubble.user(id: messageID, text: text, attachments: attachments))
    }

    private static func timestamp() -> String {
        ISO8601DateFormatter().string(from: Date())
    }

    private func clearPendingPermissionIfTerminalToolMessage(
        messageID: String,
        toolName: String,
        status: String
    ) {
        guard status == "completed" || status == "failed",
              let toolCallId = toolCallId(fromToolMessageID: messageID) else {
            return
        }
        pendingPermissionRequests.removeAll {
            $0.toolName == toolName && $0.toolCallId == toolCallId
        }
    }

    private func toolCallId(fromToolMessageID messageID: String) -> String? {
        let prefix = "\(sessionID)-"
        guard messageID.hasPrefix(prefix) else { return nil }
        return String(messageID.dropFirst(prefix.count))
    }

    private func applySessionSnapshot(messages: [SessionBubble], status: String) {
        let snapshotMessages = messages.map { $0.normalizedForDisplay() }
        guard let pendingLocalTurnStartIndex else {
            self.messages = snapshotMessages
            applySnapshotStatus(status, messages: snapshotMessages)
            return
        }

        let previousStatus = self.status
        let previousError = error
        self.messages = Self.mergeSnapshot(snapshotMessages, preservingLocalSuffixFrom: self.messages)
        let snapshotCompletesPendingTurn = Self.snapshotCompletesPendingTurn(
            snapshotMessages,
            pendingTurnStartIndex: pendingLocalTurnStartIndex
        )

        if !snapshotCompletesPendingTurn {
            self.status = previousStatus
            error = previousError
            return
        }

        self.pendingLocalTurnStartIndex = nil
        applySnapshotStatus(status, messages: self.messages)
    }

    private func applySnapshotStatus(_ status: String, messages: [SessionBubble]) {
        self.status = .fromProtocolStatus(status)
        if self.status == .failed {
            error = messages.last(where: { $0.role == "assistant" && !$0.text.isEmpty })?.text
        } else {
            error = nil
        }
    }

    private static func mergeSnapshot(
        _ snapshotMessages: [SessionBubble],
        preservingLocalSuffixFrom localMessages: [SessionBubble]
    ) -> [SessionBubble] {
        guard localMessages.count > snapshotMessages.count else {
            return snapshotMessages
        }

        let localSuffix = localMessages.dropFirst(snapshotMessages.count)
        return snapshotMessages + localSuffix
    }

    private static func snapshotCompletesPendingTurn(
        _ snapshotMessages: [SessionBubble],
        pendingTurnStartIndex: Int
    ) -> Bool {
        guard snapshotMessages.indices.contains(pendingTurnStartIndex),
              snapshotMessages[pendingTurnStartIndex].role == "user" else {
            return false
        }

        let afterUserIndex = snapshotMessages.index(after: pendingTurnStartIndex)
        guard afterUserIndex < snapshotMessages.endIndex else {
            return false
        }
        return snapshotMessages[afterUserIndex...].contains { $0.role != "user" }
    }
}

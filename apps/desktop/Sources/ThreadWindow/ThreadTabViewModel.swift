import Foundation

@Observable
@MainActor
final class ThreadTabViewModel: Identifiable {
    let id: String
    let tabID: String
    let threadID: String

    private(set) var messages: [ThreadBubble] = []
    private(set) var status: ThreadRunStatus = .idle
    private(set) var error: String?
    private(set) var pendingPermissionRequests: [ThreadPermissionRequest] = []
    private(set) var pendingWorkspaceAskRequests: [ThreadWorkspaceAskRequest] = []
    private(set) var connectionState: ThreadConnectionState = .disconnected
    private(set) var connectionMessage: String?
    private(set) var isInvalid = false
    private(set) var invalidReason: String?

    var canSendPrompt: Bool { connectionState == .connected && !isInvalid }
    var visibleWorkspaceAskRequest: ThreadWorkspaceAskRequest? {
        pendingWorkspaceAskRequests.first
    }

    @ObservationIgnored private let sendCommand: (ThreadProtocolClient.Command) -> Void
    @ObservationIgnored private let sendResponse: (ThreadProtocolClient.Response) -> Void
    @ObservationIgnored private let subscribeToEvents: (
        String,
        @escaping (ThreadEvent) -> Void
    ) -> ThreadEventBus<ThreadEvent>.Subscription
    @ObservationIgnored private let copyMessageText: @MainActor (String) -> Void
    @ObservationIgnored private let onStateChanged: @MainActor (ThreadTabViewModel) -> Void
    @ObservationIgnored private var pendingLocalTurnStartIndex: Int?
    @ObservationIgnored private var eventSubscription: ThreadEventBus<ThreadEvent>.Subscription?

    init(
        tabID: String,
        threadID: String,
        subscribeToEvents: @escaping (String, @escaping (ThreadEvent) -> Void) -> ThreadEventBus<ThreadEvent>.Subscription,
        sendCommand: @escaping (ThreadProtocolClient.Command) -> Void,
        sendResponse: @escaping (ThreadProtocolClient.Response) -> Void,
        copyMessageText: @escaping @MainActor (String) -> Void = { text in
            ThreadMessageClipboard.copy(text)
        },
        onStateChanged: @escaping @MainActor (ThreadTabViewModel) -> Void = { _ in }
    ) {
        self.id = tabID
        self.tabID = tabID
        self.threadID = threadID
        self.sendCommand = sendCommand
        self.sendResponse = sendResponse
        self.subscribeToEvents = subscribeToEvents
        self.copyMessageText = copyMessageText
        self.onStateChanged = onStateChanged
    }

    func open() {
        eventSubscription = subscribeToEvents(threadID) { [weak self] event in
            self?.handle(event)
        }
        sendCommand(.threadResume(
            threadId: threadID,
            commandId: UUID().uuidString,
            timestamp: Self.timestamp()
        ))
    }

    func disconnect() {
        eventSubscription?.cancel()
        eventSubscription = nil
    }

    func resubscribe() {
        sendCommand(.threadResume(
            threadId: threadID,
            commandId: UUID().uuidString,
            timestamp: Self.timestamp()
        ))
    }

    func setConnectionState(_ state: ThreadConnectionState) {
        handle(.connectionState(state))
    }

    func sendPrompt(_ text: String, attachments: [UserMessageAttachmentPayload] = []) {
        let trimmedText = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedText.isEmpty, !isInvalid else { return }

        let messageID = UUID().uuidString
        let timestamp = Self.timestamp()
        appendUserMessage(messageID: messageID, text: trimmedText, attachments: attachments)
        pendingLocalTurnStartIndex = messages.count - 1
        onStateChanged(self)
        sendCommand(.turnStart(
            threadId: threadID,
            commandId: messageID,
            timestamp: timestamp,
            text: trimmedText,
            attachments: attachments
        ))
    }

    func stop() {
        guard status.isRunning else { return }
        status = .interrupted
        sendCommand(.turnInterrupt(
            threadId: threadID,
            commandId: UUID().uuidString,
            timestamp: Self.timestamp()
        ))
        onStateChanged(self)
    }

    func copyMessage(messageID: String) {
        guard let message = messages.first(where: { $0.id == messageID }), !message.text.isEmpty else {
            return
        }
        copyMessageText(message.text)
    }

    func resolvePermission(requestId: String, decision: String, scope: String?) {
        sendResponse(.permissionAnswered(
            requestId: requestId,
            timestamp: Self.timestamp(),
            decision: decision == "deny" ? .deny : .allow,
            scope: permissionScope(from: scope),
            reason: nil
        ))
        pendingPermissionRequests.removeAll { $0.id == requestId }
    }

    func resolveWorkspaceAsk(requestId: String, workspaceId: String?) {
        sendResponse(.workspaceAnswered(
            requestId: requestId,
            timestamp: Self.timestamp(),
            workspaceId: workspaceId,
            cancelled: workspaceId == nil
        ))
        pendingWorkspaceAskRequests.removeAll { $0.id == requestId }
    }

    func handle(_ event: ThreadEvent) {
        var shouldNotifyStateChanged = false

        switch event {
        case .userMessage(let messageID, let text, _):
            appendUserMessage(messageID: messageID, text: text, attachments: [])
            shouldNotifyStateChanged = true
        case .assistantMessageStart(let messageID, _):
            status = .running
            error = nil
            messages.append(ThreadBubble(id: messageID, role: "assistant", text: ""))
            shouldNotifyStateChanged = true
        case .assistantMessageDelta(let messageID, let text, _):
            if let index = messages.firstIndex(where: { $0.id == messageID }) {
                messages[index].text += text
            } else {
                status = .running
                error = nil
                messages.append(ThreadBubble(id: messageID, role: "assistant", text: text))
            }
            shouldNotifyStateChanged = true
        case .assistantMessageEnd(_, let status, _):
            self.status = .fromProtocolStatus(status)
            shouldNotifyStateChanged = true
        case .toolMessage(let messageID, let name, let text, let status, _):
            let displayText = "\(name): \(text)"
            if let index = messages.firstIndex(where: { $0.id == messageID && $0.role == "tool" }) {
                messages[index].text = displayText
            } else {
                messages.append(ThreadBubble(id: messageID, role: "tool", text: displayText))
            }
            if status == "running" {
                self.status = .running
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
                messages.append(ThreadBubble(id: messageID, role: "assistant", text: message))
            }
            shouldNotifyStateChanged = true
        case .threadSnapshot(let messages, let status):
            applyThreadSnapshot(messages: messages, status: status)
            shouldNotifyStateChanged = true
        case .threadOpenFailed(_, let message), .threadStartFailed(_, let message, _):
            pendingLocalTurnStartIndex = nil
            isInvalid = true
            invalidReason = message
            status = .failed
            error = message
            shouldNotifyStateChanged = true
        case .permissionRequest(let requestId, let toolName, let toolCallId, let argumentsJSON):
            pendingPermissionRequests.append(
                ThreadPermissionRequest(
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
                ThreadWorkspaceAskRequest(id: requestId, prompt: prompt, candidates: candidates)
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
        case .threadStarted, .threadDeleted, .threadList, .threadLoaded:
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
        messages.append(ThreadBubble.user(id: messageID, text: text, attachments: attachments))
    }

    private static func timestamp() -> String {
        ISO8601DateFormatter().string(from: Date())
    }

    private func permissionScope(from rawValue: String?) -> ThreadProtocolClient.PermissionScope? {
        guard let rawValue else { return nil }
        return ThreadProtocolClient.PermissionScope(rawValue: rawValue)
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
        let prefix = "\(threadID)-"
        guard messageID.hasPrefix(prefix) else { return nil }
        return String(messageID.dropFirst(prefix.count))
    }

    private func applyThreadSnapshot(messages: [ThreadBubble], status: String) {
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

    private func applySnapshotStatus(_ status: String, messages: [ThreadBubble]) {
        self.status = .fromProtocolStatus(status)
        if self.status == .failed {
            error = messages.last(where: { $0.role == "assistant" && !$0.text.isEmpty })?.text
        } else {
            error = nil
        }
    }

    private static func mergeSnapshot(
        _ snapshotMessages: [ThreadBubble],
        preservingLocalSuffixFrom localMessages: [ThreadBubble]
    ) -> [ThreadBubble] {
        guard localMessages.count > snapshotMessages.count else {
            return snapshotMessages
        }

        let localSuffix = localMessages.dropFirst(snapshotMessages.count)
        return snapshotMessages + localSuffix
    }

    private static func snapshotCompletesPendingTurn(
        _ snapshotMessages: [ThreadBubble],
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

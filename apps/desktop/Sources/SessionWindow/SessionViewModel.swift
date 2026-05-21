import Foundation

struct SessionAttachmentSummary: Identifiable, Equatable {
    let id: String
    let kind: String
    let title: String
    let detail: String?
}

struct SessionBubble: Identifiable, Equatable {
    let id: String
    let role: String
    var text: String
    var attachments: [SessionAttachmentSummary] = []

    var attachmentSummaryText: String? {
        guard !attachments.isEmpty else { return nil }
        let types = attachments.map(\.kind).joined(separator: " / ")
        return "附件 ×\(attachments.count) · \(types)"
    }

    static func user(
        id: String,
        text: String,
        attachments: [UserMessageAttachmentPayload]
    ) -> SessionBubble {
        SessionBubble(
            id: id,
            role: "user",
            text: text,
            attachments: attachments.enumerated().map { index, attachment in
                SessionAttachmentSummary(attachment: attachment, index: index)
            }
        )
    }

    func normalizedForDisplay() -> SessionBubble {
        guard role == "user", attachments.isEmpty else { return self }
        let normalized = Self.normalizePersistedUserContent(text)
        guard !normalized.attachments.isEmpty else { return self }
        return SessionBubble(
            id: id,
            role: role,
            text: normalized.text,
            attachments: normalized.attachments
        )
    }

    private static func normalizePersistedUserContent(_ text: String) -> (
        text: String,
        attachments: [SessionAttachmentSummary]
    ) {
        guard let firstMarker = nextPersistedAttachmentMarker(in: text, from: text.startIndex) else {
            return (text, [])
        }

        let visibleText = String(text[..<firstMarker.range.lowerBound])
            .trimmingCharacters(in: .whitespacesAndNewlines)
        var attachments: [SessionAttachmentSummary] = []
        var cursor = firstMarker

        while true {
            switch cursor.kind {
            case .textSelection:
                let contentStart = cursor.range.upperBound
                let next = nextPersistedAttachmentMarker(in: text, from: contentStart)
                let contentEnd = next?.range.lowerBound ?? text.endIndex
                let selectionText = String(text[contentStart..<contentEnd])
                attachments.append(
                    SessionAttachmentSummary(
                        id: "persisted-text-selection-\(attachments.count)",
                        kind: "text_selection",
                        title: "文本选区",
                        detail: Self.preview(selectionText)
                    )
                )
                guard let next else { return (visibleText, attachments) }
                cursor = next
            case .imageStub:
                let stubStart = text.index(cursor.range.lowerBound, offsetBy: 2)
                guard let closeRange = text.range(of: "[/STUB]", range: cursor.range.upperBound..<text.endIndex) else {
                    return (visibleText, attachments)
                }
                let stubRange = stubStart..<closeRange.upperBound
                let stubText = String(text[stubRange])
                if stubText.contains("kind=image") {
                    attachments.append(
                        SessionAttachmentSummary(
                            id: Self.stubAttribute("id", in: stubText) ?? "persisted-image-\(attachments.count)",
                            kind: "image",
                            title: "图片",
                            detail: Self.imageStubDetail(from: stubText)
                        )
                    )
                }
                guard let next = nextPersistedAttachmentMarker(in: text, from: closeRange.upperBound) else {
                    return (visibleText, attachments)
                }
                cursor = next
            }
        }
    }

    private enum PersistedAttachmentMarkerKind {
        case textSelection
        case imageStub
    }

    private struct PersistedAttachmentMarker {
        let kind: PersistedAttachmentMarkerKind
        let range: Range<String.Index>
    }

    private static func nextPersistedAttachmentMarker(
        in text: String,
        from index: String.Index
    ) -> PersistedAttachmentMarker? {
        let searchRange = index..<text.endIndex
        let selectionRange = text.range(of: "\n\n[选区]\n", range: searchRange)
        let imageRange = text.range(of: "\n\n[STUB ", range: searchRange)

        switch (selectionRange, imageRange) {
        case (nil, nil):
            return nil
        case (let selection?, nil):
            return PersistedAttachmentMarker(kind: .textSelection, range: selection)
        case (nil, let image?):
            return PersistedAttachmentMarker(kind: .imageStub, range: image)
        case (let selection?, let image?):
            if selection.lowerBound < image.lowerBound {
                return PersistedAttachmentMarker(kind: .textSelection, range: selection)
            }
            return PersistedAttachmentMarker(kind: .imageStub, range: image)
        }
    }

    fileprivate static func preview(_ text: String) -> String? {
        let lines = text.split(whereSeparator: \.isNewline)
        let preview = lines.first.map(String.init) ?? text
        let trimmed = preview.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        if trimmed.count > 48 {
            return String(trimmed.prefix(48)) + "…"
        }
        return trimmed
    }

    private static func stubAttribute(_ name: String, in stubText: String) -> String? {
        guard let nameRange = stubText.range(of: "\(name)=") else { return nil }
        var valueStart = nameRange.upperBound
        if valueStart < stubText.endIndex, stubText[valueStart] == "\"" {
            valueStart = stubText.index(after: valueStart)
            guard let valueEnd = stubText[valueStart...].firstIndex(of: "\"") else { return nil }
            return String(stubText[valueStart..<valueEnd])
        }

        let valueEnd = stubText[valueStart...].firstIndex { character in
            character == " " || character == "]" || character.isNewline
        } ?? stubText.endIndex
        return String(stubText[valueStart..<valueEnd])
    }

    private static func imageStubDetail(from stubText: String) -> String? {
        guard let size = stubAttribute("size", in: stubText), !size.isEmpty else {
            return "STUB"
        }
        return "size \(size) bytes"
    }
}

private extension SessionAttachmentSummary {
    init(attachment: UserMessageAttachmentPayload, index: Int) {
        let id = attachment.id.isEmpty ? "\(attachment.kind.rawValue)-\(index)" : attachment.id
        switch attachment.kind {
        case .textSelection:
            self.init(
                id: id,
                kind: attachment.kind.rawValue,
                title: "文本选区",
                detail: SessionBubble.preview(attachment.text ?? "")
            )
        case .image:
            self.init(
                id: id,
                kind: attachment.kind.rawValue,
                title: "图片",
                detail: attachment.mimeType ?? "image"
            )
        }
    }
}

struct SessionPermissionRequest: Identifiable, Equatable {
    let id: String
    let toolName: String
    let toolCallId: String?
    let argumentsJSON: String
}

struct SessionWorkspaceAskRequest: Identifiable, Equatable {
    let id: String
    let prompt: String
    let candidates: [WorkspaceAskCandidate]
}

@Observable
@MainActor
final class SessionViewModel {
    private(set) var messages: [SessionBubble] = []
    private(set) var status: SessionRunStatus = .idle
    private(set) var error: String?
    private(set) var pendingPermissionRequests: [SessionPermissionRequest] = []
    private(set) var pendingWorkspaceAskRequests: [SessionWorkspaceAskRequest] = []
    private(set) var historyList: [SessionListItem] = []
    private(set) var pendingHistoryDeletionID: String?
    private(set) var connectionState: SessionConnectionState = .disconnected
    private(set) var connectionMessage: String?
    var canSendPrompt: Bool { connectionState == .connected }
    var visibleWorkspaceAskRequest: SessionWorkspaceAskRequest? {
        pendingWorkspaceAskRequests.first
    }

    let sessionID: String
    @ObservationIgnored let socketClient: SessionSocketClient
    @ObservationIgnored private let onStateChanged: @MainActor (SessionViewModel) -> Void

    init(
        sessionID: String,
        socketClient: SessionSocketClient,
        onStateChanged: @escaping @MainActor (SessionViewModel) -> Void = { _ in }
    ) {
        self.sessionID = sessionID
        self.socketClient = socketClient
        self.onStateChanged = onStateChanged
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

    func refreshHistory() {
        socketClient.sendListSessions(sessionID: sessionID)
    }

    func restoreSession(_ targetSessionId: String) {
        socketClient.sendLoadSession(sessionID: sessionID, targetSessionId: targetSessionId)
    }

    func deleteSession(_ targetSessionId: String) {
        socketClient.sendDeleteSession(sessionID: sessionID, targetSessionId: targetSessionId)
        historyList.removeAll { $0.id == targetSessionId }
    }

    func requestDeleteSession(_ targetSessionId: String) {
        pendingHistoryDeletionID = targetSessionId
    }

    func cancelDeleteSession() {
        pendingHistoryDeletionID = nil
    }

    func confirmDeleteSession() {
        guard let targetSessionId = pendingHistoryDeletionID else { return }
        pendingHistoryDeletionID = nil
        deleteSession(targetSessionId)
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
        guard status.isRunning else { return }
        status = .interrupted
        socketClient.sendInterrupt(sessionID: sessionID)
    }

    func sendPrompt(_ text: String, attachments: [UserMessageAttachmentPayload] = []) {
        let trimmedText = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedText.isEmpty else { return }

        let messageID = UUID().uuidString
        let timestamp = Self.timestamp()
        appendUserMessage(messageID: messageID, text: trimmedText, attachments: attachments)
        onStateChanged(self)
        socketClient.sendUserMessage(
            sessionID: sessionID,
            messageID: messageID,
            text: trimmedText,
            timestamp: timestamp,
            attachments: attachments
        )
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
                messages.append(SessionBubble(id: messageID, role: "assistant", text: message))
            }
            shouldNotifyStateChanged = true
        case .sessionSnapshot(let messages, let status):
            self.messages = messages.map { $0.normalizedForDisplay() }
            self.status = .fromProtocolStatus(status)
            error = nil
            shouldNotifyStateChanged = true
        case .sessionOpenFailed(_, let message), .userMessageFailed(_, let message, _):
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
        case .sessionList(let sessions):
            historyList = sessions
        case .sessionLoaded(_, _, let bubbles):
            messages = bubbles.map { $0.normalizedForDisplay() }
            status = .idle
            error = nil
            shouldNotifyStateChanged = true
        case .createSessionResponse, .deleteSessionResponse:
            break
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
}

import ComposableArchitecture
import Foundation

@Reducer
struct ThreadFeature {
    @ObservableState
    struct State: Equatable, Identifiable {
        var id: String { thread.id }
        var thread: ThreadState
        var events: EventStore

        init(threadID: String) {
            self.thread = ThreadState(threadID: threadID)
            self.events = EventStore()
        }
    }

    enum Action: Equatable {
        case localUserMessage(messageID: String, text: String, attachments: [UserMessageAttachmentPayload])
        case event(ThreadEvent)
        case interruptRequested
        case permissionResolved(requestID: String)
        case workspaceResolved(requestID: String)
    }

    var body: some ReducerOf<Self> {
        Reduce { state, action in
            Self.apply(action, to: &state)
            return .none
        }
    }

    static func apply(_ action: Action, to state: inout State) {
        switch action {
        case .localUserMessage(let messageID, let text, let attachments):
            appendUserMessage(&state, messageID: messageID, text: text, attachments: attachments)
            state.events.pendingLocalTurnStartIndex = state.events.messages.count - 1

        case .interruptRequested:
            guard state.thread.status.isRunning else { return }
            state.thread.status = .interrupted

        case .permissionResolved(let requestID):
            state.events.pendingPermissionRequests.removeAll { $0.id == requestID }

        case .workspaceResolved(let requestID):
            state.events.pendingWorkspaceAskRequests.removeAll { $0.id == requestID }

        case .event(let event):
            applyEvent(event, to: &state)
        }
    }

    private static func applyEvent(_ event: ThreadEvent, to state: inout State) {
        switch event {
        case .userMessage(let messageID, let text, _):
            appendUserMessage(&state, messageID: messageID, text: text, attachments: [])

        case .assistantMessageStart(let messageID, _):
            state.thread.status = .running
            state.events.errorMessage = nil
            state.events.assistantStreamingMessageID = messageID
            state.events.messages.append(ThreadBubble(id: messageID, role: "assistant", text: ""))

        case .assistantMessageDelta(let messageID, let text, _):
            state.thread.status = .running
            state.events.errorMessage = nil
            if let index = state.events.messages.firstIndex(where: { $0.id == messageID }) {
                state.events.messages[index].text += text
            } else {
                state.events.messages.append(ThreadBubble(id: messageID, role: "assistant", text: text))
            }

        case .assistantMessageEnd(_, let status, _):
            state.thread.status = .fromProtocolStatus(status)
            state.events.assistantStreamingMessageID = nil

        case .toolMessage(let messageID, let name, let text, let status, _):
            let displayText = "\(name): \(text)"
            if let index = state.events.messages.firstIndex(where: { $0.id == messageID && $0.role == "tool" }) {
                state.events.messages[index].text = displayText
            } else {
                state.events.messages.append(ThreadBubble(id: messageID, role: "tool", text: displayText))
            }
            if status == "running" {
                state.thread.status = .running
            }
            clearPendingPermissionIfTerminalToolMessage(
                &state,
                messageID: messageID,
                toolName: name,
                status: status
            )

        case .status(let value):
            state.thread.status = .fromProtocolStatus(value)
            if state.thread.status.clearsError {
                state.events.errorMessage = nil
            }

        case .error(let messageID, let message, _):
            state.thread.status = .failed
            state.events.errorMessage = message
            if state.events.messages.last?.role != "assistant" || state.events.messages.last?.text != message {
                state.events.messages.append(ThreadBubble(id: messageID, role: "assistant", text: message))
            }

        case .threadSnapshot(let messages, let status):
            applyThreadSnapshot(&state, messages: messages, status: status)

        case .threadOpenFailed(_, let message), .threadStartFailed(_, let message, _):
            state.events.pendingLocalTurnStartIndex = nil
            state.thread.isInvalid = true
            state.thread.invalidReason = message
            state.thread.status = .failed
            state.events.errorMessage = message

        case .permissionRequest(let requestId, let toolName, let toolCallId, let argumentsJSON):
            state.events.pendingPermissionRequests.append(
                ThreadPermissionRequest(
                    id: requestId,
                    toolName: toolName,
                    toolCallId: toolCallId,
                    argumentsJSON: argumentsJSON
                )
            )
            state.thread.status = .running

        case .workspaceAskRequest(let requestId, let prompt, let candidates):
            state.events.pendingWorkspaceAskRequests.append(
                ThreadWorkspaceAskRequest(id: requestId, prompt: prompt, candidates: candidates)
            )
            state.thread.status = .running

        case .turnStarted(let turnID):
            state.thread.status = .running
            state.events.errorMessage = nil
            state.events.activeTurnID = turnID

        case .turnCompleted(let turnID, let status):
            state.thread.status = .fromProtocolStatus(status)
            if state.events.activeTurnID == turnID {
                state.events.activeTurnID = nil
            }

        case .connectionState(let connectionState):
            state.events.connectionState = connectionState
            switch connectionState {
            case .connected:
                state.events.connectionMessage = nil
            case .connecting:
                state.events.connectionMessage = "正在连接 agent-server…"
            case .reconnecting:
                state.events.connectionMessage = "连接已断开，正在自动重连…"
            case .disconnected:
                state.events.connectionMessage = "连接已断开。"
            }

        case .threadStarted, .threadDeleted, .threadList, .threadLoaded:
            break
        }
    }

    private static func appendUserMessage(
        _ state: inout State,
        messageID: String,
        text: String,
        attachments: [UserMessageAttachmentPayload]
    ) {
        state.thread.status = .running
        state.events.errorMessage = nil
        state.events.messages.append(ThreadBubble.user(id: messageID, text: text, attachments: attachments))
    }

    private static func clearPendingPermissionIfTerminalToolMessage(
        _ state: inout State,
        messageID: String,
        toolName: String,
        status: String
    ) {
        guard status == "completed" || status == "failed",
              let toolCallId = toolCallId(fromToolMessageID: messageID, threadID: state.thread.id) else {
            return
        }
        state.events.pendingPermissionRequests.removeAll {
            $0.toolName == toolName && $0.toolCallId == toolCallId
        }
    }

    private static func toolCallId(fromToolMessageID messageID: String, threadID: String) -> String? {
        let prefix = "\(threadID)-"
        guard messageID.hasPrefix(prefix) else { return nil }
        return String(messageID.dropFirst(prefix.count))
    }

    private static func applyThreadSnapshot(
        _ state: inout State,
        messages: [ThreadBubble],
        status: String
    ) {
        let snapshotMessages = messages.map { $0.normalizedForDisplay() }
        guard let pendingLocalTurnStartIndex = state.events.pendingLocalTurnStartIndex else {
            state.events.messages = snapshotMessages
            applySnapshotStatus(&state, status: status, messages: snapshotMessages)
            return
        }

        let previousStatus = state.thread.status
        let previousError = state.events.errorMessage
        state.events.messages = mergeSnapshot(snapshotMessages, preservingLocalSuffixFrom: state.events.messages)
        let snapshotCompletesPendingTurn = snapshotCompletesPendingTurn(
            snapshotMessages,
            pendingTurnStartIndex: pendingLocalTurnStartIndex
        )

        if !snapshotCompletesPendingTurn {
            state.thread.status = previousStatus
            state.events.errorMessage = previousError
            return
        }

        state.events.pendingLocalTurnStartIndex = nil
        applySnapshotStatus(&state, status: status, messages: state.events.messages)
    }

    private static func applySnapshotStatus(_ state: inout State, status: String, messages: [ThreadBubble]) {
        state.thread.status = .fromProtocolStatus(status)
        if state.thread.status == .failed {
            state.events.errorMessage = messages.last(where: { $0.role == "assistant" && !$0.text.isEmpty })?.text
        } else {
            state.events.errorMessage = nil
        }
    }

    private static func mergeSnapshot(
        _ snapshotMessages: [ThreadBubble],
        preservingLocalSuffixFrom localMessages: [ThreadBubble]
    ) -> [ThreadBubble] {
        guard localMessages.count > snapshotMessages.count else {
            return snapshotMessages
        }
        return snapshotMessages + localMessages.dropFirst(snapshotMessages.count)
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

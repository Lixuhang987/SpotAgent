import ComposableArchitecture
import Foundation

@Observable
@MainActor
final class ThreadTabViewModel: Identifiable {
    let id: String
    let tabID: String
    let threadID: String

    var messages: [ThreadBubble] { state?.events.messages ?? [] }
    var status: ThreadRunStatus { state?.thread.status ?? .failed }
    var error: String? { state?.events.errorMessage }
    var pendingPermissionRequests: [ThreadPermissionRequest] {
        state?.events.pendingPermissionRequests ?? []
    }
    var pendingWorkspaceAskRequests: [ThreadWorkspaceAskRequest] {
        state?.events.pendingWorkspaceAskRequests ?? []
    }
    var connectionState: ThreadConnectionState { state?.events.connectionState ?? .disconnected }
    var connectionMessage: String? { state?.events.connectionMessage }
    var isInvalid: Bool { state?.thread.isInvalid ?? true }
    var invalidReason: String? { state?.thread.invalidReason }

    var canSendPrompt: Bool { connectionState == .connected && !isInvalid }
    var visibleWorkspaceAskRequest: ThreadWorkspaceAskRequest? {
        state?.events.visibleWorkspaceAskRequest
    }

    @ObservationIgnored private let readState: () -> ThreadFeature.State?
    @ObservationIgnored private let sendAction: (ThreadFeature.Action) -> Void
    @ObservationIgnored private let sendCommand: (ThreadWindowCommand) -> Void
    @ObservationIgnored private let sendResponse: (ThreadWindowResponse) -> Void
    @ObservationIgnored private let subscribeToEvents: (
        String,
        @escaping (ThreadEvent) -> Void
    ) -> ThreadEventBus<ThreadEvent>.Subscription
    @ObservationIgnored private let copyMessageText: @MainActor (String) -> Void
    @ObservationIgnored private let onStateChanged: @MainActor (ThreadTabViewModel) -> Void
    @ObservationIgnored private var eventSubscription: ThreadEventBus<ThreadEvent>.Subscription?

    init(
        tabID: String,
        threadID: String,
        readState: @escaping () -> ThreadFeature.State?,
        sendAction: @escaping (ThreadFeature.Action) -> Void,
        subscribeToEvents: @escaping (String, @escaping (ThreadEvent) -> Void) -> ThreadEventBus<ThreadEvent>.Subscription,
        sendCommand: @escaping (ThreadWindowCommand) -> Void,
        sendResponse: @escaping (ThreadWindowResponse) -> Void,
        copyMessageText: @escaping @MainActor (String) -> Void = { text in
            ThreadMessageClipboard.copy(text)
        },
        onStateChanged: @escaping @MainActor (ThreadTabViewModel) -> Void = { _ in }
    ) {
        self.id = tabID
        self.tabID = tabID
        self.threadID = threadID
        self.readState = readState
        self.sendAction = sendAction
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
        sendAction(.localUserMessage(
            messageID: messageID,
            text: trimmedText,
            attachments: attachments
        ))
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
        sendAction(.interruptRequested)
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
        sendAction(.permissionResolved(requestID: requestId))
    }

    func resolveWorkspaceAsk(requestId: String, workspaceId: String?) {
        sendResponse(.workspaceAnswered(
            requestId: requestId,
            timestamp: Self.timestamp(),
            workspaceId: workspaceId,
            cancelled: workspaceId == nil
        ))
        sendAction(.workspaceResolved(requestID: requestId))
    }

    func handle(_ event: ThreadEvent) {
        sendAction(.event(event))

        switch event {
        case .connectionState, .threadStarted, .threadDeleted, .threadList, .threadLoaded:
            break
        default:
            onStateChanged(self)
        }
    }

    private static func timestamp() -> String {
        ISO8601DateFormatter().string(from: Date())
    }

    private var state: ThreadFeature.State? {
        readState()
    }

    private func permissionScope(from rawValue: String?) -> ThreadWindowPermissionScope? {
        guard let rawValue else { return nil }
        return ThreadWindowPermissionScope(rawValue: rawValue)
    }
}

import ComposableArchitecture
import Foundation

@Observable
@MainActor
final class ThreadTabViewModel: Identifiable {
    let id: String
    let tabID: String
    let threadID: String

    var messages: [ThreadBubble] { store.state.events.messages }
    var status: ThreadRunStatus { store.state.thread.status }
    var error: String? { store.state.events.errorMessage }
    var pendingPermissionRequests: [ThreadPermissionRequest] {
        store.state.events.pendingPermissionRequests
    }
    var pendingWorkspaceAskRequests: [ThreadWorkspaceAskRequest] {
        store.state.events.pendingWorkspaceAskRequests
    }
    var connectionState: ThreadConnectionState { store.state.events.connectionState }
    var connectionMessage: String? { store.state.events.connectionMessage }
    var isInvalid: Bool { store.state.thread.isInvalid }
    var invalidReason: String? { store.state.thread.invalidReason }

    var canSendPrompt: Bool { connectionState == .connected && !isInvalid }
    var visibleWorkspaceAskRequest: ThreadWorkspaceAskRequest? {
        store.state.events.visibleWorkspaceAskRequest
    }

    @ObservationIgnored private let store: StoreOf<ThreadFeature>
    @ObservationIgnored private let sendCommand: (ThreadProtocolClient.Command) -> Void
    @ObservationIgnored private let sendResponse: (ThreadProtocolClient.Response) -> Void
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
        store: StoreOf<ThreadFeature>? = nil,
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
        self.store = store ?? Store(initialState: ThreadFeature.State(threadID: threadID)) {
            ThreadFeature()
        }
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
        store.send(.localUserMessage(
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
        store.send(.interruptRequested)
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
        store.send(.permissionResolved(requestID: requestId))
    }

    func resolveWorkspaceAsk(requestId: String, workspaceId: String?) {
        sendResponse(.workspaceAnswered(
            requestId: requestId,
            timestamp: Self.timestamp(),
            workspaceId: workspaceId,
            cancelled: workspaceId == nil
        ))
        store.send(.workspaceResolved(requestID: requestId))
    }

    func handle(_ event: ThreadEvent) {
        store.send(.event(event))

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

    private func permissionScope(from rawValue: String?) -> ThreadProtocolClient.PermissionScope? {
        guard let rawValue else { return nil }
        return ThreadProtocolClient.PermissionScope(rawValue: rawValue)
    }
}

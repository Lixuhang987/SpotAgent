import Foundation

@Observable
@MainActor
final class SessionWindowViewModel {
    typealias SocketFactory = (String) -> SessionSocketClient
    typealias SessionEventSubscriber = (
        String,
        @escaping (SessionEvent) -> Void
    ) -> SessionEventBus<SessionEvent>.Subscription
    typealias GlobalEventSubscriber = (
        @escaping (SessionEvent) -> Void
    ) -> SessionEventBus<SessionEvent>.Subscription

    private(set) var tabs: [SessionTabViewModel] = []
    private(set) var activeTabID: String?
    private(set) var historyList: [SessionListItem] = []
    private(set) var pendingHistoryDeletionID: String?
    private(set) var noticeMessage: String?

    @ObservationIgnored private let socketFactory: SocketFactory?
    @ObservationIgnored private let historySocketClient: SessionSocketClient?
    @ObservationIgnored private let sendCommand: ((SessionProtocolClient.Command) -> Void)?
    @ObservationIgnored private let sendResponse: ((SessionProtocolClient.Response) -> Void)?
    @ObservationIgnored private let subscribeToSessionEvents: SessionEventSubscriber?
    @ObservationIgnored private let onTabStateChanged: @MainActor (SessionTabViewModel) -> Void
    @ObservationIgnored private let onTabClosed: @MainActor (SessionTabViewModel) -> Void
    @ObservationIgnored private var pendingCreatedSessionPrompts: [String: PendingCreatedSessionPrompt] = [:]
    @ObservationIgnored private var windowEventSubscription: SessionEventBus<SessionEvent>.Subscription?
    @ObservationIgnored private var sharedConnectionState: SessionConnectionState = .disconnected
    @ObservationIgnored private var hasEstablishedSharedConnection = false

    var activeTab: SessionTabViewModel? {
        guard let activeTabID else { return nil }
        return tabs.first { $0.tabID == activeTabID }
    }

    init(
        socketFactory: @escaping SocketFactory,
        historySocketClient: SessionSocketClient = .noop,
        onTabStateChanged: @escaping @MainActor (SessionTabViewModel) -> Void = { _ in },
        onTabClosed: @escaping @MainActor (SessionTabViewModel) -> Void = { _ in }
    ) {
        self.socketFactory = socketFactory
        self.historySocketClient = historySocketClient
        self.sendCommand = nil
        self.sendResponse = nil
        self.subscribeToSessionEvents = nil
        self.onTabStateChanged = onTabStateChanged
        self.onTabClosed = onTabClosed
        self.historySocketClient?.onEvent = { [weak self] event in
            Task { @MainActor in self?.handleWindowEvent(event) }
        }
        self.historySocketClient?.connect(sessionID: "")
        refreshHistory()
    }

    init(
        subscribeToSessionEvents: @escaping SessionEventSubscriber,
        subscribeToGlobalEvents: @escaping GlobalEventSubscriber,
        sendCommand: @escaping (SessionProtocolClient.Command) -> Void,
        sendResponse: @escaping (SessionProtocolClient.Response) -> Void,
        onTabStateChanged: @escaping @MainActor (SessionTabViewModel) -> Void = { _ in },
        onTabClosed: @escaping @MainActor (SessionTabViewModel) -> Void = { _ in }
    ) {
        self.socketFactory = nil
        self.historySocketClient = nil
        self.sendCommand = sendCommand
        self.sendResponse = sendResponse
        self.subscribeToSessionEvents = subscribeToSessionEvents
        self.onTabStateChanged = onTabStateChanged
        self.onTabClosed = onTabClosed
        self.windowEventSubscription = subscribeToGlobalEvents { [weak self] event in
            self?.handleWindowEvent(event)
        }
    }

    func openOrFocusHistory() {
        refreshHistory()
    }

    func openHistorySession(_ sessionID: String) {
        if let existing = tabs.first(where: { $0.sessionID == sessionID }) {
            activeTabID = existing.tabID
            return
        }

        let tab = makeTab(sessionID: sessionID)
        tabs.append(tab)
        activeTabID = tab.tabID
        if socketFactory == nil {
            tab.setConnectionState(sharedConnectionState)
        }
        tab.open()
    }

    func activateTab(_ tabID: String) {
        guard tabs.contains(where: { $0.tabID == tabID }) else { return }
        activeTabID = tabID
    }

    func closeTab(_ tabID: String) {
        guard let index = tabs.firstIndex(where: { $0.tabID == tabID }) else { return }
        let closingTab = tabs[index]
        closingTab.disconnect()
        onTabClosed(closingTab)
        tabs.remove(at: index)
        if activeTabID == tabID {
            activeTabID = tabs.last?.tabID
        }
    }

    func sendPrompt(_ text: String, attachments: [UserMessageAttachmentPayload] = []) {
        if let activeTab {
            activeTab.sendPrompt(text, attachments: attachments)
            return
        }

        createTabWithInitialPrompt(text, attachments: attachments)
    }

    func createTabWithInitialPrompt(
        _ text: String,
        attachments: [UserMessageAttachmentPayload] = [],
        actionBinding: ActionBindingPayload? = nil,
        workspaceId: String? = nil
    ) {
        let trimmedText = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedText.isEmpty else { return }

        let pendingPrompt = PendingCreatedSessionPrompt(
            text: trimmedText,
            attachments: attachments,
            actionBinding: actionBinding
        )
        let requestMessageID: String
        if let historySocketClient {
            requestMessageID = historySocketClient.sendCreateSession(
                actionBinding: actionBinding,
                workspaceId: workspaceId
            )
        } else {
            requestMessageID = UUID().uuidString
            sendCommand?(.sessionCreate(
                commandId: requestMessageID,
                timestamp: Self.timestamp(),
                initialText: nil,
                attachments: [],
                workspaceId: workspaceId,
                actionBinding: actionBinding
            ))
        }
        pendingCreatedSessionPrompts[requestMessageID] = pendingPrompt
    }

    func createNewSession(workspaceId: String? = nil) {
        if let historySocketClient {
            historySocketClient.sendCreateSession(workspaceId: workspaceId)
        } else {
            sendCommand?(.sessionCreate(
                commandId: UUID().uuidString,
                timestamp: Self.timestamp(),
                initialText: nil,
                attachments: [],
                workspaceId: workspaceId,
                actionBinding: nil
            ))
        }
    }

    func stopActiveTab() {
        activeTab?.stop()
    }

    func refreshHistory() {
        if let historySocketClient {
            historySocketClient.sendListSessions(sessionID: "")
        } else {
            sendCommand?(.sessionsList(
                commandId: UUID().uuidString,
                timestamp: Self.timestamp()
            ))
        }
    }

    func requestDeleteSession(_ sessionID: String) {
        pendingHistoryDeletionID = sessionID
    }

    func cancelDeleteSession() {
        pendingHistoryDeletionID = nil
    }

    func confirmDeleteSession() {
        guard let target = pendingHistoryDeletionID else { return }
        pendingHistoryDeletionID = nil
        if let historySocketClient {
            historySocketClient.sendDeleteSession(sessionID: "", targetSessionId: target)
        } else {
            sendCommand?(.sessionDelete(
                commandId: UUID().uuidString,
                timestamp: Self.timestamp(),
                targetSessionId: target
            ))
        }
    }

    func handleConnectionState(_ state: SessionConnectionState) {
        sharedConnectionState = state
        tabs.forEach { $0.setConnectionState(state) }

        guard socketFactory == nil, state == .connected else { return }
        if hasEstablishedSharedConnection {
            tabs.forEach { $0.resubscribe() }
        }
        hasEstablishedSharedConnection = true
        refreshHistory()
    }

    func pruneInvalidTabs() {
        let invalidTabs = tabs.filter(\.isInvalid)
        guard !invalidTabs.isEmpty else { return }

        if let invalidActive = activeTab, invalidActive.isInvalid {
            noticeMessage = invalidActive.invalidReason
        }

        tabs.removeAll { $0.isInvalid }
        if let activeTabID,
           !tabs.contains(where: { $0.tabID == activeTabID }) {
            self.activeTabID = tabs.last?.tabID
        }
    }

    func handleWindowEvent(_ event: SessionEvent) {
        switch event {
        case .sessionList(let sessions):
            historyList = sessions
        case .createSessionResponse(let sessionID, _, let responseMessageID):
            let pendingPrompt = pendingCreatedSessionPrompts.removeValue(forKey: responseMessageID)
            openHistorySession(sessionID)
            if let pendingPrompt,
               activeTab?.sessionID == sessionID {
                activeTab?.sendPrompt(pendingPrompt.text, attachments: pendingPrompt.attachments)
            }
            refreshHistory()
        case .userMessageFailed(_, let message, let responseMessageID):
            pendingCreatedSessionPrompts.removeValue(forKey: responseMessageID)
            noticeMessage = message
        case .deleteSessionResponse(let targetSessionID, let status):
            if status == "deleted",
               let tab = tabs.first(where: { $0.sessionID == targetSessionID }) {
                closeTab(tab.tabID)
            }
            refreshHistory()
        default:
            break
        }
    }

    private func makeTab(sessionID: String) -> SessionTabViewModel {
        if let socketFactory {
            return SessionTabViewModel(
                tabID: UUID().uuidString,
                sessionID: sessionID,
                socketClient: socketFactory(sessionID),
                onStateChanged: { [weak self] _ in
                    guard let self else { return }
                    if let tab = self.tabs.first(where: { $0.sessionID == sessionID }) {
                        self.onTabStateChanged(tab)
                    }
                    self.pruneInvalidTabs()
                }
            )
        }

        return SessionTabViewModel(
            tabID: UUID().uuidString,
            sessionID: sessionID,
            subscribeToEvents: { [weak self] sessionID, handler in
                guard let subscriber = self?.subscribeToSessionEvents else {
                    fatalError("Missing session event subscriber for shared connection mode")
                }
                return subscriber(sessionID, handler)
            },
            sendCommand: { [weak self] command in
                self?.sendCommand?(command)
            },
            sendResponse: { [weak self] response in
                self?.sendResponse?(response)
            },
            onStateChanged: { [weak self] _ in
                guard let self else { return }
                if let tab = self.tabs.first(where: { $0.sessionID == sessionID }) {
                    self.onTabStateChanged(tab)
                }
                self.pruneInvalidTabs()
            }
        )
    }

    private static func timestamp() -> String {
        ISO8601DateFormatter().string(from: Date())
    }
}

private struct PendingCreatedSessionPrompt {
    let text: String
    let attachments: [UserMessageAttachmentPayload]
    let actionBinding: ActionBindingPayload?
}

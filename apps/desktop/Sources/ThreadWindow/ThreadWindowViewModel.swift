import Foundation

@Observable
@MainActor
final class ThreadWindowViewModel {
    typealias ThreadEventSubscriber = (
        String,
        @escaping (ThreadEvent) -> Void
    ) -> ThreadEventBus<ThreadEvent>.Subscription
    typealias GlobalEventSubscriber = (
        @escaping (ThreadEvent) -> Void
    ) -> ThreadEventBus<ThreadEvent>.Subscription

    private(set) var tabs: [ThreadTabViewModel] = []
    private(set) var activeTabID: String?
    private(set) var historyList: [ThreadListItem] = []
    private(set) var pendingHistoryDeletionID: String?
    private(set) var noticeMessage: String?

    @ObservationIgnored private let sendCommand: (ThreadProtocolClient.Command) -> Void
    @ObservationIgnored private let sendResponse: (ThreadProtocolClient.Response) -> Void
    @ObservationIgnored private let subscribeToThreadEvents: ThreadEventSubscriber
    @ObservationIgnored private let onTabStateChanged: @MainActor (ThreadTabViewModel) -> Void
    @ObservationIgnored private let onTabClosed: @MainActor (ThreadTabViewModel) -> Void
    @ObservationIgnored private var pendingStartedThreadPrompts: [String: PendingStartedThreadPrompt] = [:]
    @ObservationIgnored private var windowEventSubscription: ThreadEventBus<ThreadEvent>.Subscription?
    @ObservationIgnored private var sharedConnectionState: ThreadConnectionState = .disconnected
    @ObservationIgnored private var hasEstablishedSharedConnection = false

    var activeTab: ThreadTabViewModel? {
        guard let activeTabID else { return nil }
        return tabs.first { $0.tabID == activeTabID }
    }

    init(
        subscribeToThreadEvents: @escaping ThreadEventSubscriber,
        subscribeToGlobalEvents: @escaping GlobalEventSubscriber,
        sendCommand: @escaping (ThreadProtocolClient.Command) -> Void,
        sendResponse: @escaping (ThreadProtocolClient.Response) -> Void,
        onTabStateChanged: @escaping @MainActor (ThreadTabViewModel) -> Void = { _ in },
        onTabClosed: @escaping @MainActor (ThreadTabViewModel) -> Void = { _ in }
    ) {
        self.sendCommand = sendCommand
        self.sendResponse = sendResponse
        self.subscribeToThreadEvents = subscribeToThreadEvents
        self.onTabStateChanged = onTabStateChanged
        self.onTabClosed = onTabClosed
        self.windowEventSubscription = subscribeToGlobalEvents { [weak self] event in
            self?.handleWindowEvent(event)
        }
        refreshHistory()
    }

    func openOrFocusHistory() {
        refreshHistory()
    }

    func openHistoryThread(_ threadID: String) {
        if let existing = tabs.first(where: { $0.threadID == threadID }) {
            activeTabID = existing.tabID
            return
        }

        let tab = makeTab(threadID: threadID)
        tabs.append(tab)
        activeTabID = tab.tabID
        tab.setConnectionState(sharedConnectionState)
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

        let pendingPrompt = PendingStartedThreadPrompt(
            text: trimmedText,
            attachments: attachments,
            actionBinding: actionBinding
        )
        let requestMessageID = UUID().uuidString
        sendCommand(.threadStart(
            commandId: requestMessageID,
            timestamp: Self.timestamp(),
            workspaceId: workspaceId,
            actionBinding: actionBinding
        ))
        pendingStartedThreadPrompts[requestMessageID] = pendingPrompt
    }

    func createNewThread(workspaceId: String? = nil) {
        sendCommand(.threadStart(
            commandId: UUID().uuidString,
            timestamp: Self.timestamp(),
            workspaceId: workspaceId,
            actionBinding: nil
        ))
    }

    func stopActiveTab() {
        activeTab?.stop()
    }

    func refreshHistory() {
        sendCommand(.threadList(
            commandId: UUID().uuidString,
            timestamp: Self.timestamp()
        ))
    }

    func requestDeleteThread(_ threadID: String) {
        pendingHistoryDeletionID = threadID
    }

    func cancelDeleteThread() {
        pendingHistoryDeletionID = nil
    }

    func confirmDeleteThread() {
        guard let target = pendingHistoryDeletionID else { return }
        pendingHistoryDeletionID = nil
        sendCommand(.threadDelete(
            commandId: UUID().uuidString,
            timestamp: Self.timestamp(),
            targetThreadId: target
        ))
    }

    func handleConnectionState(_ state: ThreadConnectionState) {
        sharedConnectionState = state
        tabs.forEach { $0.setConnectionState(state) }

        guard state == .connected else { return }
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

    func handleWindowEvent(_ event: ThreadEvent) {
        switch event {
        case .threadList(let threads):
            historyList = threads
        case .threadStarted(let threadID, _, let responseMessageID):
            let pendingPrompt = pendingStartedThreadPrompts.removeValue(forKey: responseMessageID)
            openHistoryThread(threadID)
            if let pendingPrompt,
               activeTab?.threadID == threadID {
                activeTab?.sendPrompt(pendingPrompt.text, attachments: pendingPrompt.attachments)
            }
            refreshHistory()
        case .threadStartFailed(_, let message, let responseMessageID):
            pendingStartedThreadPrompts.removeValue(forKey: responseMessageID)
            noticeMessage = message
        case .threadDeleted(let targetThreadID, let status):
            if status == "deleted",
               let tab = tabs.first(where: { $0.threadID == targetThreadID }) {
                closeTab(tab.tabID)
            }
            refreshHistory()
        default:
            break
        }
    }

    private func makeTab(threadID: String) -> ThreadTabViewModel {
        return ThreadTabViewModel(
            tabID: UUID().uuidString,
            threadID: threadID,
            subscribeToEvents: { [weak self] threadID, handler in
                guard let self else {
                    fatalError("ThreadWindowViewModel released before subscribing to thread events")
                }
                return self.subscribeToThreadEvents(threadID, handler)
            },
            sendCommand: { [weak self] command in
                self?.sendCommand(command)
            },
            sendResponse: { [weak self] response in
                self?.sendResponse(response)
            },
            onStateChanged: { [weak self] _ in
                guard let self else { return }
                if let tab = self.tabs.first(where: { $0.threadID == threadID }) {
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

private struct PendingStartedThreadPrompt {
    let text: String
    let attachments: [UserMessageAttachmentPayload]
    let actionBinding: ActionBindingPayload?
}

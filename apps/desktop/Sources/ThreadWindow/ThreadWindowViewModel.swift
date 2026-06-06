import ComposableArchitecture
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

    var tabs: [ThreadTabViewModel] {
        reconcileTabAdapters()
        return store.state.tabs.map { tabAdapter(for: $0.id) }
    }
    var activeTabID: String? { store.state.activeTabID }
    var historyList: [ThreadListItem] { store.state.threadList }
    var pendingHistoryDeletionID: String? { store.state.pendingHistoryDeletionID }
    var noticeMessage: String? { store.state.noticeMessage }

    @ObservationIgnored private let store: StoreOf<ThreadWindowFeature>
    @ObservationIgnored private let sendCommand: (ThreadWindowCommand) -> Void
    @ObservationIgnored private let sendResponse: (ThreadWindowResponse) -> Void
    @ObservationIgnored private let subscribeToThreadEvents: ThreadEventSubscriber
    @ObservationIgnored private let onTabStateChanged: @MainActor (ThreadTabViewModel) -> Void
    @ObservationIgnored private let onTabClosed: @MainActor (ThreadTabViewModel) -> Void
    @ObservationIgnored private var windowEventSubscription: ThreadEventBus<ThreadEvent>.Subscription?
    @ObservationIgnored private var tabAdapters: [String: ThreadTabViewModel] = [:]

    var activeTab: ThreadTabViewModel? {
        guard let activeTabID else { return nil }
        guard store.state.tabs.contains(where: { $0.id == activeTabID }) else { return nil }
        return tabAdapter(for: activeTabID)
    }

    init(
        store: StoreOf<ThreadWindowFeature>? = nil,
        subscribeToThreadEvents: @escaping ThreadEventSubscriber,
        subscribeToGlobalEvents: @escaping GlobalEventSubscriber,
        sendCommand: @escaping (ThreadWindowCommand) -> Void,
        sendResponse: @escaping (ThreadWindowResponse) -> Void,
        onTabStateChanged: @escaping @MainActor (ThreadTabViewModel) -> Void = { _ in },
        onTabClosed: @escaping @MainActor (ThreadTabViewModel) -> Void = { _ in }
    ) {
        self.store = store ?? Store(initialState: ThreadWindowFeature.State()) {
            ThreadWindowFeature()
        }
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
        if store.state.tabs.contains(where: { $0.thread.id == threadID }) {
            store.send(.activateTab(threadID))
            return
        }

        store.send(.openHistoryThread(threadID))
        tabAdapter(for: threadID).open()
    }

    func activateTab(_ tabID: String) {
        guard store.state.tabs.contains(where: { $0.id == tabID }) else { return }
        store.send(.activateTab(tabID))
    }

    func closeTab(_ tabID: String) {
        guard store.state.tabs.contains(where: { $0.id == tabID }) else { return }
        let closingTab = tabAdapter(for: tabID)
        closingTab.disconnect()
        onTabClosed(closingTab)
        tabAdapters[tabID] = nil
        store.send(.closeTab(tabID))
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

        let requestMessageID = UUID().uuidString
        let pendingPrompt = PendingStartedThreadPromptState(
            messageID: requestMessageID,
            text: trimmedText,
            attachments: attachments,
            actionBinding: actionBinding
        )
        sendCommand(.threadStart(
            commandId: requestMessageID,
            timestamp: Self.timestamp(),
            workspaceId: workspaceId,
            actionBinding: actionBinding
        ))
        store.send(.queueInitialPrompt(commandID: requestMessageID, pendingPrompt))
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
        store.send(.requestDeleteThread(threadID))
    }

    func cancelDeleteThread() {
        store.send(.cancelDeleteThread)
    }

    func confirmDeleteThread() {
        guard let target = pendingHistoryDeletionID else { return }
        store.send(.clearPendingDeletion)
        sendCommand(.threadDelete(
            commandId: UUID().uuidString,
            timestamp: Self.timestamp(),
            targetThreadId: target
        ))
    }

    func handleConnectionState(_ state: ThreadConnectionState) {
        let shouldResubscribe = state == .connected && store.state.hasEstablishedSharedConnection
        store.send(.connectionStateChanged(state))

        guard state == .connected else { return }
        if shouldResubscribe {
            tabs.forEach { $0.resubscribe() }
        }
        refreshHistory()
    }

    func pruneInvalidTabs() {
        let invalidTabs = tabs.filter(\.isInvalid)
        guard !invalidTabs.isEmpty else { return }

        if let invalidActive = activeTab, invalidActive.isInvalid {
            store.send(.setNotice(invalidActive.invalidReason))
        }
        invalidTabs.forEach { tab in
            tab.disconnect()
            tabAdapters[tab.tabID] = nil
        }
        store.send(.pruneInvalidTabs)
    }

    func handleWindowEvent(_ event: ThreadEvent) {
        switch event {
        case .threadStarted(let threadID, _, let responseMessageID):
            let pendingPrompt = store.state.pendingStartedThreadPrompts[responseMessageID]
            let wasOpen = store.state.tabs.contains { $0.thread.id == threadID }
            store.send(.windowEvent(event))
            if !wasOpen {
                tabAdapter(for: threadID).open()
            }
            if let pendingPrompt,
               activeTab?.threadID == threadID {
                sendCommand(.turnStart(
                    threadId: threadID,
                    commandId: pendingPrompt.messageID,
                    timestamp: Self.timestamp(),
                    text: pendingPrompt.text,
                    attachments: pendingPrompt.attachments
                ))
            }
            refreshHistory()

        case .threadDeleted(let targetThreadID, let status):
            store.send(.windowEvent(event))
            if status == "deleted",
               tabAdapters[targetThreadID] != nil {
                let tab = tabAdapter(for: targetThreadID)
                tab.disconnect()
                onTabClosed(tab)
                tabAdapters[targetThreadID] = nil
            }
            refreshHistory()

        case .threadList, .threadStartFailed:
            store.send(.windowEvent(event))

        default:
            break
        }
    }

    private func tabAdapter(for threadID: String) -> ThreadTabViewModel {
        if let adapter = tabAdapters[threadID] {
            return adapter
        }

        let adapter = ThreadTabViewModel(
            tabID: threadID,
            threadID: threadID,
            readState: { [weak self] in
                self?.store.state.tabs.first { $0.id == threadID }
            },
            sendAction: { [weak self] action in
                self?.store.send(.tab(id: threadID, action))
            },
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
            onStateChanged: { [weak self] tab in
                guard let self else { return }
                self.onTabStateChanged(tab)
                self.pruneInvalidTabs()
            }
        )
        tabAdapters[threadID] = adapter
        return adapter
    }

    private func reconcileTabAdapters() {
        let liveIDs = Set(store.state.tabs.map(\.id))
        for id in tabAdapters.keys where !liveIDs.contains(id) {
            tabAdapters[id]?.disconnect()
            tabAdapters[id] = nil
        }
    }

    private static func timestamp() -> String {
        ISO8601DateFormatter().string(from: Date())
    }
}

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

    private(set) var tabs: [ThreadTabViewModel] = []
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
    @ObservationIgnored private var sharedConnectionState: ThreadConnectionState = .disconnected
    @ObservationIgnored private var hasEstablishedSharedConnection = false

    var activeTab: ThreadTabViewModel? {
        guard let activeTabID else { return nil }
        return tabs.first { $0.tabID == activeTabID }
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
        if let existing = tabs.first(where: { $0.threadID == threadID }) {
            store.send(.activateTab(existing.tabID))
            return
        }

        store.send(.openHistoryThread(threadID))
        let tab = makeTab(threadID: threadID)
        tabs.append(tab)
        tab.setConnectionState(sharedConnectionState)
        tab.open()
    }

    func activateTab(_ tabID: String) {
        guard tabs.contains(where: { $0.tabID == tabID }) else { return }
        store.send(.activateTab(tabID))
    }

    func closeTab(_ tabID: String) {
        guard let index = tabs.firstIndex(where: { $0.tabID == tabID }) else { return }
        let closingTab = tabs[index]
        closingTab.disconnect()
        onTabClosed(closingTab)
        tabs.remove(at: index)
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
        sharedConnectionState = state
        tabs.forEach { $0.setConnectionState(state) }
        store.send(.connectionStateChanged(state))

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
            store.send(.setNotice(invalidActive.invalidReason))
        }
        tabs.removeAll { $0.isInvalid }
        store.send(.pruneInvalidTabs)
    }

    func handleWindowEvent(_ event: ThreadEvent) {
        switch event {
        case .threadStarted(let threadID, _, let responseMessageID):
            let pendingPrompt = store.state.pendingStartedThreadPrompts[responseMessageID]
            store.send(.windowEvent(event))
            openHistoryThread(threadID)
            if let pendingPrompt,
               activeTab?.threadID == threadID {
                activeTab?.sendPrompt(pendingPrompt.text, attachments: pendingPrompt.attachments)
            }
            refreshHistory()

        case .threadDeleted(let targetThreadID, let status):
            store.send(.windowEvent(event))
            if status == "deleted",
               let tab = tabs.first(where: { $0.threadID == targetThreadID }) {
                closeTab(tab.tabID)
            }
            refreshHistory()

        case .threadList, .threadStartFailed:
            store.send(.windowEvent(event))

        default:
            break
        }
    }

    private func makeTab(threadID: String) -> ThreadTabViewModel {
        let tabStore = Store(initialState: ThreadFeature.State(threadID: threadID)) {
            ThreadFeature()
        }
        return ThreadTabViewModel(
            tabID: threadID,
            threadID: threadID,
            store: tabStore,
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
    }

    private static func timestamp() -> String {
        ISO8601DateFormatter().string(from: Date())
    }
}

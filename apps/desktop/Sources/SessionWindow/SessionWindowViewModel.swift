import Foundation

@Observable
@MainActor
final class SessionWindowViewModel {
    typealias SocketFactory = (String) -> SessionSocketClient

    private(set) var tabs: [SessionTabViewModel] = []
    private(set) var activeTabID: String?
    private(set) var historyList: [SessionListItem] = []
    private(set) var pendingHistoryDeletionID: String?
    private(set) var noticeMessage: String?

    @ObservationIgnored private let socketFactory: SocketFactory
    @ObservationIgnored private let historySocketClient: SessionSocketClient
    @ObservationIgnored private let onTabStateChanged: @MainActor (SessionTabViewModel) -> Void
    @ObservationIgnored private let onTabClosed: @MainActor (SessionTabViewModel) -> Void
    @ObservationIgnored private var pendingCreatedSessionPrompt: PendingCreatedSessionPrompt?

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
        self.onTabStateChanged = onTabStateChanged
        self.onTabClosed = onTabClosed
        self.historySocketClient.onEvent = { [weak self] event in
            Task { @MainActor in self?.handleWindowEvent(event) }
        }
        self.historySocketClient.connect(sessionID: "")
        refreshHistory()
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

    func createTabWithInitialPrompt(_ text: String, attachments: [UserMessageAttachmentPayload] = []) {
        let trimmedText = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedText.isEmpty else { return }

        pendingCreatedSessionPrompt = PendingCreatedSessionPrompt(
            text: trimmedText,
            attachments: attachments
        )
        historySocketClient.sendCreateSession()
    }

    func stopActiveTab() {
        activeTab?.stop()
    }

    func refreshHistory() {
        historySocketClient.sendListSessions(sessionID: "")
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
        historySocketClient.sendDeleteSession(sessionID: "", targetSessionId: target)
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
        case .createSessionResponse(let sessionID, _):
            let pendingPrompt = pendingCreatedSessionPrompt
            pendingCreatedSessionPrompt = nil
            openHistorySession(sessionID)
            if let pendingPrompt,
               activeTab?.sessionID == sessionID {
                activeTab?.sendPrompt(pendingPrompt.text, attachments: pendingPrompt.attachments)
            }
            refreshHistory()
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
        SessionTabViewModel(
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
}

private struct PendingCreatedSessionPrompt {
    let text: String
    let attachments: [UserMessageAttachmentPayload]
}

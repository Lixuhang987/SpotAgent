import ComposableArchitecture
import Foundation

@Reducer
struct ThreadWindowFeature {
    @ObservableState
    struct State: Equatable {
        var tabs: [ThreadFeature.State] = []
        var activeTabID: String?
        var threadList: [ThreadListItem] = []
        var pendingHistoryDeletionID: String?
        var noticeMessage: String?
        var pendingStartedThreadPrompts: [String: PendingStartedThreadPromptState] = [:]
        var sharedConnectionState: ThreadConnectionState = .disconnected
        var hasEstablishedSharedConnection = false
    }

    enum Action: Equatable {
        case openHistoryThread(String)
        case activateTab(String)
        case closeTab(String)
        case queueInitialPrompt(commandID: String, PendingStartedThreadPromptState)
        case requestDeleteThread(String)
        case cancelDeleteThread
        case clearPendingDeletion
        case setNotice(String?)
        case connectionStateChanged(ThreadConnectionState)
        case pruneInvalidTabs
        case windowEvent(ThreadEvent)
        case tab(id: String, ThreadFeature.Action)
    }

    var body: some ReducerOf<Self> {
        Reduce { state, action in
            switch action {
            case .openHistoryThread(let threadID):
                openHistoryThread(threadID, in: &state)
                return .none

            case .activateTab(let tabID):
                if state.tabs.contains(where: { $0.id == tabID }) {
                    state.activeTabID = tabID
                }
                return .none

            case .closeTab(let tabID):
                state.tabs.removeAll { $0.id == tabID }
                if state.activeTabID == tabID {
                    state.activeTabID = state.tabs.last?.id
                }
                return .none

            case .queueInitialPrompt(let commandID, let prompt):
                state.pendingStartedThreadPrompts[commandID] = prompt
                return .none

            case .requestDeleteThread(let threadID):
                state.pendingHistoryDeletionID = threadID
                return .none

            case .cancelDeleteThread:
                state.pendingHistoryDeletionID = nil
                return .none

            case .clearPendingDeletion:
                state.pendingHistoryDeletionID = nil
                return .none

            case .setNotice(let message):
                state.noticeMessage = message
                return .none

            case .connectionStateChanged(let connectionState):
                state.sharedConnectionState = connectionState
                if connectionState == .connected {
                    state.hasEstablishedSharedConnection = true
                }
                for index in state.tabs.indices {
                    ThreadFeature.apply(.event(.connectionState(connectionState)), to: &state.tabs[index])
                }
                return .none

            case .pruneInvalidTabs:
                pruneInvalidTabs(in: &state)
                return .none

            case .windowEvent(let event):
                applyWindowEvent(event, to: &state)
                return .none

            case .tab(let id, let tabAction):
                guard let index = state.tabs.firstIndex(where: { $0.id == id }) else { return .none }
                ThreadFeature.apply(tabAction, to: &state.tabs[index])
                return .none
            }
        }
    }

    private func openHistoryThread(_ threadID: String, in state: inout State) {
        if state.tabs.contains(where: { $0.thread.id == threadID }) {
            state.activeTabID = threadID
            return
        }
        var tab = ThreadFeature.State(threadID: threadID)
        ThreadFeature.apply(.event(.connectionState(state.sharedConnectionState)), to: &tab)
        state.tabs.append(tab)
        state.activeTabID = tab.id
    }

    private func applyWindowEvent(_ event: ThreadEvent, to state: inout State) {
        switch event {
        case .threadList(let threads):
            state.threadList = threads

        case .threadStarted(let threadID, _, let responseMessageID):
            let pendingPrompt = state.pendingStartedThreadPrompts.removeValue(forKey: responseMessageID)
            openHistoryThread(threadID, in: &state)
            if let pendingPrompt,
               let index = state.tabs.firstIndex(where: { $0.thread.id == threadID }) {
                ThreadFeature.apply(
                    .localUserMessage(
                        messageID: pendingPrompt.messageID,
                        text: pendingPrompt.text,
                        attachments: pendingPrompt.attachments
                    ),
                    to: &state.tabs[index]
                )
            }

        case .threadStartFailed(_, let message, let responseMessageID):
            state.pendingStartedThreadPrompts.removeValue(forKey: responseMessageID)
            state.noticeMessage = message

        case .threadDeleted(let targetThreadID, let status):
            if status == "deleted" {
                state.tabs.removeAll { $0.thread.id == targetThreadID }
                if state.activeTabID == targetThreadID {
                    state.activeTabID = state.tabs.last?.id
                }
            }

        default:
            break
        }
    }

    private func pruneInvalidTabs(in state: inout State) {
        let invalidTabs = state.tabs.filter(\.thread.isInvalid)
        guard !invalidTabs.isEmpty else { return }

        if let activeTabID = state.activeTabID,
           let invalidActive = state.tabs.first(where: { $0.id == activeTabID && $0.thread.isInvalid }) {
            state.noticeMessage = invalidActive.thread.invalidReason
        }

        state.tabs.removeAll { $0.thread.isInvalid }
        if let activeTabID = state.activeTabID,
           !state.tabs.contains(where: { $0.id == activeTabID }) {
            state.activeTabID = state.tabs.last?.id
        }
    }
}

struct PendingStartedThreadPromptState: Equatable {
    let messageID: String
    let text: String
    let attachments: [UserMessageAttachmentPayload]
    let actionBinding: ActionBindingPayload?
}

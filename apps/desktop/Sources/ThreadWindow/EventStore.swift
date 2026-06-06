import Foundation

struct EventStore: Equatable {
    var messages: [ThreadBubble] = []
    var activeTurnID: String?
    var assistantStreamingMessageID: String?
    var pendingPermissionRequests: [ThreadPermissionRequest] = []
    var pendingWorkspaceAskRequests: [ThreadWorkspaceAskRequest] = []
    var pendingLocalTurnStartIndex: Int?
    var errorMessage: String?
    var connectionState: ThreadConnectionState = .disconnected
    var connectionMessage: String?

    var visibleWorkspaceAskRequest: ThreadWorkspaceAskRequest? {
        pendingWorkspaceAskRequests.first
    }
}

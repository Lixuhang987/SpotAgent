import Foundation

enum SessionConnectionState: Equatable {
    case disconnected
    case connecting
    case connected
    case reconnecting
}

struct SessionListItem: Equatable, Identifiable {
    let id: String
    let title: String?
    let updatedAt: String
    let messageCount: Int
    let workspaceId: String?
}

struct WorkspaceAskCandidate: Equatable, Identifiable, Decodable {
    let id: String
    let name: String
    let description: String
    let isDefault: Bool
}

enum SessionEvent: Equatable {
    case userMessage(messageID: String, text: String, timestamp: String)
    case assistantMessageStart(messageID: String, timestamp: String)
    case assistantMessageDelta(messageID: String, text: String, timestamp: String)
    case assistantMessageEnd(messageID: String, status: String, timestamp: String)
    case toolMessage(messageID: String, name: String, text: String, status: String, timestamp: String)
    case permissionRequest(requestId: String, toolName: String, toolCallId: String?, argumentsJSON: String)
    case workspaceAskRequest(requestId: String, prompt: String, candidates: [WorkspaceAskCandidate])
    case status(value: String)
    case error(messageID: String, message: String, timestamp: String)
    case sessionSnapshot(messages: [SessionBubble], status: String)
    case sessionOpenFailed(reason: String, message: String)
    case createSessionResponse(sessionID: String, title: String?, responseMessageID: String = "")
    case userMessageFailed(reason: String, message: String, responseMessageID: String = "")
    case deleteSessionResponse(targetSessionID: String, status: String)
    case sessionList(sessions: [SessionListItem])
    case sessionLoaded(targetSessionId: String, title: String?, messages: [SessionBubble])
    case connectionState(SessionConnectionState)
}

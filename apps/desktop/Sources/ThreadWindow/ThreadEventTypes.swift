import Foundation

enum ThreadConnectionState: Equatable {
    case disconnected
    case connecting
    case connected
    case reconnecting
}

struct ThreadListItem: Equatable, Identifiable {
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

enum ThreadEvent: Equatable {
    case userMessage(messageID: String, text: String, timestamp: String)
    case assistantMessageStart(messageID: String, timestamp: String)
    case assistantMessageDelta(messageID: String, text: String, timestamp: String)
    case assistantMessageEnd(messageID: String, status: String, timestamp: String)
    case toolMessage(messageID: String, name: String, text: String, status: String, timestamp: String)
    case permissionRequest(requestId: String, toolName: String, toolCallId: String?, argumentsJSON: String)
    case workspaceAskRequest(requestId: String, prompt: String, candidates: [WorkspaceAskCandidate])
    case status(value: String)
    case error(messageID: String, message: String, timestamp: String)
    case threadSnapshot(messages: [ThreadBubble], status: String)
    case threadOpenFailed(reason: String, message: String)
    case threadStarted(threadID: String, title: String?, responseMessageID: String = "")
    case threadStartFailed(reason: String, message: String, responseMessageID: String = "")
    case threadDeleted(targetThreadID: String, status: String)
    case threadList(threads: [ThreadListItem])
    case threadLoaded(targetThreadId: String, title: String?, messages: [ThreadBubble])
    case connectionState(ThreadConnectionState)
}

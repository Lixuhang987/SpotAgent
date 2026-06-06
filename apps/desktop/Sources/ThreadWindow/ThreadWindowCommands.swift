import Foundation

enum ThreadWindowCommand: Equatable {
    case threadStart(
        commandId: String,
        timestamp: String,
        workspaceId: String?,
        actionBinding: ActionBindingPayload?
    )
    case threadResume(threadId: String, commandId: String, timestamp: String)
    case turnStart(
        threadId: String,
        commandId: String,
        timestamp: String,
        text: String,
        attachments: [UserMessageAttachmentPayload] = []
    )
    case turnInterrupt(threadId: String, commandId: String, timestamp: String)
    case threadList(commandId: String, timestamp: String)
    case threadDelete(commandId: String, timestamp: String, targetThreadId: String)
}

enum ThreadWindowResponse: Equatable {
    case permissionAnswered(
        requestId: String,
        timestamp: String,
        decision: ThreadWindowPermissionDecision,
        scope: ThreadWindowPermissionScope?,
        reason: String?
    )
    case workspaceAnswered(
        requestId: String,
        timestamp: String,
        workspaceId: String?,
        cancelled: Bool?
    )
}

enum ThreadWindowPermissionDecision: String, Equatable {
    case allow
    case deny
}

enum ThreadWindowPermissionScope: String, Equatable {
    case once
    case thread
    case always
}

import Foundation

enum ThreadProtocolClient {
    enum Error: Swift.Error {
        case unsupportedMessageType(String)
        case invalidJSON
    }

    enum Command: Equatable {
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

    enum Response: Equatable {
        case permissionAnswered(
            requestId: String,
            timestamp: String,
            decision: PermissionDecision,
            scope: PermissionScope?,
            reason: String?
        )
        case workspaceAnswered(
            requestId: String,
            timestamp: String,
            workspaceId: String?,
            cancelled: Bool?
        )
    }

    enum PermissionDecision: String, Equatable {
        case allow
        case deny
    }

    enum PermissionScope: String, Equatable {
        case once
        case thread
        case always
    }

    enum InboundMessage: Equatable {
        case notification(Notification)
        case request(Request)
    }

    enum Notification: Equatable {
        case threadStarted(ThreadStartedNotification)
        case threadSnapshot(ThreadSnapshotNotification)
        case userMessageRecorded(UserMessageRecordedNotification)
        case turnStarted(TurnStartedNotification)
        case assistantDelta(AssistantDeltaNotification)
        case toolStarted(ToolStartedNotification)
        case toolFinished(ToolFinishedNotification)
        case turnCompleted(TurnCompletedNotification)
        case threadStatusChanged(ThreadStatusChangedNotification)
        case threadListed(ThreadListedNotification)
        case threadDeleted(ThreadDeletedNotification)
        case threadError(ThreadErrorNotification)
    }

    enum Request: Equatable {
        case permissionRequested(PermissionRequested)
        case workspaceRequested(WorkspaceRequested)
    }

    enum ToolTerminalStatus: String, Equatable {
        case completed
        case failed
    }

    struct ThreadStartedNotification: Equatable {
        let threadId: String
        let notificationId: String
        let commandId: String?
        let timestamp: String
        let preview: String?
    }

    struct ThreadSnapshotNotification: Equatable {
        let threadId: String
        let notificationId: String
        let commandId: String?
        let timestamp: String
        let messages: [ThreadBubble]
        let status: ThreadRunStatus
    }

    struct UserMessageRecordedNotification: Equatable {
        let threadId: String
        let notificationId: String
        let timestamp: String
        let messageId: String
        let text: String
    }

    struct TurnStartedNotification: Equatable {
        let threadId: String
        let notificationId: String
        let turnId: String
        let timestamp: String
    }

    struct AssistantDeltaNotification: Equatable {
        let threadId: String
        let notificationId: String
        let turnId: String
        let itemId: String
        let timestamp: String
        let text: String
    }

    struct ToolStartedNotification: Equatable {
        let threadId: String
        let notificationId: String
        let turnId: String
        let itemId: String
        let timestamp: String
        let name: String
        let inputJSON: String
    }

    struct ToolFinishedNotification: Equatable {
        let threadId: String
        let notificationId: String
        let turnId: String
        let itemId: String
        let timestamp: String
        let name: String
        let status: ToolTerminalStatus
        let output: String
        let durationMs: Int
    }

    struct TurnCompletedNotification: Equatable {
        let threadId: String
        let notificationId: String
        let turnId: String
        let timestamp: String
        let status: ThreadRunStatus
    }

    struct ThreadStatusChangedNotification: Equatable {
        let threadId: String
        let notificationId: String
        let timestamp: String
        let status: ThreadRunStatus
    }

    struct ThreadListedNotification: Equatable {
        let notificationId: String
        let commandId: String?
        let timestamp: String
        let threads: [ThreadListItem]
    }

    struct ThreadDeletedNotification: Equatable {
        let notificationId: String
        let commandId: String?
        let timestamp: String
        let targetThreadId: String
        let status: String
    }

    struct ThreadErrorNotification: Equatable {
        let threadId: String?
        let notificationId: String
        let commandId: String?
        let timestamp: String
        let code: String?
        let message: String
    }

    struct PermissionRequested: Equatable {
        let requestId: String
        let threadId: String
        let timestamp: String
        let toolName: String
        let toolCallId: String
        let argumentsJSON: String
        let timeoutMs: Int?
    }

    struct WorkspaceRequested: Equatable {
        let requestId: String
        let threadId: String
        let timestamp: String
        let toolCallId: String?
        let prompt: String
        let candidates: [WorkspaceAskCandidate]
        let timeoutMs: Int?
    }

    static func encode(command: Command) throws -> String {
        let envelope: any Encodable
        switch command {
        case let .threadStart(commandId, timestamp, workspaceId, actionBinding):
            envelope = ThreadStartCommandEnvelope(
                commandId: commandId,
                timestamp: timestamp,
                payload: ThreadStartPayload(
                    workspaceId: workspaceId,
                    actionBinding: actionBinding
                )
            )
        case let .threadResume(threadId, commandId, timestamp):
            envelope = ThreadScopedEmptyCommandEnvelope(
                type: "thread.resume",
                threadId: threadId,
                commandId: commandId,
                timestamp: timestamp
            )
        case let .turnStart(threadId, commandId, timestamp, text, attachments):
            envelope = TurnStartCommandEnvelope(
                threadId: threadId,
                commandId: commandId,
                timestamp: timestamp,
                payload: TurnStartPayload(
                    text: text,
                    attachments: attachments.isEmpty ? nil : attachments
                )
            )
        case let .turnInterrupt(threadId, commandId, timestamp):
            envelope = ThreadScopedEmptyCommandEnvelope(
                type: "turn.interrupt",
                threadId: threadId,
                commandId: commandId,
                timestamp: timestamp
            )
        case let .threadList(commandId, timestamp):
            envelope = GlobalEmptyCommandEnvelope(
                type: "thread.list",
                commandId: commandId,
                timestamp: timestamp
            )
        case let .threadDelete(commandId, timestamp, targetThreadId):
            envelope = ThreadDeleteCommandEnvelope(
                commandId: commandId,
                timestamp: timestamp,
                payload: ThreadDeletePayload(targetThreadId: targetThreadId)
            )
        }

        return try encodeJSON(envelope)
    }

    static func encode(response: Response) throws -> String {
        let envelope: any Encodable
        switch response {
        case let .permissionAnswered(requestId, timestamp, decision, scope, reason):
            envelope = PermissionAnsweredEnvelope(
                requestId: requestId,
                timestamp: timestamp,
                payload: PermissionAnsweredPayload(
                    decision: decision.rawValue,
                    scope: scope?.rawValue,
                    reason: reason
                )
            )
        case let .workspaceAnswered(requestId, timestamp, workspaceId, cancelled):
            envelope = WorkspaceAnsweredEnvelope(
                requestId: requestId,
                timestamp: timestamp,
                payload: WorkspaceAnsweredPayload(
                    workspaceId: workspaceId,
                    cancelled: cancelled
                )
            )
        }

        return try encodeJSON(envelope)
    }

    static func decodeInboundMessage(from json: String) throws -> InboundMessage {
        guard let data = json.data(using: .utf8) else {
            throw Error.invalidJSON
        }
        return try decodeInboundMessage(from: data)
    }

    static func decodeInboundMessage(from data: Data) throws -> InboundMessage {
        let envelope = try decoder.decode(InboundEnvelope.self, from: data)

        switch envelope.type {
        case "thread.started":
            let body = try decoder.decode(ThreadStartedEnvelope.self, from: data)
            return .notification(.threadStarted(.init(
                threadId: body.threadId,
                notificationId: body.notificationId,
                commandId: body.commandId,
                timestamp: body.timestamp,
                preview: body.payload.preview
            )))
        case "thread.snapshot":
            let body = try decoder.decode(ThreadSnapshotEnvelope.self, from: data)
            return .notification(.threadSnapshot(.init(
                threadId: body.threadId,
                notificationId: body.notificationId,
                commandId: body.commandId,
                timestamp: body.timestamp,
                messages: body.payload.messages.map {
                    ThreadBubble(id: $0.id, role: $0.role, text: $0.text).normalizedForDisplay()
                },
                status: .fromProtocolStatus(body.payload.status)
            )))
        case "user.message.recorded":
            let body = try decoder.decode(UserMessageRecordedEnvelope.self, from: data)
            return .notification(.userMessageRecorded(.init(
                threadId: body.threadId,
                notificationId: body.notificationId,
                timestamp: body.timestamp,
                messageId: body.payload.messageId,
                text: body.payload.text
            )))
        case "turn.started":
            let body = try decoder.decode(TurnStartedEnvelope.self, from: data)
            return .notification(.turnStarted(.init(
                threadId: body.threadId,
                notificationId: body.notificationId,
                turnId: body.turnId,
                timestamp: body.timestamp
            )))
        case "assistant.delta":
            let body = try decoder.decode(AssistantDeltaEnvelope.self, from: data)
            return .notification(.assistantDelta(.init(
                threadId: body.threadId,
                notificationId: body.notificationId,
                turnId: body.turnId,
                itemId: body.itemId,
                timestamp: body.timestamp,
                text: body.payload.text
            )))
        case "tool.started":
            let body = try decoder.decode(ToolStartedEnvelope.self, from: data)
            return .notification(.toolStarted(.init(
                threadId: body.threadId,
                notificationId: body.notificationId,
                turnId: body.turnId,
                itemId: body.itemId,
                timestamp: body.timestamp,
                name: body.payload.name,
                inputJSON: prettyJSONObject(from: body.payload.input)
            )))
        case "tool.finished":
            let body = try decoder.decode(ToolFinishedEnvelope.self, from: data)
            return .notification(.toolFinished(.init(
                threadId: body.threadId,
                notificationId: body.notificationId,
                turnId: body.turnId,
                itemId: body.itemId,
                timestamp: body.timestamp,
                name: body.payload.name,
                status: ToolTerminalStatus(rawValue: body.payload.status) ?? .failed,
                output: body.payload.output,
                durationMs: body.payload.durationMs
            )))
        case "turn.completed":
            let body = try decoder.decode(TurnCompletedEnvelope.self, from: data)
            return .notification(.turnCompleted(.init(
                threadId: body.threadId,
                notificationId: body.notificationId,
                turnId: body.turnId,
                timestamp: body.timestamp,
                status: .fromProtocolStatus(body.payload.status)
            )))
        case "thread.status.changed":
            let body = try decoder.decode(ThreadStatusChangedEnvelope.self, from: data)
            return .notification(.threadStatusChanged(.init(
                threadId: body.threadId,
                notificationId: body.notificationId,
                timestamp: body.timestamp,
                status: .fromProtocolStatus(body.payload.value)
            )))
        case "thread.listed":
            let body = try decoder.decode(ThreadListedEnvelope.self, from: data)
            return .notification(.threadListed(.init(
                notificationId: body.notificationId,
                commandId: body.commandId,
                timestamp: body.timestamp,
                threads: body.payload.threads.map {
                    ThreadListItem(
                        id: $0.id,
                        title: $0.preview,
                        updatedAt: $0.updatedAt,
                        messageCount: $0.messageCount,
                        workspaceId: $0.workspaceId
                    )
                }
            )))
        case "thread.deleted":
            let body = try decoder.decode(ThreadDeletedEnvelope.self, from: data)
            return .notification(.threadDeleted(.init(
                notificationId: body.notificationId,
                commandId: body.commandId,
                timestamp: body.timestamp,
                targetThreadId: body.payload.targetThreadId,
                status: body.payload.status
            )))
        case "thread.error":
            let body = try decoder.decode(ThreadErrorEnvelope.self, from: data)
            return .notification(.threadError(.init(
                threadId: body.threadId,
                notificationId: body.notificationId,
                commandId: body.commandId,
                timestamp: body.timestamp,
                code: body.payload.code,
                message: body.payload.message
            )))
        case "permission.requested":
            let body = try decoder.decode(PermissionRequestedEnvelope.self, from: data)
            return .request(.permissionRequested(.init(
                requestId: body.requestId,
                threadId: body.threadId,
                timestamp: body.timestamp,
                toolName: body.payload.toolName,
                toolCallId: body.payload.toolCallId,
                argumentsJSON: prettyJSONObject(from: body.payload.arguments),
                timeoutMs: body.payload.timeoutMs
            )))
        case "workspace.requested":
            let body = try decoder.decode(WorkspaceRequestedEnvelope.self, from: data)
            return .request(.workspaceRequested(.init(
                requestId: body.requestId,
                threadId: body.threadId,
                timestamp: body.timestamp,
                toolCallId: body.payload.toolCallId,
                prompt: body.payload.prompt,
                candidates: body.payload.candidates,
                timeoutMs: body.payload.timeoutMs
            )))
        default:
            throw Error.unsupportedMessageType(envelope.type)
        }
    }

    private static let decoder = JSONDecoder()

    private static func encodeJSON(_ value: some Encodable) throws -> String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let data = try encoder.encode(value)
        guard let json = String(data: data, encoding: .utf8) else {
            throw Error.invalidJSON
        }
        return json
    }

    private static func prettyJSONObject(from object: some EncodableJSONObject) -> String {
        object.prettyPrintedJSONString()
    }
}

private protocol EncodableJSONObject {
    func prettyPrintedJSONString() -> String
}

extension Dictionary: EncodableJSONObject where Key == String, Value == JSONValue {
    fileprivate func prettyPrintedJSONString() -> String {
        let object = mapValues { $0.foundationObject }
        let options = JSONSerialization.WritingOptions([.sortedKeys, .prettyPrinted])
        guard
            JSONSerialization.isValidJSONObject(object),
            let data = try? JSONSerialization.data(withJSONObject: object, options: options),
            let text = String(data: data, encoding: .utf8)
        else {
            return "{}"
        }
        return text
    }
}

private struct InboundEnvelope: Decodable {
    let type: String
}

private enum JSONValue: Decodable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: JSONValue])
    case array([JSONValue])
    case null

    var foundationObject: Any {
        switch self {
        case .string(let value):
            return value
        case .number(let value):
            return value
        case .bool(let value):
            return value
        case .object(let value):
            return value.mapValues(\.foundationObject)
        case .array(let value):
            return value.map(\.foundationObject)
        case .null:
            return NSNull()
        }
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([String: JSONValue].self) {
            self = .object(value)
        } else if let value = try? container.decode([JSONValue].self) {
            self = .array(value)
        } else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unsupported JSON value")
        }
    }
}

private struct ThreadStartCommandEnvelope: Encodable {
    let type = "thread.start"
    let commandId: String
    let timestamp: String
    let payload: ThreadStartPayload
}

private struct ThreadStartPayload: Encodable {
    let workspaceId: String?
    let actionBinding: ActionBindingPayload?
}

private struct ThreadScopedEmptyCommandEnvelope: Encodable {
    let type: String
    let threadId: String
    let commandId: String
    let timestamp: String
}

private struct GlobalEmptyCommandEnvelope: Encodable {
    let type: String
    let commandId: String
    let timestamp: String
}

private struct TurnStartCommandEnvelope: Encodable {
    let type = "turn.start"
    let threadId: String
    let commandId: String
    let timestamp: String
    let payload: TurnStartPayload
}

private struct TurnStartPayload: Encodable {
    let text: String
    let attachments: [UserMessageAttachmentPayload]?
}

private struct ThreadDeleteCommandEnvelope: Encodable {
    let type = "thread.delete"
    let commandId: String
    let timestamp: String
    let payload: ThreadDeletePayload
}

private struct ThreadDeletePayload: Encodable {
    let targetThreadId: String
}

private struct PermissionAnsweredEnvelope: Encodable {
    let type = "permission.answered"
    let requestId: String
    let timestamp: String
    let payload: PermissionAnsweredPayload
}

private struct PermissionAnsweredPayload: Encodable {
    let decision: String
    let scope: String?
    let reason: String?
}

private struct WorkspaceAnsweredEnvelope: Encodable {
    let type = "workspace.answered"
    let requestId: String
    let timestamp: String
    let payload: WorkspaceAnsweredPayload
}

private struct WorkspaceAnsweredPayload: Encodable {
    let workspaceId: String?
    let cancelled: Bool?
}

private struct ThreadStartedEnvelope: Decodable {
    let threadId: String
    let notificationId: String
    let commandId: String?
    let timestamp: String
    let payload: ThreadStartedPayload
}

private struct ThreadStartedPayload: Decodable {
    let preview: String?
}

private struct ThreadSnapshotEnvelope: Decodable {
    let threadId: String
    let notificationId: String
    let commandId: String?
    let timestamp: String
    let payload: ThreadSnapshotPayload
}

private struct ThreadSnapshotPayload: Decodable {
    let messages: [ConversationSnapshotMessage]
    let status: String
}

private struct ConversationSnapshotMessage: Decodable {
    let id: String
    let role: String
    let text: String
}

private struct UserMessageRecordedEnvelope: Decodable {
    let threadId: String
    let notificationId: String
    let timestamp: String
    let payload: UserMessageRecordedPayload
}

private struct UserMessageRecordedPayload: Decodable {
    let messageId: String
    let text: String
}

private struct TurnStartedEnvelope: Decodable {
    let threadId: String
    let notificationId: String
    let turnId: String
    let timestamp: String
}

private struct AssistantDeltaEnvelope: Decodable {
    let threadId: String
    let notificationId: String
    let turnId: String
    let itemId: String
    let timestamp: String
    let payload: AssistantDeltaPayload
}

private struct AssistantDeltaPayload: Decodable {
    let text: String
}

private struct ToolStartedEnvelope: Decodable {
    let threadId: String
    let notificationId: String
    let turnId: String
    let itemId: String
    let timestamp: String
    let payload: ToolStartedPayload
}

private struct ToolStartedPayload: Decodable {
    let name: String
    let input: [String: JSONValue]
}

private struct ToolFinishedEnvelope: Decodable {
    let threadId: String
    let notificationId: String
    let turnId: String
    let itemId: String
    let timestamp: String
    let payload: ToolFinishedPayload
}

private struct ToolFinishedPayload: Decodable {
    let name: String
    let status: String
    let output: String
    let durationMs: Int
}

private struct TurnCompletedEnvelope: Decodable {
    let threadId: String
    let notificationId: String
    let turnId: String
    let timestamp: String
    let payload: TurnCompletedPayload
}

private struct TurnCompletedPayload: Decodable {
    let status: String
}

private struct ThreadStatusChangedEnvelope: Decodable {
    let threadId: String
    let notificationId: String
    let timestamp: String
    let payload: ThreadStatusChangedPayload
}

private struct ThreadStatusChangedPayload: Decodable {
    let value: String
}

private struct ThreadListedEnvelope: Decodable {
    let notificationId: String
    let commandId: String?
    let timestamp: String
    let payload: ThreadListedPayload
}

private struct ThreadListedPayload: Decodable {
    let threads: [ThreadListEntryPayload]
}

private struct ThreadListEntryPayload: Decodable {
    let id: String
    let preview: String?
    let createdAt: String
    let updatedAt: String
    let messageCount: Int
    let workspaceId: String?
}

private struct ThreadDeletedEnvelope: Decodable {
    let notificationId: String
    let commandId: String?
    let timestamp: String
    let payload: ThreadDeletedPayload
}

private struct ThreadDeletedPayload: Decodable {
    let targetThreadId: String
    let status: String
}

private struct ThreadErrorEnvelope: Decodable {
    let threadId: String?
    let notificationId: String
    let commandId: String?
    let timestamp: String
    let payload: ThreadErrorPayload
}

private struct ThreadErrorPayload: Decodable {
    let code: String?
    let message: String
}

private struct PermissionRequestedEnvelope: Decodable {
    let requestId: String
    let threadId: String
    let timestamp: String
    let payload: PermissionRequestedPayload
}

private struct PermissionRequestedPayload: Decodable {
    let toolName: String
    let toolCallId: String
    let arguments: [String: JSONValue]
    let timeoutMs: Int?
}

private struct WorkspaceRequestedEnvelope: Decodable {
    let requestId: String
    let threadId: String
    let timestamp: String
    let payload: WorkspaceRequestedPayload
}

private struct WorkspaceRequestedPayload: Decodable {
    let toolCallId: String?
    let prompt: String
    let candidates: [WorkspaceAskCandidate]
    let timeoutMs: Int?
}

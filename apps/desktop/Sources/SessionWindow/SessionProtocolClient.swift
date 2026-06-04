import Foundation

enum SessionProtocolClient {
    enum Error: Swift.Error {
        case unsupportedMessageType(String)
        case invalidJSON
    }

    enum Command: Equatable {
        case sessionCreate(
            commandId: String,
            timestamp: String,
            initialText: String?,
            attachments: [UserMessageAttachmentPayload] = [],
            workspaceId: String?,
            actionBinding: ActionBindingPayload?
        )
        case sessionSubscribe(sessionId: String, commandId: String, timestamp: String)
        case sessionUnsubscribe(sessionId: String, commandId: String, timestamp: String)
        case turnStart(
            sessionId: String,
            commandId: String,
            timestamp: String,
            text: String,
            attachments: [UserMessageAttachmentPayload] = []
        )
        case turnInterrupt(sessionId: String, commandId: String, timestamp: String)
        case sessionsList(commandId: String, timestamp: String)
        case sessionDelete(commandId: String, timestamp: String, targetSessionId: String)
    }

    enum Response: Equatable {
        case permissionAnswer(
            requestId: String,
            timestamp: String,
            decision: PermissionDecision,
            scope: PermissionScope?,
            reason: String?
        )
        case workspaceAnswer(
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
        case session
        case always
    }

    enum InboundMessage: Equatable {
        case event(Event)
        case request(Request)
    }

    enum Event: Equatable {
        case sessionCreated(SessionCreated)
        case sessionSnapshot(SessionSnapshot)
        case userMessageRecorded(UserMessageRecorded)
        case turnStarted(TurnStarted)
        case assistantDelta(AssistantDelta)
        case toolStarted(ToolStarted)
        case toolFinished(ToolFinished)
        case turnCompleted(TurnCompleted)
        case sessionStatusChanged(SessionStatusChanged)
        case sessionsListed(SessionsListed)
        case sessionDeleted(SessionDeleted)
        case sessionError(SessionError)
    }

    enum Request: Equatable {
        case permissionAsk(PermissionAsk)
        case workspaceAsk(WorkspaceAsk)
    }

    enum ToolTerminalStatus: String, Equatable {
        case completed
        case failed
    }

    struct SessionCreated: Equatable {
        let sessionId: String
        let eventId: String
        let commandId: String?
        let timestamp: String
        let title: String?
    }

    struct SessionSnapshot: Equatable {
        let sessionId: String
        let eventId: String
        let commandId: String?
        let timestamp: String
        let messages: [SessionBubble]
        let status: SessionRunStatus
    }

    struct UserMessageRecorded: Equatable {
        let sessionId: String
        let eventId: String
        let timestamp: String
        let messageId: String
        let text: String
    }

    struct TurnStarted: Equatable {
        let sessionId: String
        let eventId: String
        let turnId: String
        let timestamp: String
    }

    struct AssistantDelta: Equatable {
        let sessionId: String
        let eventId: String
        let turnId: String
        let itemId: String
        let timestamp: String
        let text: String
    }

    struct ToolStarted: Equatable {
        let sessionId: String
        let eventId: String
        let turnId: String
        let itemId: String
        let timestamp: String
        let name: String
        let inputJSON: String
    }

    struct ToolFinished: Equatable {
        let sessionId: String
        let eventId: String
        let turnId: String
        let itemId: String
        let timestamp: String
        let name: String
        let status: ToolTerminalStatus
        let output: String
        let durationMs: Int
    }

    struct TurnCompleted: Equatable {
        let sessionId: String
        let eventId: String
        let turnId: String
        let timestamp: String
        let status: SessionRunStatus
    }

    struct SessionStatusChanged: Equatable {
        let sessionId: String
        let eventId: String
        let timestamp: String
        let status: SessionRunStatus
    }

    struct SessionsListed: Equatable {
        let eventId: String
        let commandId: String?
        let timestamp: String
        let sessions: [SessionListItem]
    }

    struct SessionDeleted: Equatable {
        let eventId: String
        let commandId: String?
        let timestamp: String
        let targetSessionId: String
        let status: String
    }

    struct SessionError: Equatable {
        let sessionId: String?
        let eventId: String
        let commandId: String?
        let timestamp: String
        let code: String?
        let message: String
    }

    struct PermissionAsk: Equatable {
        let requestId: String
        let sessionId: String
        let timestamp: String
        let toolName: String
        let toolCallId: String
        let argumentsJSON: String
        let timeoutMs: Int?
    }

    struct WorkspaceAsk: Equatable {
        let requestId: String
        let sessionId: String
        let timestamp: String
        let toolCallId: String?
        let prompt: String
        let candidates: [WorkspaceAskCandidate]
        let timeoutMs: Int?
    }

    static func encode(command: Command) throws -> String {
        let envelope: any Encodable
        switch command {
        case let .sessionCreate(commandId, timestamp, initialText, attachments, workspaceId, actionBinding):
            envelope = SessionCreateCommandEnvelope(
                commandId: commandId,
                timestamp: timestamp,
                payload: SessionCreatePayload(
                    initialText: initialText,
                    attachments: attachments.isEmpty ? nil : attachments,
                    workspaceId: workspaceId,
                    actionBinding: actionBinding
                )
            )
        case let .sessionSubscribe(sessionId, commandId, timestamp):
            envelope = EmptySessionCommandEnvelope(
                type: "session_subscribe",
                sessionId: sessionId,
                commandId: commandId,
                timestamp: timestamp
            )
        case let .sessionUnsubscribe(sessionId, commandId, timestamp):
            envelope = EmptySessionCommandEnvelope(
                type: "session_unsubscribe",
                sessionId: sessionId,
                commandId: commandId,
                timestamp: timestamp
            )
        case let .turnStart(sessionId, commandId, timestamp, text, attachments):
            envelope = TurnStartCommandEnvelope(
                sessionId: sessionId,
                commandId: commandId,
                timestamp: timestamp,
                payload: TurnStartPayload(
                    text: text,
                    attachments: attachments.isEmpty ? nil : attachments
                )
            )
        case let .turnInterrupt(sessionId, commandId, timestamp):
            envelope = EmptySessionCommandEnvelope(
                type: "turn_interrupt",
                sessionId: sessionId,
                commandId: commandId,
                timestamp: timestamp
            )
        case let .sessionsList(commandId, timestamp):
            envelope = EmptyGlobalCommandEnvelope(
                type: "sessions_list",
                commandId: commandId,
                timestamp: timestamp
            )
        case let .sessionDelete(commandId, timestamp, targetSessionId):
            envelope = SessionDeleteCommandEnvelope(
                commandId: commandId,
                timestamp: timestamp,
                payload: SessionDeletePayload(targetSessionId: targetSessionId)
            )
        }

        return try encodeJSON(envelope)
    }

    static func encode(response: Response) throws -> String {
        let envelope: any Encodable
        switch response {
        case let .permissionAnswer(requestId, timestamp, decision, scope, reason):
            envelope = PermissionAnswerEnvelope(
                requestId: requestId,
                timestamp: timestamp,
                payload: PermissionAnswerPayload(
                    decision: decision.rawValue,
                    scope: scope?.rawValue,
                    reason: reason
                )
            )
        case let .workspaceAnswer(requestId, timestamp, workspaceId, cancelled):
            envelope = WorkspaceAnswerEnvelope(
                requestId: requestId,
                timestamp: timestamp,
                payload: WorkspaceAnswerPayload(
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
        case "session_created":
            let body = try decoder.decode(SessionCreatedEnvelope.self, from: data)
            return .event(
                .sessionCreated(
                    SessionCreated(
                        sessionId: body.sessionId,
                        eventId: body.eventId,
                        commandId: body.commandId,
                        timestamp: body.timestamp,
                        title: body.payload.title
                    )
                )
            )
        case "session_snapshot":
            let body = try decoder.decode(SessionSnapshotEnvelope.self, from: data)
            return .event(
                .sessionSnapshot(
                    SessionSnapshot(
                        sessionId: body.sessionId,
                        eventId: body.eventId,
                        commandId: body.commandId,
                        timestamp: body.timestamp,
                        messages: body.payload.messages.map {
                            SessionBubble(id: $0.id, role: $0.role, text: $0.text).normalizedForDisplay()
                        },
                        status: .fromProtocolStatus(body.payload.status)
                    )
                )
            )
        case "user_message_recorded":
            let body = try decoder.decode(UserMessageRecordedEnvelope.self, from: data)
            return .event(
                .userMessageRecorded(
                    UserMessageRecorded(
                        sessionId: body.sessionId,
                        eventId: body.eventId,
                        timestamp: body.timestamp,
                        messageId: body.payload.messageId,
                        text: body.payload.text
                    )
                )
            )
        case "turn_started":
            let body = try decoder.decode(TurnStartedEnvelope.self, from: data)
            return .event(
                .turnStarted(
                    TurnStarted(
                        sessionId: body.sessionId,
                        eventId: body.eventId,
                        turnId: body.turnId,
                        timestamp: body.timestamp
                    )
                )
            )
        case "assistant_delta":
            let body = try decoder.decode(AssistantDeltaEnvelope.self, from: data)
            return .event(
                .assistantDelta(
                    AssistantDelta(
                        sessionId: body.sessionId,
                        eventId: body.eventId,
                        turnId: body.turnId,
                        itemId: body.itemId,
                        timestamp: body.timestamp,
                        text: body.payload.text
                    )
                )
            )
        case "tool_started":
            let body = try decoder.decode(ToolStartedEnvelope.self, from: data)
            return .event(
                .toolStarted(
                    ToolStarted(
                        sessionId: body.sessionId,
                        eventId: body.eventId,
                        turnId: body.turnId,
                        itemId: body.itemId,
                        timestamp: body.timestamp,
                        name: body.payload.name,
                        inputJSON: prettyJSONObject(from: body.payload.input)
                    )
                )
            )
        case "tool_finished":
            let body = try decoder.decode(ToolFinishedEnvelope.self, from: data)
            return .event(
                .toolFinished(
                    ToolFinished(
                        sessionId: body.sessionId,
                        eventId: body.eventId,
                        turnId: body.turnId,
                        itemId: body.itemId,
                        timestamp: body.timestamp,
                        name: body.payload.name,
                        status: ToolTerminalStatus(rawValue: body.payload.status) ?? .failed,
                        output: body.payload.output,
                        durationMs: body.payload.durationMs
                    )
                )
            )
        case "turn_completed":
            let body = try decoder.decode(TurnCompletedEnvelope.self, from: data)
            return .event(
                .turnCompleted(
                    TurnCompleted(
                        sessionId: body.sessionId,
                        eventId: body.eventId,
                        turnId: body.turnId,
                        timestamp: body.timestamp,
                        status: .fromProtocolStatus(body.payload.status)
                    )
                )
            )
        case "session_status_changed":
            let body = try decoder.decode(SessionStatusChangedEnvelope.self, from: data)
            return .event(
                .sessionStatusChanged(
                    SessionStatusChanged(
                        sessionId: body.sessionId,
                        eventId: body.eventId,
                        timestamp: body.timestamp,
                        status: .fromProtocolStatus(body.payload.value)
                    )
                )
            )
        case "sessions_listed":
            let body = try decoder.decode(SessionsListedEnvelope.self, from: data)
            return .event(
                .sessionsListed(
                    SessionsListed(
                        eventId: body.eventId,
                        commandId: body.commandId,
                        timestamp: body.timestamp,
                        sessions: body.payload.sessions.map {
                            SessionListItem(
                                id: $0.id,
                                title: $0.title,
                                updatedAt: $0.updatedAt,
                                messageCount: $0.messageCount,
                                workspaceId: $0.workspaceId
                            )
                        }
                    )
                )
            )
        case "session_deleted":
            let body = try decoder.decode(SessionDeletedEnvelope.self, from: data)
            return .event(
                .sessionDeleted(
                    SessionDeleted(
                        eventId: body.eventId,
                        commandId: body.commandId,
                        timestamp: body.timestamp,
                        targetSessionId: body.payload.targetSessionId,
                        status: body.payload.status
                    )
                )
            )
        case "session_error":
            let body = try decoder.decode(SessionErrorEnvelope.self, from: data)
            return .event(
                .sessionError(
                    SessionError(
                        sessionId: body.sessionId,
                        eventId: body.eventId,
                        commandId: body.commandId,
                        timestamp: body.timestamp,
                        code: body.payload.code,
                        message: body.payload.message
                    )
                )
            )
        case "permission_ask":
            let body = try decoder.decode(PermissionAskEnvelope.self, from: data)
            return .request(
                .permissionAsk(
                    PermissionAsk(
                        requestId: body.requestId,
                        sessionId: body.sessionId,
                        timestamp: body.timestamp,
                        toolName: body.payload.toolName,
                        toolCallId: body.payload.toolCallId,
                        argumentsJSON: prettyJSONObject(from: body.payload.arguments),
                        timeoutMs: body.payload.timeoutMs
                    )
                )
            )
        case "workspace_ask":
            let body = try decoder.decode(WorkspaceAskEnvelope.self, from: data)
            return .request(
                .workspaceAsk(
                    WorkspaceAsk(
                        requestId: body.requestId,
                        sessionId: body.sessionId,
                        timestamp: body.timestamp,
                        toolCallId: body.payload.toolCallId,
                        prompt: body.payload.prompt,
                        candidates: body.payload.candidates,
                        timeoutMs: body.payload.timeoutMs
                    )
                )
            )
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

private struct SessionCreateCommandEnvelope: Encodable {
    let type = "session_create"
    let commandId: String
    let timestamp: String
    let payload: SessionCreatePayload
}

private struct SessionCreatePayload: Encodable {
    let initialText: String?
    let attachments: [UserMessageAttachmentPayload]?
    let workspaceId: String?
    let actionBinding: ActionBindingPayload?
}

private struct EmptySessionCommandEnvelope: Encodable {
    let type: String
    let sessionId: String
    let commandId: String
    let timestamp: String
    let payload = EmptyPayload()
}

private struct EmptyGlobalCommandEnvelope: Encodable {
    let type: String
    let commandId: String
    let timestamp: String
    let payload = EmptyPayload()
}

private struct TurnStartCommandEnvelope: Encodable {
    let type = "turn_start"
    let sessionId: String
    let commandId: String
    let timestamp: String
    let payload: TurnStartPayload
}

private struct TurnStartPayload: Encodable {
    let text: String
    let attachments: [UserMessageAttachmentPayload]?
}

private struct SessionDeleteCommandEnvelope: Encodable {
    let type = "session_delete"
    let commandId: String
    let timestamp: String
    let payload: SessionDeletePayload
}

private struct SessionDeletePayload: Encodable {
    let targetSessionId: String
}

private struct PermissionAnswerEnvelope: Encodable {
    let type = "permission_answer"
    let requestId: String
    let timestamp: String
    let payload: PermissionAnswerPayload
}

private struct PermissionAnswerPayload: Encodable {
    let decision: String
    let scope: String?
    let reason: String?
}

private struct WorkspaceAnswerEnvelope: Encodable {
    let type = "workspace_answer"
    let requestId: String
    let timestamp: String
    let payload: WorkspaceAnswerPayload
}

private struct WorkspaceAnswerPayload: Encodable {
    let workspaceId: String?
    let cancelled: Bool?
}

private struct EmptyPayload: Encodable {}

private struct SessionCreatedEnvelope: Decodable {
    let sessionId: String
    let eventId: String
    let commandId: String?
    let timestamp: String
    let payload: SessionCreatedPayload
}

private struct SessionCreatedPayload: Decodable {
    let title: String?
}

private struct SessionSnapshotEnvelope: Decodable {
    let sessionId: String
    let eventId: String
    let commandId: String?
    let timestamp: String
    let payload: SessionSnapshotPayload
}

private struct SessionSnapshotPayload: Decodable {
    let messages: [ConversationSnapshotMessage]
    let status: String
}

private struct ConversationSnapshotMessage: Decodable {
    let id: String
    let role: String
    let text: String
}

private struct UserMessageRecordedEnvelope: Decodable {
    let sessionId: String
    let eventId: String
    let timestamp: String
    let payload: UserMessageRecordedPayload
}

private struct UserMessageRecordedPayload: Decodable {
    let messageId: String
    let text: String
}

private struct TurnStartedEnvelope: Decodable {
    let sessionId: String
    let eventId: String
    let turnId: String
    let timestamp: String
}

private struct AssistantDeltaEnvelope: Decodable {
    let sessionId: String
    let eventId: String
    let turnId: String
    let itemId: String
    let timestamp: String
    let payload: AssistantDeltaPayload
}

private struct AssistantDeltaPayload: Decodable {
    let text: String
}

private struct ToolStartedEnvelope: Decodable {
    let sessionId: String
    let eventId: String
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
    let sessionId: String
    let eventId: String
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
    let sessionId: String
    let eventId: String
    let turnId: String
    let timestamp: String
    let payload: TurnCompletedPayload
}

private struct TurnCompletedPayload: Decodable {
    let status: String
}

private struct SessionStatusChangedEnvelope: Decodable {
    let sessionId: String
    let eventId: String
    let timestamp: String
    let payload: SessionStatusChangedPayload
}

private struct SessionStatusChangedPayload: Decodable {
    let value: String
}

private struct SessionsListedEnvelope: Decodable {
    let eventId: String
    let commandId: String?
    let timestamp: String
    let payload: SessionsListedPayload
}

private struct SessionsListedPayload: Decodable {
    let sessions: [SessionListEntryPayload]
}

private struct SessionListEntryPayload: Decodable {
    let id: String
    let title: String?
    let createdAt: String
    let updatedAt: String
    let messageCount: Int
    let workspaceId: String?
}

private struct SessionDeletedEnvelope: Decodable {
    let eventId: String
    let commandId: String?
    let timestamp: String
    let payload: SessionDeletedPayload
}

private struct SessionDeletedPayload: Decodable {
    let targetSessionId: String
    let status: String
}

private struct SessionErrorEnvelope: Decodable {
    let sessionId: String?
    let eventId: String
    let commandId: String?
    let timestamp: String
    let payload: SessionErrorPayload
}

private struct SessionErrorPayload: Decodable {
    let code: String?
    let message: String
}

private struct PermissionAskEnvelope: Decodable {
    let requestId: String
    let sessionId: String
    let timestamp: String
    let payload: PermissionAskPayload
}

private struct PermissionAskPayload: Decodable {
    let toolName: String
    let toolCallId: String
    let arguments: [String: JSONValue]
    let timeoutMs: Int?
}

private struct WorkspaceAskEnvelope: Decodable {
    let requestId: String
    let sessionId: String
    let timestamp: String
    let payload: WorkspaceAskPayload
}

private struct WorkspaceAskPayload: Decodable {
    let toolCallId: String?
    let prompt: String
    let candidates: [WorkspaceAskCandidate]
    let timeoutMs: Int?
}

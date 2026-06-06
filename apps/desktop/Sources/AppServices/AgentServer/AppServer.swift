import Foundation

@MainActor
protocol AppServerManaging: AnyObject {
    var threadConnectionState: AppServerConnectionState { get }
    var isAvailable: Bool { get }
    var startupErrorMessage: String? { get }
    var onAvailabilityChange: ((Bool) -> Void)? { get set }
    var onFatalError: ((String) -> Void)? { get set }
    var onThreadConnectionStateChange: ((AppServerConnectionState) -> Void)? { get set }
    var onThreadEvent: ((AppServerThreadEvent) -> Void)? { get set }

    func start()
    func stop()
    func connectThreadClient()
    func disconnectThreadClient()
    func startThread(commandId: String, timestamp: String, workspaceId: String?, actionBinding: ActionBindingPayload?)
    func resumeThread(threadId: String, commandId: String, timestamp: String)
    func listThreads(commandId: String, timestamp: String)
    func deleteThread(commandId: String, timestamp: String, targetThreadId: String)
    func startTurn(
        threadId: String,
        commandId: String,
        timestamp: String,
        text: String,
        attachments: [UserMessageAttachmentPayload]
    )
    func interruptTurn(threadId: String, commandId: String, timestamp: String)
    func answerPermission(
        requestId: String,
        timestamp: String,
        decision: AppServerPermissionDecision,
        scope: AppServerPermissionScope?,
        reason: String?
    )
    func answerWorkspace(requestId: String, timestamp: String, workspaceId: String?, cancelled: Bool?)
}

enum AppServerThreadEvent: Equatable {
    case global(ThreadEvent)
    case thread(threadId: String, ThreadEvent)
}

enum AppServerPermissionDecision: String, Equatable {
    case allow
    case deny
}

enum AppServerPermissionScope: String, Equatable {
    case once
    case thread
    case always
}

@MainActor
final class AppServer: AppServerManaging {
    private let agentServer: any AgentServerStarting
    private let client: AppServerClient
    private(set) var startupErrorMessage: String?

    var threadConnectionState: AppServerConnectionState {
        client.connectionState
    }

    var isAvailable: Bool {
        agentServer.isAvailable && startupErrorMessage == nil
    }

    var onAvailabilityChange: ((Bool) -> Void)? {
        didSet { agentServer.onAvailabilityChange = onAvailabilityChange }
    }

    var onFatalError: ((String) -> Void)? {
        didSet { agentServer.onFatalError = onFatalError }
    }

    var onThreadConnectionStateChange: ((AppServerConnectionState) -> Void)? {
        didSet { client.onStateChange = onThreadConnectionStateChange }
    }

    var onThreadEvent: ((AppServerThreadEvent) -> Void)?

    init(
        agentServer: any AgentServerStarting,
        client: AppServerClient
    ) {
        self.agentServer = agentServer
        self.client = client
        self.client.onInboundMessage = { [weak self] inbound in
            self?.handleInboundMessage(inbound)
        }
    }

    func start() {
        do {
            try agentServer.start()
            startupErrorMessage = nil
        } catch {
            startupErrorMessage = agentServer.lastStartupError ?? error.localizedDescription
            onAvailabilityChange?(false)
            return
        }
    }

    func stop() {
        client.disconnect()
        agentServer.stop()
    }

    func connectThreadClient() {
        client.connect()
    }

    func disconnectThreadClient() {
        client.disconnect()
    }

    func startThread(commandId: String, timestamp: String, workspaceId: String?, actionBinding: ActionBindingPayload?) {
        client.send(command: .threadStart(
            commandId: commandId,
            timestamp: timestamp,
            workspaceId: workspaceId,
            actionBinding: actionBinding
        ))
    }

    func resumeThread(threadId: String, commandId: String, timestamp: String) {
        client.send(command: .threadResume(threadId: threadId, commandId: commandId, timestamp: timestamp))
    }

    func listThreads(commandId: String, timestamp: String) {
        client.send(command: .threadList(commandId: commandId, timestamp: timestamp))
    }

    func deleteThread(commandId: String, timestamp: String, targetThreadId: String) {
        client.send(command: .threadDelete(
            commandId: commandId,
            timestamp: timestamp,
            targetThreadId: targetThreadId
        ))
    }

    func startTurn(
        threadId: String,
        commandId: String,
        timestamp: String,
        text: String,
        attachments: [UserMessageAttachmentPayload]
    ) {
        client.send(command: .turnStart(
            threadId: threadId,
            commandId: commandId,
            timestamp: timestamp,
            text: text,
            attachments: attachments
        ))
    }

    func interruptTurn(threadId: String, commandId: String, timestamp: String) {
        client.send(command: .turnInterrupt(threadId: threadId, commandId: commandId, timestamp: timestamp))
    }

    func answerPermission(
        requestId: String,
        timestamp: String,
        decision: AppServerPermissionDecision,
        scope: AppServerPermissionScope?,
        reason: String?
    ) {
        client.send(response: .permissionAnswered(
            requestId: requestId,
            timestamp: timestamp,
            decision: ThreadProtocolClient.PermissionDecision(rawValue: decision.rawValue) ?? .deny,
            scope: scope.flatMap { ThreadProtocolClient.PermissionScope(rawValue: $0.rawValue) },
            reason: reason
        ))
    }

    func answerWorkspace(requestId: String, timestamp: String, workspaceId: String?, cancelled: Bool?) {
        client.send(response: .workspaceAnswered(
            requestId: requestId,
            timestamp: timestamp,
            workspaceId: workspaceId,
            cancelled: cancelled
        ))
    }

    private func handleInboundMessage(_ inbound: ThreadProtocolClient.InboundMessage) {
        switch inbound {
        case .notification(let event):
            onThreadEvent?(routeProtocolEvent(event))
        case .request(let request):
            onThreadEvent?(routeProtocolRequest(request))
        }
    }
}

@MainActor
final class AppServerClient {
    var onStateChange: ((AppServerConnectionState) -> Void)?
    var onInboundMessage: ((ThreadProtocolClient.InboundMessage) -> Void)?

    private let connection: AppServerConnection
    private let platformBridge: PlatformBridgeService?

    var connectionState: AppServerConnectionState {
        connection.connectionState
    }

    init(
        connection: AppServerConnection,
        platformBridge: PlatformBridgeService? = nil
    ) {
        self.connection = connection
        self.platformBridge = platformBridge
        connection.onStateChange = { [weak self] state in
            Task { @MainActor in
                guard let self else { return }
                if state == .connected {
                    self.sendPlatformHello()
                }
                self.onStateChange?(state)
            }
        }
        connection.onTextMessage = { [weak self] text in
            Task { @MainActor in
                await self?.routeIncoming(text)
            }
        }
    }

    func connect() {
        connection.connect()
    }

    func disconnect() {
        connection.disconnect()
    }

    func send(command: ThreadProtocolClient.Command) {
        guard let text = try? ThreadProtocolClient.encode(command: command) else { return }
        connection.send(text: text)
    }

    func send(response: ThreadProtocolClient.Response) {
        guard let text = try? ThreadProtocolClient.encode(response: response) else { return }
        connection.send(text: text)
    }

    private func routeIncoming(_ text: String) async {
        if isPlatformRequest(text) {
            await platformBridge?.handleIncoming(raw: text) { [weak self] response in
                self?.connection.send(text: response)
            }
            return
        }

        guard let inbound = try? ThreadProtocolClient.decodeInboundMessage(from: text) else { return }
        onInboundMessage?(inbound)
    }

    private func sendPlatformHello() {
        guard let platformBridge else { return }
        connection.send(text: platformBridge.makeHelloMessage())
    }

    private func isPlatformRequest(_ text: String) -> Bool {
        guard let data = text.data(using: .utf8),
              let envelope = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return false
        }
        return envelope["channel"] as? String == "platform"
            && envelope["type"] as? String == "platform_request"
    }
}

@MainActor
private func routeProtocolEvent(_ event: ThreadProtocolClient.Notification) -> AppServerThreadEvent {
    let translated = translateProtocolEvent(event)
    switch event {
    case .threadStarted, .threadListed, .threadDeleted:
        return .global(translated)
    case .threadSnapshot(let value):
        return .thread(threadId: value.threadId, translated)
    case .userMessageRecorded(let value):
        return .thread(threadId: value.threadId, translated)
    case .turnStarted(let value):
        return .thread(threadId: value.threadId, translated)
    case .assistantDelta(let value):
        return .thread(threadId: value.threadId, translated)
    case .toolStarted(let value):
        return .thread(threadId: value.threadId, translated)
    case .toolFinished(let value):
        return .thread(threadId: value.threadId, translated)
    case .turnCompleted(let value):
        return .thread(threadId: value.threadId, translated)
    case .threadStatusChanged(let value):
        return .thread(threadId: value.threadId, translated)
    case .threadError(let value):
        if let threadId = value.threadId {
            return .thread(threadId: threadId, translated)
        }
        return .global(translated)
    }
}

@MainActor
private func routeProtocolRequest(_ request: ThreadProtocolClient.Request) -> AppServerThreadEvent {
    switch request {
    case .permissionRequested(let value):
        return .thread(
            threadId: value.threadId,
            .permissionRequest(
                requestId: value.requestId,
                toolName: value.toolName,
                toolCallId: value.toolCallId,
                argumentsJSON: value.argumentsJSON
            )
        )
    case .workspaceRequested(let value):
        return .thread(
            threadId: value.threadId,
            .workspaceAskRequest(
                requestId: value.requestId,
                prompt: value.prompt,
                candidates: value.candidates
            )
        )
    }
}

@MainActor
private func translateProtocolEvent(_ event: ThreadProtocolClient.Notification) -> ThreadEvent {
    switch event {
    case .threadStarted(let value):
        return .threadStarted(
            threadID: value.threadId,
            title: value.preview,
            responseMessageID: value.commandId ?? ""
        )
    case .threadSnapshot(let value):
        return .threadSnapshot(
            messages: value.messages,
            status: value.status.rawValue
        )
    case .userMessageRecorded(let value):
        return .userMessage(
            messageID: value.messageId,
            text: value.text,
            timestamp: value.timestamp
        )
    case .turnStarted(let value):
        return .turnStarted(turnID: value.turnId)
    case .assistantDelta(let value):
        return .assistantMessageDelta(
            messageID: value.itemId,
            text: value.text,
            timestamp: value.timestamp
        )
    case .toolStarted(let value):
        return .toolMessage(
            messageID: value.itemId,
            name: value.name,
            text: value.inputJSON,
            status: "running",
            timestamp: value.timestamp
        )
    case .toolFinished(let value):
        return .toolMessage(
            messageID: value.itemId,
            name: value.name,
            text: value.output,
            status: value.status.rawValue,
            timestamp: value.timestamp
        )
    case .turnCompleted(let value):
        return .turnCompleted(turnID: value.turnId, status: value.status.rawValue)
    case .threadStatusChanged(let value):
        return .status(value: value.status.rawValue)
    case .threadListed(let value):
        return .threadList(threads: value.threads)
    case .threadDeleted(let value):
        return .threadDeleted(
            targetThreadID: value.targetThreadId,
            status: value.status
        )
    case .threadError(let value):
        if value.threadId == nil, let commandId = value.commandId {
            return .threadStartFailed(
                reason: value.code ?? "invalid_request",
                message: value.message,
                responseMessageID: commandId
            )
        }
        if value.code == "not_found" {
            return .threadOpenFailed(
                reason: value.code ?? "not_found",
                message: value.message
            )
        }
        return .error(
            messageID: value.notificationId,
            message: value.message,
            timestamp: value.timestamp
        )
    }
}

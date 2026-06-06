import Foundation

@MainActor
protocol AppServerManaging: AnyObject {
    var threadConnectionState: AppServerConnectionState { get }
    var isAvailable: Bool { get }
    var startupErrorMessage: String? { get }
    var onAvailabilityChange: ((Bool) -> Void)? { get set }
    var onFatalError: ((String) -> Void)? { get set }
    var onThreadConnectionStateChange: ((AppServerConnectionState) -> Void)? { get set }
    var onInboundMessage: ((ThreadProtocolClient.InboundMessage) -> Void)? { get set }

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
        decision: ThreadProtocolClient.PermissionDecision,
        scope: ThreadProtocolClient.PermissionScope?,
        reason: String?
    )
    func answerWorkspace(requestId: String, timestamp: String, workspaceId: String?, cancelled: Bool?)
}

@MainActor
extension AppServerManaging {
    func startThread(commandId: String, timestamp: String, workspaceId: String?, actionBinding: ActionBindingPayload?) {}
    func resumeThread(threadId: String, commandId: String, timestamp: String) {}
    func listThreads(commandId: String, timestamp: String) {}
    func deleteThread(commandId: String, timestamp: String, targetThreadId: String) {}
    func startTurn(
        threadId: String,
        commandId: String,
        timestamp: String,
        text: String,
        attachments: [UserMessageAttachmentPayload]
    ) {}
    func interruptTurn(threadId: String, commandId: String, timestamp: String) {}
    func answerPermission(
        requestId: String,
        timestamp: String,
        decision: ThreadProtocolClient.PermissionDecision,
        scope: ThreadProtocolClient.PermissionScope?,
        reason: String?
    ) {}
    func answerWorkspace(requestId: String, timestamp: String, workspaceId: String?, cancelled: Bool?) {}
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

    var onInboundMessage: ((ThreadProtocolClient.InboundMessage) -> Void)? {
        didSet { client.onInboundMessage = onInboundMessage }
    }

    init(
        agentServer: any AgentServerStarting,
        client: AppServerClient
    ) {
        self.agentServer = agentServer
        self.client = client
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
        decision: ThreadProtocolClient.PermissionDecision,
        scope: ThreadProtocolClient.PermissionScope?,
        reason: String?
    ) {
        client.send(response: .permissionAnswered(
            requestId: requestId,
            timestamp: timestamp,
            decision: decision,
            scope: scope,
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

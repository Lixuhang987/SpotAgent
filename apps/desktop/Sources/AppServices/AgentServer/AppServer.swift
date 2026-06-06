import Foundation

@MainActor
protocol AppServerManaging: AnyObject {
    var isAvailable: Bool { get }
    var startupErrorMessage: String? { get }
    var onAvailabilityChange: ((Bool) -> Void)? { get set }
    var onFatalError: ((String) -> Void)? { get set }

    func start()
    func stop()
}

@MainActor
extension AppServerManaging {
    var threadConnectionState: AppServerConnectionState { .disconnected }
    var onThreadConnectionStateChange: ((AppServerConnectionState) -> Void)? {
        get { nil }
        set {}
    }
    var onThreadEvent: ((AppServerThreadEvent) -> Void)? {
        get { nil }
        set {}
    }

    func connectThreadClient() {}
    func disconnectThreadClient() {}
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
        decision: AppServerPermissionDecision,
        scope: AppServerPermissionScope?,
        reason: String?
    ) {}
    func answerWorkspace(requestId: String, timestamp: String, workspaceId: String?, cancelled: Bool?) {}
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
    private let platformClient: PlatformBridgeConnectionClient?
    private(set) var startupErrorMessage: String?

    var isAvailable: Bool {
        agentServer.isAvailable && startupErrorMessage == nil
    }

    var onAvailabilityChange: ((Bool) -> Void)? {
        didSet { agentServer.onAvailabilityChange = onAvailabilityChange }
    }

    var onFatalError: ((String) -> Void)? {
        didSet { agentServer.onFatalError = onFatalError }
    }

    init(
        agentServer: any AgentServerStarting,
        platformClient: PlatformBridgeConnectionClient? = nil
    ) {
        self.agentServer = agentServer
        self.platformClient = platformClient
    }

    func start() {
        do {
            try agentServer.start()
            startupErrorMessage = nil
            platformClient?.connect()
        } catch {
            startupErrorMessage = agentServer.lastStartupError ?? error.localizedDescription
            onAvailabilityChange?(false)
        }
    }

    func stop() {
        platformClient?.disconnect()
        agentServer.stop()
    }
}

@MainActor
final class PlatformBridgeConnectionClient {
    private let connection: AppServerConnection
    private let platformBridge: PlatformBridgeService

    init(connection: AppServerConnection, platformBridge: PlatformBridgeService) {
        self.connection = connection
        self.platformBridge = platformBridge
        connection.onStateChange = { [weak self] state in
            Task { @MainActor in
                guard state == .connected, let self else { return }
                self.connection.send(text: self.platformBridge.makeHelloMessage())
            }
        }
        connection.onTextMessage = { [weak self] text in
            Task { @MainActor in
                await self?.platformBridge.handleIncoming(raw: text) { [weak self] response in
                    self?.connection.send(text: response)
                }
            }
        }
    }

    func connect() {
        connection.connect()
    }

    func disconnect() {
        connection.disconnect()
    }
}

@MainActor
final class ThreadEventBus<Message> {
    final class Subscription {
        private var cancelHandler: (() -> Void)?

        fileprivate init(cancelHandler: @escaping () -> Void) {
            self.cancelHandler = cancelHandler
        }

        func cancel() {
            cancelHandler?()
            cancelHandler = nil
        }

        deinit {
            cancel()
        }
    }

    typealias Handler = (Message) -> Void

    private var threadSubscribers: [String: [UUID: Handler]] = [:]
    private var globalSubscribers: [UUID: Handler] = [:]

    @discardableResult
    func subscribe(threadID: String, handler: @escaping Handler) -> Subscription {
        let id = UUID()
        threadSubscribers[threadID, default: [:]][id] = handler
        return Subscription { [weak self] in
            self?.unsubscribe(threadID: threadID, id: id)
        }
    }

    @discardableResult
    func subscribeGlobal(handler: @escaping Handler) -> Subscription {
        let id = UUID()
        globalSubscribers[id] = handler
        return Subscription { [weak self] in
            self?.unsubscribeGlobal(id: id)
        }
    }

    func publish(_ message: Message, to threadID: String) {
        guard let handlers = threadSubscribers[threadID]?.values else { return }
        for handler in handlers {
            handler(message)
        }
    }

    func publishGlobal(_ message: Message) {
        for handler in globalSubscribers.values {
            handler(message)
        }
    }

    private func unsubscribe(threadID: String, id: UUID) {
        guard var handlers = threadSubscribers[threadID] else { return }
        handlers.removeValue(forKey: id)
        if handlers.isEmpty {
            threadSubscribers.removeValue(forKey: threadID)
        } else {
            threadSubscribers[threadID] = handlers
        }
    }

    private func unsubscribeGlobal(id: UUID) {
        globalSubscribers.removeValue(forKey: id)
    }
}

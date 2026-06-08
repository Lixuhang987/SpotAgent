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
final class AppServer: AppServerManaging {
    private let agentServer: any AgentServerStarting
    private let platformClient: PlatformBridgeConnectionClient?
    private let activityClient: AgentActivityConnectionClient?
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
        platformClient: PlatformBridgeConnectionClient? = nil,
        activityClient: AgentActivityConnectionClient? = nil
    ) {
        self.agentServer = agentServer
        self.platformClient = platformClient
        self.activityClient = activityClient
    }

    func start() {
        do {
            try agentServer.start()
            startupErrorMessage = nil
            platformClient?.connect()
            activityClient?.connect()
        } catch {
            startupErrorMessage = agentServer.lastStartupError ?? error.localizedDescription
            onAvailabilityChange?(false)
        }
    }

    func stop() {
        activityClient?.disconnect()
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

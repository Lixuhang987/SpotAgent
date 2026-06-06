import Foundation

@MainActor
protocol AppServerManaging: AnyObject {
    var threadConnectionState: AppServerConnectionState { get }
    var isAvailable: Bool { get }
    var startupErrorMessage: String? { get }
    var onAvailabilityChange: ((Bool) -> Void)? { get set }
    var onFatalError: ((String) -> Void)? { get set }
    var onThreadConnectionStateChange: ((AppServerConnectionState) -> Void)? { get set }
    var onThreadMessage: ((String) -> Void)? { get set }

    func start()
    func stop()
    func connectThreadClient()
    func disconnectThreadClient()
    func sendThreadMessage(_ text: String)
}

@MainActor
final class AppServer: AppServerManaging {
    private let agentServer: any AgentServerStarting
    private let client: AppServerClient
    private let platformBridge: (any PlatformBridgeRunning)?
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

    var onThreadMessage: ((String) -> Void)? {
        didSet { client.onTextMessage = onThreadMessage }
    }

    init(
        agentServer: any AgentServerStarting,
        client: AppServerClient,
        platformBridge: (any PlatformBridgeRunning)?
    ) {
        self.agentServer = agentServer
        self.client = client
        self.platformBridge = platformBridge
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
        platformBridge?.start()
    }

    func stop() {
        client.disconnect()
        platformBridge?.stop()
        agentServer.stop()
    }

    func connectThreadClient() {
        client.connect()
    }

    func disconnectThreadClient() {
        client.disconnect()
    }

    func sendThreadMessage(_ text: String) {
        client.send(text: text)
    }
}

@MainActor
final class AppServerClient {
    var onStateChange: ((AppServerConnectionState) -> Void)?
    var onTextMessage: ((String) -> Void)?

    private let connection: AppServerConnection

    var connectionState: AppServerConnectionState {
        connection.connectionState
    }

    init(connection: AppServerConnection) {
        self.connection = connection
        connection.onStateChange = { [weak self] state in
            Task { @MainActor in self?.onStateChange?(state) }
        }
        connection.onTextMessage = { [weak self] text in
            Task { @MainActor in self?.onTextMessage?(text) }
        }
    }

    func connect() {
        connection.connect()
    }

    func disconnect() {
        connection.disconnect()
    }

    func send(text: String) {
        connection.send(text: text)
    }
}

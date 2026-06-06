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

    func sendThreadMessage(_ text: String) {
        client.send(text: text)
    }
}

@MainActor
final class AppServerClient {
    var onStateChange: ((AppServerConnectionState) -> Void)?
    var onTextMessage: ((String) -> Void)?

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

    func send(text: String) {
        connection.send(text: text)
    }

    private func routeIncoming(_ text: String) async {
        if isPlatformRequest(text) {
            await platformBridge?.handleIncoming(raw: text) { [weak self] response in
                self?.connection.send(text: response)
            }
            return
        }

        onTextMessage?(text)
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

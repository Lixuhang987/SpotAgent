import Foundation

@MainActor
final class ElectronBackedAppServer: AppServerManaging {
    private let shell: any ElectronShellProcessing
    private let platformClient: PlatformBridgeConnectionClient?
    private var hasAgentServerHealth = false
    private var hasPreparedThreadWindow = false
    private var lastPublishedAvailability = false
    private var isRunning = false
    private(set) var startupErrorMessage: String?

    var onAvailabilityChange: ((Bool) -> Void)?
    var onFatalError: ((String) -> Void)?

    var isAvailable: Bool {
        hasAgentServerHealth && hasPreparedThreadWindow && startupErrorMessage == nil
    }

    init(
        shell: any ElectronShellProcessing,
        platformClient: PlatformBridgeConnectionClient?
    ) {
        self.shell = shell
        self.platformClient = platformClient
    }

    func start() {
        resetGate()
        isRunning = true
        shell.onEvent = { [weak self] event in
            self?.handle(event)
        }
        shell.onTermination = { [weak self] message in
            self?.handleTermination(message)
        }

        do {
            try shell.start()
        } catch {
            isRunning = false
            shell.onEvent = nil
            shell.onTermination = nil
            startupErrorMessage = error.localizedDescription
            publishAvailability(force: true)
        }
    }

    func stop() {
        try? shell.send(.shutdown(commandId: UUID().uuidString))
        isRunning = false
        shell.onEvent = nil
        shell.onTermination = nil
        platformClient?.disconnect()
        shell.stop()
        hasAgentServerHealth = false
        hasPreparedThreadWindow = false
        startupErrorMessage = nil
        publishAvailability(force: lastPublishedAvailability)
    }

    private func handle(_ event: ElectronShellEvent) {
        guard isRunning else { return }

        switch event {
        case .agentServerHealth(let available, let message):
            hasAgentServerHealth = available
            if available {
                startupErrorMessage = nil
                platformClient?.connect()
                publishAvailability()
            } else {
                startupErrorMessage = message ?? "Electron agent-server 不可用"
                platformClient?.disconnect()
                publishAvailability(force: true)
            }

        case .threadWindowPrepared:
            hasPreparedThreadWindow = true
            startupErrorMessage = nil
            publishAvailability()

        case .threadWindowPrepareFailed(let message):
            hasPreparedThreadWindow = false
            startupErrorMessage = message
            publishAvailability(force: true)

        case .threadWindowClosed:
            hasPreparedThreadWindow = false
            publishAvailability()

        case .rendererCrashed(_, let reason):
            startupErrorMessage = reason
            hasAgentServerHealth = false
            platformClient?.disconnect()
            onFatalError?(reason)
            publishAvailability(force: true)

        case .electronReady, .commandAck:
            break
        }
    }

    private func handleTermination(_ message: String) {
        guard isRunning else { return }

        startupErrorMessage = message
        hasAgentServerHealth = false
        hasPreparedThreadWindow = false
        platformClient?.disconnect()
        onFatalError?(message)
        publishAvailability(force: true)
    }

    private func resetGate() {
        hasAgentServerHealth = false
        hasPreparedThreadWindow = false
        startupErrorMessage = nil
        lastPublishedAvailability = false
        isRunning = false
    }

    private func publishAvailability(force: Bool = false) {
        let available = isAvailable
        guard force || available != lastPublishedAvailability else { return }
        lastPublishedAvailability = available
        onAvailabilityChange?(available)
    }
}

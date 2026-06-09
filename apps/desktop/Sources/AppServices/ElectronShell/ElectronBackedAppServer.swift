import Foundation

@MainActor
final class ElectronBackedAppServer: AppServerManaging, ThreadWindowCommanding, ActivityWindowCommanding {
    private let shell: any ElectronShellProcessing
    private let platformClient: PlatformBridgeConnectionClient?
    private var hasAgentServerHealth = false
    private var hasPreparedThreadWindow = false
    private var lastPublishedAvailability = false
    private var isRunning = false
    private var agentServerErrorMessage: String?
    private var threadWindowErrorMessage: String?
    private var pendingCommandKinds: [String: ThreadWindowCommandKind] = [:]
    private var pendingActivityCommandKinds: [String: ActivityWindowCommandKind] = [:]

    var startupErrorMessage: String? {
        agentServerErrorMessage ?? threadWindowErrorMessage
    }

    var onAvailabilityChange: ((Bool) -> Void)?
    var onFatalError: ((String) -> Void)?
    var onThreadWindowClosed: (() -> Void)?
    var onCommandResult: ((ThreadWindowCommandResult) -> Void)?
    var onActivityWindowCommandResult: ((ActivityWindowCommandResult) -> Void)?

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
            agentServerErrorMessage = error.localizedDescription
            publishAvailability(force: true)
        }
    }

    func stop() {
        try? shell.send(.shutdown(commandId: UUID().uuidString))
        isRunning = false
        shell.onEvent = nil
        shell.onTermination = nil
        onThreadWindowClosed = nil
        onCommandResult = nil
        onActivityWindowCommandResult = nil
        pendingCommandKinds.removeAll()
        pendingActivityCommandKinds.removeAll()
        platformClient?.disconnect()
        shell.stop()
        hasAgentServerHealth = false
        hasPreparedThreadWindow = false
        agentServerErrorMessage = nil
        threadWindowErrorMessage = nil
        publishAvailability(force: lastPublishedAvailability)
    }

    @discardableResult
    func openInitialPrompt(_ prompt: PromptSubmission) throws -> String {
        try sendThreadWindowCommand(.openInitialPrompt) {
            .openInitialPrompt(
                commandId: $0,
                payload: ElectronInitialPromptPayload(prompt: prompt)
            )
        }
    }

    @discardableResult
    func openHistory() throws -> String {
        try sendThreadWindowCommand(.openHistory) { .openHistory(commandId: $0) }
    }

    @discardableResult
    func focus(threadId: String?) throws -> String {
        try sendThreadWindowCommand(.focus) { .focus(commandId: $0, threadId: threadId) }
    }

    @discardableResult
    func sendThemeChanged(_ theme: HostThemePayload) throws -> String {
        let commandId = UUID().uuidString
        try shell.send(.themeChanged(commandId: commandId, theme: theme))
        return commandId
    }

    @discardableResult
    func showActivityWindow() throws -> String {
        let commandId = UUID().uuidString
        pendingActivityCommandKinds[commandId] = .show
        do {
            try shell.send(.showActivityWindow(commandId: commandId))
            return commandId
        } catch {
            pendingActivityCommandKinds.removeValue(forKey: commandId)
            throw error
        }
    }

    private func handle(_ event: ElectronShellEvent) {
        guard isRunning else { return }

        switch event {
        case .agentServerHealth(let available, let message):
            hasAgentServerHealth = available
            if available {
                agentServerErrorMessage = nil
                platformClient?.connect()
                publishAvailability()
            } else {
                agentServerErrorMessage = message ?? "Electron agent-server 不可用"
                platformClient?.disconnect()
                publishAvailability(force: true)
            }

        case .threadWindowPrepared:
            hasPreparedThreadWindow = true
            threadWindowErrorMessage = nil
            publishAvailability()

        case .threadWindowPrepareFailed(let message):
            hasPreparedThreadWindow = false
            threadWindowErrorMessage = message
            publishAvailability(force: true)

        case .threadWindowClosed(_, let wasVisible):
            hasPreparedThreadWindow = false
            threadWindowErrorMessage = "Electron ThreadWindow 已关闭，正在重新预热…"
            if wasVisible {
                onThreadWindowClosed?()
            }
            publishAvailability(force: true)

        case .rendererCrashed(.activity, _):
            break

        case .rendererCrashed(.thread, let reason):
            threadWindowErrorMessage = reason
            hasAgentServerHealth = false
            platformClient?.disconnect()
            onFatalError?(reason)
            publishAvailability(force: true)

        case .commandAck(let commandId, let ok, let error):
            handleCommandAck(commandId: commandId, ok: ok, error: error)

        case .electronReady:
            break
        }
    }

    private func handleTermination(_ message: String) {
        guard isRunning else { return }

        agentServerErrorMessage = message
        hasAgentServerHealth = false
        hasPreparedThreadWindow = false
        platformClient?.disconnect()
        pendingCommandKinds.removeAll()
        pendingActivityCommandKinds.removeAll()
        onFatalError?(message)
        publishAvailability(force: true)
    }

    private func resetGate() {
        hasAgentServerHealth = false
        hasPreparedThreadWindow = false
        agentServerErrorMessage = nil
        threadWindowErrorMessage = nil
        lastPublishedAvailability = false
        isRunning = false
        pendingCommandKinds.removeAll()
        pendingActivityCommandKinds.removeAll()
    }

    private func publishAvailability(force: Bool = false) {
        let available = isAvailable
        guard force || available != lastPublishedAvailability else { return }
        lastPublishedAvailability = available
        onAvailabilityChange?(available)
    }

    @discardableResult
    private func sendThreadWindowCommand(
        _ kind: ThreadWindowCommandKind,
        build: (String) -> ElectronShellCommand
    ) throws -> String {
        let commandId = UUID().uuidString
        pendingCommandKinds[commandId] = kind
        do {
            try shell.send(build(commandId))
            return commandId
        } catch {
            pendingCommandKinds.removeValue(forKey: commandId)
            throw error
        }
    }

    private func handleCommandAck(commandId: String, ok: Bool, error: String?) {
        if let kind = pendingCommandKinds.removeValue(forKey: commandId) {
            onCommandResult?(
                ThreadWindowCommandResult(
                    commandId: commandId,
                    kind: kind,
                    ok: ok,
                    error: error
                )
            )
            return
        }

        guard let kind = pendingActivityCommandKinds.removeValue(forKey: commandId) else {
            return
        }
        onActivityWindowCommandResult?(
            ActivityWindowCommandResult(
                commandId: commandId,
                kind: kind,
                ok: ok,
                error: error
            )
        )
    }
}

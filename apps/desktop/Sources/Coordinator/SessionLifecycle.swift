import AppKit
import Foundation

@Observable
@MainActor
final class SessionLifecycle {
    private(set) var viewModels: [String: SessionViewModel] = [:]

    @ObservationIgnored private let registry: SessionRegistry
    @ObservationIgnored private let windowPresenter: any SessionWindowPresenting
    @ObservationIgnored private let agentServerURL: URL
    @ObservationIgnored private let activationPolicy: AppActivationPolicyCoordinator
    @ObservationIgnored private let setActivationPolicy: @MainActor (NSApplication.ActivationPolicy) -> Void
    @ObservationIgnored private var windows: [String: NSWindow] = [:]

    init(
        registry: SessionRegistry,
        windowPresenter: any SessionWindowPresenting,
        agentServerURL: URL,
        activationPolicy: AppActivationPolicyCoordinator,
        setActivationPolicy: @escaping @MainActor (NSApplication.ActivationPolicy) -> Void
    ) {
        self.registry = registry
        self.windowPresenter = windowPresenter
        self.agentServerURL = agentServerURL
        self.activationPolicy = activationPolicy
        self.setActivationPolicy = setActivationPolicy
        // "0 个会话窗口"语义：把现有 bootstrap 里的初始策略调用下沉到这里。
        setActivationPolicy(activationPolicy.policyAfterUpdatingOpenSessionWindows(by: 0))
    }

    @discardableResult
    func open(
        prompt: PromptSubmission,
        startupError: String?,
        onSessionClosed: @escaping @MainActor (String) -> Void
    ) -> String {
        let sessionID = UUID().uuidString
        let viewModel = makeViewModel(sessionID: sessionID)

        present(
            sessionID: sessionID,
            viewModel: viewModel,
            summary: prompt.summary,
            onSessionClosed: onSessionClosed
        )

        viewModel.start(
            initialPrompt: prompt.composed,
            attachments: prompt.socketAttachments,
            startupError: startupError
        )

        return sessionID
    }

    @discardableResult
    func restore(
        sessionID: String,
        onSessionClosed: @escaping @MainActor (String) -> Void = { _ in }
    ) -> Bool {
        if focus(sessionID) { return true }

        let viewModel = makeViewModel(sessionID: sessionID)
        present(
            sessionID: sessionID,
            viewModel: viewModel,
            summary: registry.summaries[sessionID]?.latestSummary ?? "",
            onSessionClosed: onSessionClosed
        )
        viewModel.start(initialPrompt: "", startupError: nil)
        return true
    }

    func close(_ sessionID: String) {
        let viewModel = viewModels.removeValue(forKey: sessionID)
        viewModel?.stop()

        if windows.removeValue(forKey: sessionID) != nil {
            setActivationPolicy(activationPolicy.policyAfterUpdatingOpenSessionWindows(by: -1))
        }

        registry.upsert(
            SessionSummary(
                sessionId: sessionID,
                isRunning: viewModel?.status == "running",
                latestSummary: viewModel?.messages.last?.text ?? "",
                lastActiveAt: .now,
                windowIsOpen: false
            )
        )
    }

    @discardableResult
    func focus(_ sessionID: String) -> Bool {
        guard let window = windows[sessionID] else { return false }
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        return true
    }

    func closeAll() {
        viewModels.values.forEach { $0.stop() }
        viewModels.removeAll()
        windows.removeAll()
    }

    private func makeViewModel(sessionID: String) -> SessionViewModel {
        SessionViewModel(
            sessionID: sessionID,
            socketClient: SessionSocketClient(serverURL: agentServerURL)
        )
    }

    private func present(
        sessionID: String,
        viewModel: SessionViewModel,
        summary: String,
        onSessionClosed: @escaping @MainActor (String) -> Void
    ) {
        viewModels[sessionID] = viewModel
        registry.upsert(
            SessionSummary(
                sessionId: sessionID,
                isRunning: true,
                latestSummary: summary,
                lastActiveAt: .now,
                windowIsOpen: true
            )
        )

        if let window = windowPresenter.present(
            sessionID: sessionID,
            viewModel: viewModel,
            onClose: {
                Task { @MainActor in onSessionClosed(sessionID) }
            }
        ) {
            windows[sessionID] = window
            setActivationPolicy(activationPolicy.policyAfterUpdatingOpenSessionWindows(by: 1))
        }
    }
}

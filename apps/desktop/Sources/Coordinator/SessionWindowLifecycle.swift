import AppKit
import Foundation

@Observable
@MainActor
final class SessionWindowLifecycle {
    private(set) var viewModel: SessionWindowViewModel?

    @ObservationIgnored private let registry: SessionRegistry
    @ObservationIgnored private let windowPresenter: any SessionWindowPresenting
    @ObservationIgnored private let agentServerURL: URL
    @ObservationIgnored private let activationPolicy: AppActivationPolicyCoordinator
    @ObservationIgnored private let setActivationPolicy: @MainActor (NSApplication.ActivationPolicy) -> Void
    @ObservationIgnored private var window: NSWindow?

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
        setActivationPolicy(activationPolicy.policyAfterUpdatingOpenSessionWindows(by: 0))
    }

    func openOrFocusHistory(onClosed: @escaping @MainActor () -> Void) {
        let model = ensureWindow(onClosed: onClosed)
        model.openOrFocusHistory()
    }

    func createTabWithInitialPrompt(
        _ prompt: PromptSubmission,
        onClosed: @escaping @MainActor () -> Void
    ) {
        let model = ensureWindow(onClosed: onClosed)
        model.sendPrompt(prompt.composed, attachments: prompt.socketAttachments)
    }

    @discardableResult
    func focus() -> Bool {
        guard let window else { return false }
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        return true
    }

    func close() {
        viewModel?.tabs.forEach { tab in
            syncSummary(from: tab, windowIsOpen: false)
            tab.disconnect()
        }
        viewModel = nil
        if window != nil {
            window = nil
            setActivationPolicy(activationPolicy.policyAfterUpdatingOpenSessionWindows(by: -1))
        }
    }

    private func ensureWindow(onClosed: @escaping @MainActor () -> Void) -> SessionWindowViewModel {
        if let window, let viewModel {
            window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return viewModel
        }

        let model = SessionWindowViewModel(
            socketFactory: { [agentServerURL] _ in SessionSocketClient(serverURL: agentServerURL) },
            historySocketClient: SessionSocketClient(serverURL: agentServerURL),
            onTabStateChanged: { [weak self] tab in
                self?.syncSummary(from: tab, windowIsOpen: true)
            }
        )
        viewModel = model
        window = windowPresenter.present(viewModel: model) {
            Task { @MainActor in onClosed() }
        }
        if window != nil {
            setActivationPolicy(activationPolicy.policyAfterUpdatingOpenSessionWindows(by: 1))
        }
        return model
    }

    private func syncSummary(from tab: SessionTabViewModel, windowIsOpen: Bool) {
        registry.upsert(
            SessionSummary(
                sessionId: tab.sessionID,
                isRunning: tab.status == "running",
                latestSummary: latestNonEmptyMessageText(from: tab) ?? "",
                lastActiveAt: .now,
                windowIsOpen: windowIsOpen
            )
        )
    }

    private func latestNonEmptyMessageText(from tab: SessionTabViewModel) -> String? {
        tab.messages
            .reversed()
            .map(\.text)
            .first { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    }
}

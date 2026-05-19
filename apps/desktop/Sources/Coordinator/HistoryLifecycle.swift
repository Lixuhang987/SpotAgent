import AppKit
import Foundation

@MainActor
final class HistoryLifecycle {
    private let windowPresenter: any HistoryWindowPresenting
    private let activationPolicy: AppActivationPolicyCoordinator
    private let setActivationPolicy: @MainActor (NSApplication.ActivationPolicy) -> Void
    private var window: NSWindow?

    init(
        windowPresenter: any HistoryWindowPresenting,
        activationPolicy: AppActivationPolicyCoordinator,
        setActivationPolicy: @escaping @MainActor (NSApplication.ActivationPolicy) -> Void
    ) {
        self.windowPresenter = windowPresenter
        self.activationPolicy = activationPolicy
        self.setActivationPolicy = setActivationPolicy
    }

    func openOrFocus(
        historyViewModel: SessionHistoryViewModel,
        onRestoreSession: @escaping @MainActor (String) -> Void,
        onClosed: @escaping @MainActor () -> Void
    ) {
        historyViewModel.onRestore = onRestoreSession
        setActivationPolicy(activationPolicy.policyAfterUpdatingHistoryWindow(isOpen: true))

        if let window {
            window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }

        window = windowPresenter.present(
            historyViewModel: historyViewModel,
            onClose: { Task { @MainActor in onClosed() } }
        )
    }

    func handleClosed() {
        window = nil
        setActivationPolicy(activationPolicy.policyAfterUpdatingHistoryWindow(isOpen: false))
    }

    func close() {
        window?.close()
        window = nil
    }
}

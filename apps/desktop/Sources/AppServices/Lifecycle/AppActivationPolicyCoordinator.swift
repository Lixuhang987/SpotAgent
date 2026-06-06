import AppKit

@MainActor
final class AppActivationPolicyCoordinator {
    private var openThreadWindowCount = 0
    private var isSettingsWindowOpen = false

    func policyAfterUpdatingOpenThreadWindows(by delta: Int) -> NSApplication.ActivationPolicy {
        openThreadWindowCount = max(0, openThreadWindowCount + delta)
        return currentPolicy()
    }

    func policyAfterUpdatingSettingsWindow(isOpen: Bool) -> NSApplication.ActivationPolicy {
        isSettingsWindowOpen = isOpen
        return currentPolicy()
    }

    private func currentPolicy() -> NSApplication.ActivationPolicy {
        (openThreadWindowCount > 0 || isSettingsWindowOpen) ? .regular : .accessory
    }
}

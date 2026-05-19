import AppKit

@MainActor
final class AppActivationPolicyCoordinator {
    private var openSessionWindowCount = 0
    private var isSettingsWindowOpen = false
    private var isHistoryWindowOpen = false

    func policyAfterUpdatingOpenSessionWindows(by delta: Int) -> NSApplication.ActivationPolicy {
        openSessionWindowCount = max(0, openSessionWindowCount + delta)
        return currentPolicy()
    }

    func policyAfterUpdatingSettingsWindow(isOpen: Bool) -> NSApplication.ActivationPolicy {
        isSettingsWindowOpen = isOpen
        return currentPolicy()
    }

    func policyAfterUpdatingHistoryWindow(isOpen: Bool) -> NSApplication.ActivationPolicy {
        isHistoryWindowOpen = isOpen
        return currentPolicy()
    }

    private func currentPolicy() -> NSApplication.ActivationPolicy {
        (openSessionWindowCount > 0 || isSettingsWindowOpen || isHistoryWindowOpen) ? .regular : .accessory
    }
}

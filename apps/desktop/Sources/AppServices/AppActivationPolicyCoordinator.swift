import AppKit

@MainActor
final class AppActivationPolicyCoordinator {
    private var openSessionWindowCount = 0

    func policyAfterUpdatingOpenSessionWindows(by delta: Int) -> NSApplication.ActivationPolicy {
        openSessionWindowCount = max(0, openSessionWindowCount + delta)
        return openSessionWindowCount > 0 ? .regular : .accessory
    }
}

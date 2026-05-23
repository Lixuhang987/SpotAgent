import AppKit
import Foundation

@MainActor
final class SettingsLifecycle {
    private let windowPresenter: any SettingsWindowPresenting
    private let activationPolicy: AppActivationPolicyCoordinator
    private let setActivationPolicy: @MainActor (NSApplication.ActivationPolicy) -> Void
    private var window: NSWindow?

    init(
        windowPresenter: any SettingsWindowPresenting,
        activationPolicy: AppActivationPolicyCoordinator,
        setActivationPolicy: @escaping @MainActor (NSApplication.ActivationPolicy) -> Void
    ) {
        self.windowPresenter = windowPresenter
        self.activationPolicy = activationPolicy
        self.setActivationPolicy = setActivationPolicy
    }

    func openOrFocus(
        settingsViewModel: AgentSettingsViewModel,
        toolSettingsViewModel: ToolSettingsViewModel,
        permissionRulesViewModel: PermissionRulesViewModel,
        workspaceViewModel: WorkspaceSettingsViewModel,
        shortcutActions: [ActionDefinition],
        onClosed: @escaping @MainActor () -> Void
    ) {
        setActivationPolicy(activationPolicy.policyAfterUpdatingSettingsWindow(isOpen: true))

        if let window {
            window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }

        window = windowPresenter.present(
            settingsViewModel: settingsViewModel,
            toolSettingsViewModel: toolSettingsViewModel,
            permissionRulesViewModel: permissionRulesViewModel,
            workspaceViewModel: workspaceViewModel,
            shortcutActions: shortcutActions,
            onClose: { Task { @MainActor in onClosed() } }
        )
    }

    func handleClosed() {
        window = nil
        setActivationPolicy(activationPolicy.policyAfterUpdatingSettingsWindow(isOpen: false))
    }

    func close() {
        window?.close()
        window = nil
    }
}

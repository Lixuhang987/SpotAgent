@preconcurrency import AppKit
import KeyboardShortcuts
import SwiftUI

@MainActor
final class ProductionHotkeyRegistrar: HotkeyRegistering {
    private let registrar = NamedHotkeyRegistrar()

    func registerShowPromptPanel(handler: @escaping () -> Void) {
        registrar.register(name: .showPromptPanel, handler: handler)
    }

    func registerCaptureSelection(handler: @escaping () -> Void) {
        registrar.register(name: .captureSelection, handler: handler)
    }

    func registerCaptureRegion(handler: @escaping () -> Void) {
        registrar.register(name: .captureRegion, handler: handler)
    }

    func registerActionShortcut(
        name: KeyboardShortcuts.Name,
        defaultShortcut: KeyboardShortcuts.Shortcut?,
        handler: @escaping () -> Void
    ) {
        if let defaultShortcut {
            ActionShortcutDefaults.ensureDefault(defaultShortcut, for: name)
        }
        registrar.register(name: name, handler: handler)
    }

    func unregisterActionShortcut(name: KeyboardShortcuts.Name) {
        registrar.unregister(name: name)
    }
}

@MainActor
final class ProductionSettingsWindowPresenter: SettingsWindowPresenting {
    private var closeObservations: [ObjectIdentifier: WindowCloseObservation] = [:]
    private var presentations: [ObjectIdentifier: SettingsPresentation] = [:]

    func present(
        settingsViewModel: AgentSettingsViewModel,
        appearanceViewModel: AppearanceSettingsViewModel,
        toolSettingsViewModel: ToolSettingsViewModel,
        pluginSettingsViewModel: PluginSettingsViewModel,
        appendPromptSettingsViewModel: AppendPromptSettingsViewModel,
        mcpSettingsViewModel: MCPSettingsViewModel,
        permissionRulesViewModel: PermissionRulesViewModel,
        workspaceViewModel: WorkspaceSettingsViewModel,
        shortcutActions: [ActionDefinition],
        appTheme: AppTheme,
        onClose: @escaping () -> Void
    ) -> NSWindow? {
        let presentation = SettingsPresentation(
            settingsViewModel: settingsViewModel,
            appearanceViewModel: appearanceViewModel,
            toolSettingsViewModel: toolSettingsViewModel,
            pluginSettingsViewModel: pluginSettingsViewModel,
            appendPromptSettingsViewModel: appendPromptSettingsViewModel,
            mcpSettingsViewModel: mcpSettingsViewModel,
            permissionRulesViewModel: permissionRulesViewModel,
            workspaceViewModel: workspaceViewModel,
            shortcutActions: shortcutActions
        )
        let hosting = NSHostingController(
            rootView: makeRootView(
                presentation: presentation,
                appTheme: appTheme
            )
        )
        let window = NSWindow(contentViewController: hosting)
        window.title = "设置"
        window.setContentSize(NSSize(width: 660, height: 520))
        window.styleMask.insert(.fullSizeContentView)
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.appearance = NSAppearance(named: .aqua)
        window.isOpaque = false
        window.backgroundColor = .clear
        window.hasShadow = true

        let sendableOnClose = SendableClosure(closure: onClose)
        let windowID = ObjectIdentifier(window)
        presentations[windowID] = presentation
        closeObservations[windowID] = WindowCloseObservation(
            object: window,
            queue: .main
        ) { [weak self] in
            self?.closeObservations[windowID] = nil
            self?.presentations[windowID] = nil
            Task { @MainActor in sendableOnClose.closure() }
        }

        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        return window
    }

    func updateTheme(_ appTheme: AppTheme, for window: NSWindow?) {
        guard
            let window,
            let presentation = presentations[ObjectIdentifier(window)],
            let hosting = window.contentViewController as? NSHostingController<AnyView>
        else { return }

        hosting.rootView = makeRootView(presentation: presentation, appTheme: appTheme)
    }

    private func makeRootView(
        presentation: SettingsPresentation,
        appTheme: AppTheme
    ) -> AnyView {
        AnyView(
            SettingsView(
                settingsViewModel: presentation.settingsViewModel,
                appearanceViewModel: presentation.appearanceViewModel,
                toolSettingsViewModel: presentation.toolSettingsViewModel,
                pluginSettingsViewModel: presentation.pluginSettingsViewModel,
                appendPromptSettingsViewModel: presentation.appendPromptSettingsViewModel,
                mcpSettingsViewModel: presentation.mcpSettingsViewModel,
                permissionRulesViewModel: presentation.permissionRulesViewModel,
                workspaceViewModel: presentation.workspaceViewModel,
                shortcutActions: presentation.shortcutActions
            )
            .environment(\.appTheme, appTheme)
        )
    }
}

@MainActor
final class ProductionFatalAlertPresenter: FatalAlertPresenting {
    func showFatal(
        title: String,
        message: String,
        primaryButtonTitle: String,
        secondaryButtonTitle: String?,
        onSecondary: (() -> Void)?
    ) {
        let alert = NSAlert()
        alert.messageText = title
        alert.informativeText = message
        alert.alertStyle = .critical
        alert.addButton(withTitle: primaryButtonTitle)
        if let secondaryButtonTitle {
            alert.addButton(withTitle: secondaryButtonTitle)
        }
        let response = alert.runModal()
        if response == .alertSecondButtonReturn, let onSecondary {
            onSecondary()
        }
    }
}

private struct SendableClosure: @unchecked Sendable {
    let closure: () -> Void
}

private struct SettingsPresentation {
    let settingsViewModel: AgentSettingsViewModel
    let appearanceViewModel: AppearanceSettingsViewModel
    let toolSettingsViewModel: ToolSettingsViewModel
    let pluginSettingsViewModel: PluginSettingsViewModel
    let appendPromptSettingsViewModel: AppendPromptSettingsViewModel
    let mcpSettingsViewModel: MCPSettingsViewModel
    let permissionRulesViewModel: PermissionRulesViewModel
    let workspaceViewModel: WorkspaceSettingsViewModel
    let shortcutActions: [ActionDefinition]
}

@MainActor
final class WindowCloseObservation {
    private let notificationCenter: NotificationCenter
    private var observer: NSObjectProtocol?
    private var onClose: (() -> Void)?

    var isObserving: Bool {
        observer != nil
    }

    init(
        notificationCenter: NotificationCenter = .default,
        notificationName: Notification.Name = NSWindow.willCloseNotification,
        object: AnyObject,
        queue: OperationQueue? = .main,
        onClose: @escaping () -> Void
    ) {
        self.notificationCenter = notificationCenter
        self.onClose = onClose
        self.observer = notificationCenter.addObserver(
            forName: notificationName,
            object: object,
            queue: queue
        ) { [weak self] _ in
            Task { @MainActor in
                self?.handleClose()
            }
        }
    }

    deinit {
        if let observer {
            notificationCenter.removeObserver(observer)
        }
    }

    func cancel() {
        guard let observer else { return }
        notificationCenter.removeObserver(observer)
        self.observer = nil
        onClose = nil
    }

    private func handleClose() {
        guard observer != nil, let callback = onClose else { return }
        cancel()
        callback()
    }
}

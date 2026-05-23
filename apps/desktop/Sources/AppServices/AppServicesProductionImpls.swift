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
final class ProductionSessionWindowPresenter: SessionWindowPresenting {
    private var closeObservations: [ObjectIdentifier: WindowCloseObservation] = [:]

    func present(
        viewModel: SessionWindowViewModel,
        onClose: @escaping () -> Void
    ) -> NSWindow? {
        let hosting = NSHostingController(rootView: SessionWindowView(viewModel: viewModel))
        let window = NSWindow(contentViewController: hosting)
        window.title = "HandAgent"
        window.setContentSize(NSSize(width: 920, height: 640))
        window.styleMask.insert(.fullSizeContentView)
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.center()

        let sendableOnClose = SendableClosure(closure: onClose)
        let windowID = ObjectIdentifier(window)
        closeObservations[windowID] = WindowCloseObservation(
            object: window,
            queue: .main
        ) { [weak self] in
            self?.closeObservations[windowID] = nil
            Task { @MainActor in sendableOnClose.closure() }
        }

        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        return window
    }
}

@MainActor
final class ProductionSettingsWindowPresenter: SettingsWindowPresenting {
    private var closeObservations: [ObjectIdentifier: WindowCloseObservation] = [:]

    func present(
        settingsViewModel: AgentSettingsViewModel,
        toolSettingsViewModel: ToolSettingsViewModel,
        permissionRulesViewModel: PermissionRulesViewModel,
        workspaceViewModel: WorkspaceSettingsViewModel,
        shortcutActions: [ActionDefinition],
        onClose: @escaping () -> Void
    ) -> NSWindow? {
        let hosting = NSHostingController(
            rootView: SettingsView(
                settingsViewModel: settingsViewModel,
                toolSettingsViewModel: toolSettingsViewModel,
                permissionRulesViewModel: permissionRulesViewModel,
                workspaceViewModel: workspaceViewModel,
                shortcutActions: shortcutActions
            )
        )
        let window = NSWindow(contentViewController: hosting)
        window.title = "设置"
        window.setContentSize(NSSize(width: 660, height: 520))
        window.styleMask.insert(.fullSizeContentView)
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.isOpaque = false
        window.backgroundColor = .clear
        window.hasShadow = true

        let sendableOnClose = SendableClosure(closure: onClose)
        let windowID = ObjectIdentifier(window)
        closeObservations[windowID] = WindowCloseObservation(
            object: window,
            queue: .main
        ) { [weak self] in
            self?.closeObservations[windowID] = nil
            Task { @MainActor in sendableOnClose.closure() }
        }

        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        return window
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

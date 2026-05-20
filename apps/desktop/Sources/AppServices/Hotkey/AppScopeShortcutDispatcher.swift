import AppKit
import KeyboardShortcuts

enum AppScopeShortcutDefaults {
    static func ensureDefault(_ shortcut: KeyboardShortcuts.Shortcut, for name: KeyboardShortcuts.Name) {
        if KeyboardShortcuts.getShortcut(for: name) == nil {
            KeyboardShortcuts.setShortcut(shortcut, for: name)
        }
        KeyboardShortcuts.disable(name)
    }

    static func disableGlobalRegistration(for names: [KeyboardShortcuts.Name]) {
        KeyboardShortcuts.disable(names)
    }
}

@MainActor
final class AppScopeShortcutDispatcher {
    private var eventMonitor: Any?

    func start(actions: [PromptAction]) {
        stop()
        for action in actions {
            if let defaultShortcut = action.defaultShortcut {
                AppScopeShortcutDefaults.ensureDefault(defaultShortcut, for: action.shortcutName)
            }
        }

        eventMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { event in
            guard let shortcut = KeyboardShortcuts.Shortcut(event: event) else { return event }
            return Self.performMatchingShortcut(shortcut, actions: actions) ? nil : event
        }
    }

    func stop() {
        if let eventMonitor {
            NSEvent.removeMonitor(eventMonitor)
            self.eventMonitor = nil
        }
    }

    static func performMatchingShortcut(
        _ shortcut: KeyboardShortcuts.Shortcut,
        actions: [PromptAction],
        nameForAction: (PromptAction) -> KeyboardShortcuts.Name = { $0.shortcutName }
    ) -> Bool {
        for action in actions {
            guard KeyboardShortcuts.getShortcut(for: nameForAction(action)) == shortcut else { continue }
            action.perform()
            return true
        }
        return false
    }
}

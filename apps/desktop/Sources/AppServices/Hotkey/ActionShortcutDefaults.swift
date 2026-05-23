import KeyboardShortcuts

enum ActionShortcutDefaults {
    static func ensureDefault(_ shortcut: KeyboardShortcuts.Shortcut, for name: KeyboardShortcuts.Name) {
        if KeyboardShortcuts.getShortcut(for: name) == nil {
            KeyboardShortcuts.setShortcut(shortcut, for: name)
        }
    }

    static func performMatchingShortcut(
        _ shortcut: KeyboardShortcuts.Shortcut,
        actions: [ActionDefinition],
        nameForAction: (ActionDefinition) -> KeyboardShortcuts.Name = { $0.shortcutName },
        perform: (ActionDefinition) -> Void
    ) -> Bool {
        for action in actions {
            guard KeyboardShortcuts.getShortcut(for: nameForAction(action)) == shortcut else { continue }
            perform(action)
            return true
        }
        return false
    }
}

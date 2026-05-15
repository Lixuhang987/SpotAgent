import Foundation

@MainActor
final class ShortcutSettingsStore: ObservableObject {
    private enum StorageKey {
        static let globalShortcut = "shortcut.global"
        static let actionShortcuts = "shortcut.actions"
    }

    var onGlobalShortcutChanged: ((KeyShortcut) -> Void)?
    var onActionShortcutsChanged: (() -> Void)?

    @Published var globalShortcut: KeyShortcut {
        didSet {
            persistGlobalShortcut()
            onGlobalShortcutChanged?(globalShortcut)
        }
    }

    let defaultGlobalShortcut: KeyShortcut

    private let defaults: UserDefaults
    private var defaultActionShortcuts: [String: KeyShortcut]
    private var actionShortcutOverrides: [String: KeyShortcut]

    init(
        defaults: UserDefaults = .standard,
        defaultGlobalShortcut: KeyShortcut,
        defaultActionShortcuts: [String: KeyShortcut]
    ) {
        self.defaults = defaults
        self.defaultGlobalShortcut = defaultGlobalShortcut
        self.defaultActionShortcuts = defaultActionShortcuts
        self.globalShortcut =
            ShortcutSettingsStore.loadShortcut(
                forKey: StorageKey.globalShortcut,
                from: defaults
            ) ?? defaultGlobalShortcut
        self.actionShortcutOverrides =
            ShortcutSettingsStore.loadActionShortcuts(
                forKey: StorageKey.actionShortcuts,
                from: defaults
            )
    }

    func shortcut(forActionID actionID: String) -> KeyShortcut? {
        actionShortcutOverrides[actionID] ?? defaultActionShortcuts[actionID]
    }

    func registerDefaultActionShortcuts(_ shortcuts: [String: KeyShortcut]) {
        defaultActionShortcuts.merge(shortcuts) { _, new in new }
        objectWillChange.send()
        onActionShortcutsChanged?()
    }

    func setShortcut(_ shortcut: KeyShortcut?, forActionID actionID: String) {
        if let shortcut {
            actionShortcutOverrides[actionID] = shortcut
        } else {
            actionShortcutOverrides[actionID] = nil
        }
        persistActionShortcuts()
        objectWillChange.send()
        onActionShortcutsChanged?()
    }

    private func persistGlobalShortcut() {
        ShortcutSettingsStore.saveShortcut(
            globalShortcut,
            forKey: StorageKey.globalShortcut,
            in: defaults
        )
    }

    private func persistActionShortcuts() {
        ShortcutSettingsStore.saveActionShortcuts(
            actionShortcutOverrides,
            forKey: StorageKey.actionShortcuts,
            in: defaults
        )
    }

    private static func loadShortcut(forKey key: String, from defaults: UserDefaults) -> KeyShortcut? {
        guard let data = defaults.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(KeyShortcut.self, from: data)
    }

    private static func saveShortcut(_ shortcut: KeyShortcut, forKey key: String, in defaults: UserDefaults) {
        let data = try? JSONEncoder().encode(shortcut)
        defaults.set(data, forKey: key)
    }

    private static func loadActionShortcuts(forKey key: String, from defaults: UserDefaults)
        -> [String: KeyShortcut]
    {
        guard let data = defaults.data(forKey: key) else { return [:] }
        return (try? JSONDecoder().decode([String: KeyShortcut].self, from: data)) ?? [:]
    }

    private static func saveActionShortcuts(
        _ shortcuts: [String: KeyShortcut],
        forKey key: String,
        in defaults: UserDefaults
    ) {
        let data = try? JSONEncoder().encode(shortcuts)
        defaults.set(data, forKey: key)
    }
}

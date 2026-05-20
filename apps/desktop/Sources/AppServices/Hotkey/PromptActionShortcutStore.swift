import Foundation
import KeyboardShortcuts

enum PromptActionShortcutStore {
    private static let userDefaultsPrefix = "KeyboardShortcuts_"
    private static let shortcutDidChangeName = Notification.Name("KeyboardShortcuts_shortcutByNameDidChange")

    static func setShortcut(_ shortcut: KeyboardShortcuts.Shortcut?, for name: KeyboardShortcuts.Name) {
        let key = userDefaultsPrefix + name.rawValue

        if let shortcut {
            guard let encoded = try? JSONEncoder().encode(shortcut).toString else { return }
            UserDefaults.standard.set(encoded, forKey: key)
        } else {
            UserDefaults.standard.removeObject(forKey: key)
        }

        NotificationCenter.default.post(
            name: shortcutDidChangeName,
            object: nil,
            userInfo: ["name": name]
        )
    }
}

private extension Data {
    var toString: String? {
        String(data: self, encoding: .utf8)
    }
}

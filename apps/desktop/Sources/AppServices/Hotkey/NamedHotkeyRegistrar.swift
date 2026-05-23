import Foundation
import KeyboardShortcuts

@MainActor
protocol NamedHotkeyBackend: AnyObject {
    func shortcut(for name: KeyboardShortcuts.Name) -> KeyboardShortcuts.Shortcut?
    func bindKeyUp(for name: KeyboardShortcuts.Name, handler: @escaping () -> Void)
    func removeHandler(for name: KeyboardShortcuts.Name)
    func observeShortcutChanges(_ handler: @escaping @MainActor (KeyboardShortcuts.Name) -> Void) -> Any
}

@MainActor
final class NamedHotkeyRegistrar {
    private let backend: any NamedHotkeyBackend
    private var handlers: [KeyboardShortcuts.Name: () -> Void] = [:]
    private var observation: Any?

    init(backend: any NamedHotkeyBackend = KeyboardShortcutsHotkeyBackend()) {
        self.backend = backend
        self.observation = backend.observeShortcutChanges { [weak self] name in
            self?.rebindIfRegistered(name)
        }
    }

    func register(name: KeyboardShortcuts.Name, handler: @escaping () -> Void) {
        handlers[name] = handler
        backend.removeHandler(for: name)
        backend.bindKeyUp(for: name, handler: handler)
    }

    func unregister(name: KeyboardShortcuts.Name) {
        handlers[name] = nil
        backend.removeHandler(for: name)
    }

    private func rebindIfRegistered(_ name: KeyboardShortcuts.Name) {
        guard let handler = handlers[name] else { return }
        backend.removeHandler(for: name)
        if backend.shortcut(for: name) != nil {
            backend.bindKeyUp(for: name, handler: handler)
        }
    }
}

@MainActor
final class KeyboardShortcutsHotkeyBackend: NamedHotkeyBackend {
    private static let shortcutDidChangeName = Notification.Name("KeyboardShortcuts_shortcutByNameDidChange")

    func shortcut(for name: KeyboardShortcuts.Name) -> KeyboardShortcuts.Shortcut? {
        KeyboardShortcuts.getShortcut(for: name)
    }

    func bindKeyUp(for name: KeyboardShortcuts.Name, handler: @escaping () -> Void) {
        KeyboardShortcuts.onKeyUp(for: name) { handler() }
    }

    func removeHandler(for name: KeyboardShortcuts.Name) {
        KeyboardShortcuts.removeHandler(for: name)
    }

    func observeShortcutChanges(_ handler: @escaping @MainActor (KeyboardShortcuts.Name) -> Void) -> Any {
        let token = NotificationCenter.default.addObserver(
            forName: Self.shortcutDidChangeName,
            object: nil,
            queue: .main
        ) { notification in
            guard let name = notification.userInfo?["name"] as? KeyboardShortcuts.Name else { return }
            Task { @MainActor in handler(name) }
        }
        return NotificationObservation(token)
    }
}

private final class NotificationObservation: @unchecked Sendable {
    private let token: NSObjectProtocol

    init(_ token: NSObjectProtocol) {
        self.token = token
    }

    deinit {
        NotificationCenter.default.removeObserver(token)
    }
}

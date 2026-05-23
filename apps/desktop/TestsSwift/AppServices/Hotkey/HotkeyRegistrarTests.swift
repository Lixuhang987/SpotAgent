import XCTest
import KeyboardShortcuts
@testable import HandAgentDesktop

@MainActor
final class HotkeyRegistrarTests: XCTestCase {
    func testNamedHotkeyRebindsHandlerWhenShortcutChanges() {
        let backend = FakeHotkeyBackend()
        let name = KeyboardShortcuts.Name("test.hotkey.reload")
        let oldShortcut = KeyboardShortcuts.Shortcut(.h, modifiers: [.command, .shift])
        let newShortcut = KeyboardShortcuts.Shortcut(.j, modifiers: [.command, .shift])
        backend.shortcuts[name] = oldShortcut
        var firedCount = 0
        let registrar = NamedHotkeyRegistrar(backend: backend)

        registrar.register(name: name) {
            firedCount += 1
        }
        backend.trigger(oldShortcut)
        backend.shortcuts[name] = newShortcut
        backend.notifyShortcutChanged(name)
        backend.trigger(oldShortcut)
        backend.trigger(newShortcut)

        XCTAssertEqual(firedCount, 2)
        XCTAssertEqual(backend.boundShortcuts, [newShortcut])
    }

    func testActionDefinitionShortcutNameReadsUpdatedStoredShortcut() {
        let action = ActionDefinition.command(
            id: "hotkey-reload-test-\(UUID().uuidString)",
            trigger: "reload",
            title: "测试动作",
            description: nil,
            keywords: [],
            defaultShortcut: nil,
            command: .openSettings
        )
        let oldShortcut = KeyboardShortcuts.Shortcut(.k, modifiers: [.command])
        let newShortcut = KeyboardShortcuts.Shortcut(.l, modifiers: [.command])
        defer { KeyboardShortcuts.setShortcut(nil, for: action.shortcutName) }

        KeyboardShortcuts.setShortcut(oldShortcut, for: action.shortcutName)
        XCTAssertEqual(KeyboardShortcuts.getShortcut(for: action.shortcutName), oldShortcut)

        KeyboardShortcuts.setShortcut(newShortcut, for: action.shortcutName)

        XCTAssertEqual(KeyboardShortcuts.getShortcut(for: action.shortcutName), newShortcut)
    }

    func testActionShortcutDefaultPersistsStoredShortcut() {
        let name = KeyboardShortcuts.Name("action.default-test-\(UUID().uuidString)")
        let shortcut = KeyboardShortcuts.Shortcut(.comma, modifiers: [.command])
        defer { KeyboardShortcuts.setShortcut(nil, for: name) }

        ActionShortcutDefaults.ensureDefault(shortcut, for: name)

        XCTAssertEqual(KeyboardShortcuts.getShortcut(for: name), shortcut)
    }

    func testActionShortcutMatchingFindsStoredShortcut() {
        let name = KeyboardShortcuts.Name("action.dispatch-test-\(UUID().uuidString)")
        let shortcut = KeyboardShortcuts.Shortcut(.comma, modifiers: [.command])
        defer { KeyboardShortcuts.setShortcut(nil, for: name) }
        var didPerform = false
        let action = ActionDefinition.command(
            id: "dispatch-test",
            trigger: "dispatch",
            title: "测试动作",
            description: nil,
            keywords: [],
            defaultShortcut: shortcut,
            command: .openSettings
        )
        ActionShortcutDefaults.ensureDefault(shortcut, for: name)

        let didHandle = ActionShortcutDefaults.performMatchingShortcut(
            shortcut,
            actions: [action],
            nameForAction: { _ in name },
            perform: { _ in didPerform = true }
        )

        XCTAssertTrue(didHandle)
        XCTAssertTrue(didPerform)
    }
}

private final class FakeHotkeyBackend: NamedHotkeyBackend {
    var shortcuts: [KeyboardShortcuts.Name: KeyboardShortcuts.Shortcut] = [:]
    private var handlers: [KeyboardShortcuts.Name: () -> Void] = [:]
    private var bindings: [KeyboardShortcuts.Name: KeyboardShortcuts.Shortcut] = [:]
    var boundShortcuts: [KeyboardShortcuts.Shortcut] {
        Array(bindings.values)
    }
    private var changeHandler: ((KeyboardShortcuts.Name) -> Void)?

    func shortcut(for name: KeyboardShortcuts.Name) -> KeyboardShortcuts.Shortcut? {
        shortcuts[name]
    }

    func bindKeyUp(for name: KeyboardShortcuts.Name, handler: @escaping () -> Void) {
        handlers[name] = handler
        if let shortcut = shortcuts[name] {
            bindings[name] = shortcut
        }
    }

    func removeHandler(for name: KeyboardShortcuts.Name) {
        handlers[name] = nil
        bindings[name] = nil
    }

    func observeShortcutChanges(_ handler: @escaping @MainActor (KeyboardShortcuts.Name) -> Void) -> Any {
        changeHandler = handler
        return ObservationToken()
    }

    func trigger(_ shortcut: KeyboardShortcuts.Shortcut) {
        for (name, handler) in handlers where shortcuts[name] == shortcut {
            handler()
        }
    }

    func notifyShortcutChanged(_ name: KeyboardShortcuts.Name) {
        changeHandler?(name)
    }

    private final class ObservationToken {}
}

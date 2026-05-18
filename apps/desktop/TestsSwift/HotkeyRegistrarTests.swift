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

    func testPromptActionShortcutLabelReadsUpdatedStoredShortcut() {
        let action = PromptAction(
            id: "hotkey-reload-test-\(UUID().uuidString)",
            title: "测试动作",
            keywords: [],
            defaultShortcut: nil,
            perform: {}
        )
        let vm = PromptPanelViewModel(actions: [action])
        let oldShortcut = KeyboardShortcuts.Shortcut(.k, modifiers: [.command])
        let newShortcut = KeyboardShortcuts.Shortcut(.l, modifiers: [.command])
        defer { KeyboardShortcuts.setShortcut(nil, for: action.shortcutName) }

        KeyboardShortcuts.setShortcut(oldShortcut, for: action.shortcutName)
        XCTAssertEqual(vm.shortcutLabel(for: action), oldShortcut.description)

        KeyboardShortcuts.setShortcut(newShortcut, for: action.shortcutName)

        XCTAssertEqual(vm.shortcutLabel(for: action), newShortcut.description)
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

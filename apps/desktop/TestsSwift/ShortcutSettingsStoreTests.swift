import XCTest
@testable import HandAgentDesktop

final class ShortcutSettingsStoreTests: XCTestCase {
    @MainActor
    func testUsesDefaultGlobalShortcutWhenNoOverrideExists() {
        let defaults = UserDefaults(suiteName: #function)!
        defaults.removePersistentDomain(forName: #function)
        let store = ShortcutSettingsStore(
            defaults: defaults,
            defaultGlobalShortcut: .init(keyCode: 49, modifiers: [.command, .shift]),
            defaultActionShortcuts: [
                "open-settings": .init(keyCode: 43, modifiers: [.command])
            ]
        )

        XCTAssertEqual(
            store.globalShortcut,
            KeyShortcut(keyCode: 49, modifiers: [.command, .shift])
        )
        XCTAssertEqual(
            store.shortcut(forActionID: "open-settings"),
            KeyShortcut(keyCode: 43, modifiers: [.command])
        )
    }

    @MainActor
    func testPersistsOverrides() {
        let defaults = UserDefaults(suiteName: #function)!
        defaults.removePersistentDomain(forName: #function)
        let store = ShortcutSettingsStore(
            defaults: defaults,
            defaultGlobalShortcut: .init(keyCode: 49, modifiers: [.command, .shift]),
            defaultActionShortcuts: [
                "open-settings": .init(keyCode: 43, modifiers: [.command])
            ]
        )

        let global = KeyShortcut(keyCode: 31, modifiers: [.command, .option])
        let action = KeyShortcut(keyCode: 46, modifiers: [.command, .shift])
        store.globalShortcut = global
        store.setShortcut(action, forActionID: "open-settings")

        let reloaded = ShortcutSettingsStore(
            defaults: defaults,
            defaultGlobalShortcut: .init(keyCode: 49, modifiers: [.command, .shift]),
            defaultActionShortcuts: [
                "open-settings": .init(keyCode: 43, modifiers: [.command])
            ]
        )

        XCTAssertEqual(reloaded.globalShortcut, global)
        XCTAssertEqual(reloaded.shortcut(forActionID: "open-settings"), action)
    }

    @MainActor
    func testFallsBackToActionDefaultWhenOverrideIsCleared() {
        let defaults = UserDefaults(suiteName: #function)!
        defaults.removePersistentDomain(forName: #function)
        let store = ShortcutSettingsStore(
            defaults: defaults,
            defaultGlobalShortcut: .init(keyCode: 49, modifiers: [.command, .shift]),
            defaultActionShortcuts: [
                "open-settings": .init(keyCode: 43, modifiers: [.command])
            ]
        )

        store.setShortcut(.init(keyCode: 46, modifiers: [.command]), forActionID: "open-settings")
        store.setShortcut(nil, forActionID: "open-settings")

        XCTAssertEqual(
            store.shortcut(forActionID: "open-settings"),
            KeyShortcut(keyCode: 43, modifiers: [.command])
        )
    }

    @MainActor
    func testRegisteringDefaultActionShortcutsDoesNotTriggerChangeCallback() {
        let defaults = UserDefaults(suiteName: #function)!
        defaults.removePersistentDomain(forName: #function)
        let store = ShortcutSettingsStore(
            defaults: defaults,
            defaultGlobalShortcut: .init(keyCode: 49, modifiers: [.command, .shift]),
            defaultActionShortcuts: [:]
        )
        var callbackCount = 0
        store.onActionShortcutsChanged = {
            callbackCount += 1
        }

        store.registerDefaultActionShortcuts([
            "open-settings": .init(keyCode: 43, modifiers: [.command])
        ])

        XCTAssertEqual(callbackCount, 0)
        XCTAssertEqual(
            store.shortcut(forActionID: "open-settings"),
            KeyShortcut(keyCode: 43, modifiers: [.command])
        )
    }
}

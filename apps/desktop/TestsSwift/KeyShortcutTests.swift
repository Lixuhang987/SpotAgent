import AppKit
import Carbon.HIToolbox
import XCTest
@testable import HandAgentDesktop

final class KeyShortcutTests: XCTestCase {
    func testFormatsDisplayString() {
        let shortcut = KeyShortcut(keyCode: 49, modifiers: [.command, .shift])

        XCTAssertEqual(shortcut.displayString, "⇧⌘Space")
    }

    func testFormatsPunctuationShortcutDisplayString() {
        let shortcut = KeyShortcut(
            keyCode: UInt16(kVK_ANSI_Comma),
            modifiers: [.command]
        )

        XCTAssertEqual(shortcut.displayString, "⌘,")
    }

    func testFormatsDigitShortcutDisplayString() {
        let shortcut = KeyShortcut(
            keyCode: UInt16(kVK_ANSI_0),
            modifiers: [.command]
        )

        XCTAssertEqual(shortcut.displayString, "⌘0")
    }

    func testFormatsNonContiguousLetterShortcutDisplayString() {
        let shortcut = KeyShortcut(
            keyCode: UInt16(kVK_ANSI_M),
            modifiers: [.command]
        )

        XCTAssertEqual(shortcut.displayString, "⌘M")
    }

    func testMatchesEvent() {
        let shortcut = KeyShortcut(keyCode: 46, modifiers: [.command, .shift])
        let event = NSEvent.keyEvent(
            with: .keyDown,
            location: .zero,
            modifierFlags: [.command, .shift, .capsLock],
            timestamp: 0,
            windowNumber: 0,
            context: nil,
            characters: "m",
            charactersIgnoringModifiers: "m",
            isARepeat: false,
            keyCode: 46
        )

        XCTAssertEqual(shortcut.matches(event), true)
    }
}

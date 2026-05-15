import AppKit
import Carbon.HIToolbox
import Foundation

struct KeyShortcut: Codable, Equatable, Hashable, Sendable {
    let keyCode: UInt16
    private let modifiersRawValue: UInt

    init(keyCode: UInt16, modifiers: NSEvent.ModifierFlags) {
        self.keyCode = keyCode
        self.modifiersRawValue = KeyShortcut.normalize(modifiers).rawValue
    }

    var modifiers: NSEvent.ModifierFlags {
        NSEvent.ModifierFlags(rawValue: modifiersRawValue)
    }

    var displayString: String {
        let symbols = [
            modifiers.contains(.control) ? "^" : nil,
            modifiers.contains(.option) ? "⌥" : nil,
            modifiers.contains(.shift) ? "⇧" : nil,
            modifiers.contains(.command) ? "⌘" : nil
        ]
        .compactMap { $0 }
        .joined()

        return symbols + keyDisplay
    }

    var carbonModifiers: UInt32 {
        var result: UInt32 = 0
        if modifiers.contains(.command) {
            result |= UInt32(cmdKey)
        }
        if modifiers.contains(.shift) {
            result |= UInt32(shiftKey)
        }
        if modifiers.contains(.option) {
            result |= UInt32(optionKey)
        }
        if modifiers.contains(.control) {
            result |= UInt32(controlKey)
        }
        return result
    }

    func matches(_ event: NSEvent?) -> Bool {
        guard let event else { return false }
        return event.keyCode == keyCode
            && KeyShortcut.normalize(event.modifierFlags) == modifiers
    }

    static func from(event: NSEvent, allowsPlainKeys: Bool) -> KeyShortcut? {
        let modifiers = normalize(event.modifierFlags)
        if !allowsPlainKeys && modifiers.isEmpty {
            return nil
        }

        if event.keyCode == UInt16(kVK_Escape) {
            return nil
        }

        return KeyShortcut(keyCode: event.keyCode, modifiers: modifiers)
    }

    private var keyDisplay: String {
        if let display = Self.keyDisplays[keyCode] {
            return display
        }

        switch Int(keyCode) {
        case kVK_Space:
            return "Space"
        case kVK_Tab:
            return "Tab"
        case kVK_Return:
            return "Return"
        case kVK_Delete:
            return "Delete"
        case kVK_Escape:
            return "Esc"
        default:
            return "Key \(keyCode)"
        }
    }

    private static func normalize(_ modifiers: NSEvent.ModifierFlags) -> NSEvent.ModifierFlags {
        modifiers.intersection([.command, .shift, .option, .control])
    }

    private static let keyDisplays: [UInt16: String] = [
        UInt16(kVK_ANSI_A): "A",
        UInt16(kVK_ANSI_B): "B",
        UInt16(kVK_ANSI_C): "C",
        UInt16(kVK_ANSI_D): "D",
        UInt16(kVK_ANSI_E): "E",
        UInt16(kVK_ANSI_F): "F",
        UInt16(kVK_ANSI_G): "G",
        UInt16(kVK_ANSI_H): "H",
        UInt16(kVK_ANSI_I): "I",
        UInt16(kVK_ANSI_J): "J",
        UInt16(kVK_ANSI_K): "K",
        UInt16(kVK_ANSI_L): "L",
        UInt16(kVK_ANSI_M): "M",
        UInt16(kVK_ANSI_N): "N",
        UInt16(kVK_ANSI_O): "O",
        UInt16(kVK_ANSI_P): "P",
        UInt16(kVK_ANSI_Q): "Q",
        UInt16(kVK_ANSI_R): "R",
        UInt16(kVK_ANSI_S): "S",
        UInt16(kVK_ANSI_T): "T",
        UInt16(kVK_ANSI_U): "U",
        UInt16(kVK_ANSI_V): "V",
        UInt16(kVK_ANSI_W): "W",
        UInt16(kVK_ANSI_X): "X",
        UInt16(kVK_ANSI_Y): "Y",
        UInt16(kVK_ANSI_Z): "Z",
        UInt16(kVK_ANSI_0): "0",
        UInt16(kVK_ANSI_1): "1",
        UInt16(kVK_ANSI_2): "2",
        UInt16(kVK_ANSI_3): "3",
        UInt16(kVK_ANSI_4): "4",
        UInt16(kVK_ANSI_5): "5",
        UInt16(kVK_ANSI_6): "6",
        UInt16(kVK_ANSI_7): "7",
        UInt16(kVK_ANSI_8): "8",
        UInt16(kVK_ANSI_9): "9",
        UInt16(kVK_ANSI_Comma): ",",
        UInt16(kVK_ANSI_Period): ".",
        UInt16(kVK_ANSI_Minus): "-",
        UInt16(kVK_ANSI_Equal): "=",
        UInt16(kVK_ANSI_Semicolon): ";",
        UInt16(kVK_ANSI_Quote): "'",
        UInt16(kVK_ANSI_Slash): "/",
        UInt16(kVK_ANSI_Backslash): "\\",
        UInt16(kVK_ANSI_LeftBracket): "[",
        UInt16(kVK_ANSI_RightBracket): "]",
        UInt16(kVK_ANSI_Grave): "`"
    ]
}

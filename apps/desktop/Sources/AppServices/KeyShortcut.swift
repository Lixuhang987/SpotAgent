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
        case kVK_ANSI_A...kVK_ANSI_Z:
            return String(UnicodeScalar(Int(keyCode) - kVK_ANSI_A + 65)!)
        case kVK_ANSI_0...kVK_ANSI_9:
            return String(UnicodeScalar(Int(keyCode) - kVK_ANSI_0 + 48)!)
        case kVK_ANSI_Comma:
            return ","
        case kVK_ANSI_Period:
            return "."
        case kVK_ANSI_Minus:
            return "-"
        case kVK_ANSI_Equal:
            return "="
        case kVK_ANSI_Semicolon:
            return ";"
        case kVK_ANSI_Quote:
            return "'"
        case kVK_ANSI_Slash:
            return "/"
        case kVK_ANSI_Backslash:
            return "\\"
        case kVK_ANSI_LeftBracket:
            return "["
        case kVK_ANSI_RightBracket:
            return "]"
        case kVK_ANSI_Grave:
            return "`"
        default:
            return "Key \(keyCode)"
        }
    }

    private static func normalize(_ modifiers: NSEvent.ModifierFlags) -> NSEvent.ModifierFlags {
        modifiers.intersection([.command, .shift, .option, .control])
    }
}

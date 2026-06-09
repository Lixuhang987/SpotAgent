import AppKit

enum PromptPanelInputCommand: Equatable {
    case insertNewline
    case selectPreviousAction
    case selectNextAction
    case submitSelectedAction

    static func resolve(
        commandSelector: Selector,
        modifierFlags: NSEvent.ModifierFlags
    ) -> PromptPanelInputCommand? {
        switch commandSelector {
        case #selector(NSResponder.insertNewline(_:)):
            if modifierFlags.intersection([.shift, .option]).isEmpty {
                return .submitSelectedAction
            }
            return .insertNewline
        case #selector(NSResponder.moveUp(_:)):
            return .selectPreviousAction
        case #selector(NSResponder.moveDown(_:)):
            return .selectNextAction
        case #selector(NSResponder.insertTab(_:)):
            return .submitSelectedAction
        default:
            return nil
        }
    }
}

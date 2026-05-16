import KeyboardShortcuts

extension KeyboardShortcuts.Name {
    static let showPromptPanel = Self(
        "showPromptPanel",
        default: .init(.space, modifiers: [.command, .shift])
    )
}

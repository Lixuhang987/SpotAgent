import KeyboardShortcuts

extension KeyboardShortcuts.Name {
    static let showPromptPanel = Self(
        "showPromptPanel",
        default: .init(.space, modifiers: [.command, .shift])
    )

    static let captureSelection = Self("captureSelection")
    static let captureRegion = Self("captureRegion")
}

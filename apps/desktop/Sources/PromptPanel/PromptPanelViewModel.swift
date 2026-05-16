import Foundation
import KeyboardShortcuts

@Observable
@MainActor
final class PromptPanelViewModel {
    var draft = ""
    var focusSeed = 0

    var onSubmit: ((String, [PromptAttachmentResult]) -> Void)?
    var onHide: (() -> Void)?
    var onOpenSettings: (() -> Void)?

    @ObservationIgnored private let actions: [PromptAction]

    var filteredActions: [PromptAction] {
        PromptAction.filter(actions, query: draft)
    }

    init(actions: [PromptAction]) {
        self.actions = actions
    }

    func submit() {
        let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        onSubmit?(trimmed, [])
        draft = ""
    }

    func submitAction(_ action: PromptAction) {
        action.perform()
        draft = ""
        onHide?()
    }

    func openSettings() {
        onOpenSettings?()
        onHide?()
    }

    func shortcutLabel(for action: PromptAction) -> String? {
        KeyboardShortcuts.getShortcut(for: action.shortcutName)?.description
    }
}

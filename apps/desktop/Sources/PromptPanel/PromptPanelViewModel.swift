import Foundation
import KeyboardShortcuts

@Observable
@MainActor
final class PromptPanelViewModel {
    var draft = ""
    var focusSeed = 0
    var attachments: [PromptAttachmentResult] = []

    var onSubmit: ((String, [PromptAttachmentResult]) -> Void)?
    var onHide: (() -> Void)?
    var onOpenSettings: (() -> Void)?
    var onPreviewImage: ((PromptAttachmentResult) -> Void)?

    @ObservationIgnored private let actions: [PromptAction]

    var filteredActions: [PromptAction] {
        PromptAction.filter(actions, query: draft)
    }

    init(actions: [PromptAction]) {
        self.actions = actions
    }

    func appendAttachment(_ attachment: PromptAttachmentResult) {
        switch attachment {
        case .noAttachment:
            return
        case .textSelection, .selectionError, .textToken, .imageRegion:
            attachments.append(attachment)
        }
    }

    func removeAttachment(id: String) {
        attachments.removeAll { $0.id == id }
    }

    func previewAttachment(_ attachment: PromptAttachmentResult) {
        guard attachment.isImage else { return }
        onPreviewImage?(attachment)
    }

    func resetForNewSession() {
        draft = ""
        attachments = []
    }

    func submit() {
        let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        let payload = attachments.filter {
            if case .selectionError = $0 { return false }
            return true
        }
        onSubmit?(trimmed, payload)
        resetForNewSession()
    }

    func submitAction(_ action: PromptAction) {
        action.perform()
        resetForNewSession()
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

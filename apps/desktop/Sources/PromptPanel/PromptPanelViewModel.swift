import Foundation

@Observable
@MainActor
final class PromptPanelViewModel {
    var draft = ""
    var focusSeed = 0
    var attachments: [PromptAttachmentResult] = []
    private(set) var submissionDisabledMessage: String?
    private(set) var isSubmissionInputDisabled = false

    var onSubmit: ((String, [PromptAttachmentResult]) -> Void)?
    var onSubmitAction: ((String, ActionBindingPayload, [PromptAttachmentResult]) -> Void)?
    var onHide: (() -> Void)?
    var onOpenSettings: (() -> Void)?
    var onPreviewImage: ((PromptAttachmentResult) -> Void)?

    @ObservationIgnored private var actions: [ActionDefinition]

    var filteredActions: [ActionDefinition] {
        ActionDefinition.filter(actions, query: draft)
    }

    init(actions: [ActionDefinition]) {
        self.actions = actions
    }

    func updateActions(_ actions: [ActionDefinition]) {
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

    func setSubmissionEnabled(_ enabled: Bool, message: String?) {
        isSubmissionInputDisabled = !enabled
        submissionDisabledMessage = enabled ? nil : message
    }

    func submit() {
        let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        guard !isSubmissionInputDisabled else { return }
        submissionDisabledMessage = nil

        switch ActionInvocation.parse(draft: draft, actions: actions) {
        case .action(let parsed):
            submit(parsed)
            return
        case .plain:
            break
        }

        onSubmit?(trimmed, validAttachments())
        resetForNewSession()
    }

    func selectAction(_ action: ActionDefinition) {
        let argumentTemplate = action.arguments
            .map { "[\($0.name): ]" }
            .joined(separator: " ")
        draft = argumentTemplate.isEmpty ? action.trigger : "\(action.trigger) \(argumentTemplate)"
    }

    func openSettings() {
        onOpenSettings?()
        onHide?()
    }

    private func validAttachments() -> [PromptAttachmentResult] {
        attachments.filter {
            if case .selectionError = $0 { return false }
            return true
        }
    }

    private func submit(_ parsed: ParsedActionInvocation) {
        switch parsed.action.submission {
        case .appendPrompt:
            do {
                onSubmit?(try parsed.renderedPrompt(), validAttachments())
                resetForNewSession()
            } catch ActionInvocationError.missingRequiredArgument(let name) {
                submissionDisabledMessage = "缺少必填参数：\(name)"
            } catch {
                submissionDisabledMessage = "Action 渲染失败"
            }
        case .plugin(let binding):
            do {
                let payload = ActionBindingPayload(pluginId: binding.pluginId, promptName: binding.promptName)
                onSubmitAction?(try parsed.renderedPrompt(), payload, validAttachments())
                resetForNewSession()
            } catch ActionInvocationError.missingRequiredArgument(let name) {
                submissionDisabledMessage = "缺少必填参数：\(name)"
            } catch {
                submissionDisabledMessage = "Action 渲染失败"
            }
        }
    }
}

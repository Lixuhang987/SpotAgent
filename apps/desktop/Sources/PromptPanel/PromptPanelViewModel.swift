import Foundation

enum PromptPanelActionSelectionDirection {
    case previous
    case next
}

@Observable
@MainActor
final class PromptPanelViewModel {
    var draft = ""
    var focusSeed = 0
    var attachments: [PromptAttachmentResult] = []
    var selectedActionId: String?
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

    var selectedAction: ActionDefinition? {
        guard let selectedActionId else { return nil }
        return filteredActions.first { $0.id == selectedActionId }
    }

    init(actions: [ActionDefinition]) {
        self.actions = actions
    }

    func updateActions(_ actions: [ActionDefinition]) {
        self.actions = actions
        if selectedAction == nil {
            selectedActionId = nil
        }
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

    func resetForNewThread() {
        draft = ""
        attachments = []
        selectedActionId = nil
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
        resetForNewThread()
    }

    func selectAction(_ action: ActionDefinition) {
        let argumentTemplate = action.arguments
            .map { "[\($0.name): ]" }
            .joined(separator: " ")
        draft = argumentTemplate.isEmpty ? action.trigger : "\(action.trigger) \(argumentTemplate)"
        selectedActionId = action.id
    }

    func moveSelectedAction(_ direction: PromptPanelActionSelectionDirection) {
        let actions = filteredActions
        guard !actions.isEmpty else {
            selectedActionId = nil
            return
        }

        guard
            let currentSelectedActionId = selectedActionId,
            let currentIndex = actions.firstIndex(where: { $0.id == currentSelectedActionId })
        else {
            selectedActionId = direction == .next ? actions.first?.id : actions.last?.id
            return
        }

        let offset = direction == .next ? 1 : -1
        let nextIndex = (currentIndex + offset + actions.count) % actions.count
        selectedActionId = actions[nextIndex].id
    }

    func submitSelectedAction() {
        guard let action = selectedAction else {
            submit()
            return
        }

        switch ActionInvocation.parse(draft: draft, actions: [action]) {
        case .action(let parsed):
            submissionDisabledMessage = nil
            submit(parsed)
        case .plain:
            if action.arguments.isEmpty {
                submissionDisabledMessage = nil
                submit(ParsedActionInvocation(action: action, values: [:]))
            } else {
                selectAction(action)
                submit()
            }
        }
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
                resetForNewThread()
            } catch ActionInvocationError.missingRequiredArgument(let name) {
                submissionDisabledMessage = "缺少必填参数：\(name)"
            } catch {
                submissionDisabledMessage = "Action 渲染失败"
            }
        case .plugin(let binding):
            do {
                let payload = ActionBindingPayload(pluginId: binding.pluginId, promptName: binding.promptName)
                onSubmitAction?(try parsed.renderedPrompt(), payload, validAttachments())
                resetForNewThread()
            } catch ActionInvocationError.missingRequiredArgument(let name) {
                submissionDisabledMessage = "缺少必填参数：\(name)"
            } catch {
                submissionDisabledMessage = "Action 渲染失败"
            }
        }
    }
}

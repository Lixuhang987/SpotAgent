import Foundation

struct ActionBindingPayload: Encodable, Equatable {
    let pluginId: String
    let promptName: String
}

struct PromptUserInput: Encodable, Equatable {
    let items: [PromptInputItem]
}

enum PromptInputItem: Encodable, Equatable {
    case text(id: String, text: String)
    case image(id: String, mimeType: String, base64: String)
    case skill(id: String, actionId: String, title: String, prompt: String)
    case textSelection(id: String, text: String)

    private enum CodingKeys: String, CodingKey {
        case type, id, text, mimeType, base64, actionId, title, prompt
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .text(let id, let text):
            try container.encode("text", forKey: .type)
            try container.encode(id, forKey: .id)
            try container.encode(text, forKey: .text)
        case .image(let id, let mimeType, let base64):
            try container.encode("image", forKey: .type)
            try container.encode(id, forKey: .id)
            try container.encode(mimeType, forKey: .mimeType)
            try container.encode(base64, forKey: .base64)
        case .skill(let id, let actionId, let title, let prompt):
            try container.encode("skill", forKey: .type)
            try container.encode(id, forKey: .id)
            try container.encode(actionId, forKey: .actionId)
            try container.encode(title, forKey: .title)
            try container.encode(prompt, forKey: .prompt)
        case .textSelection(let id, let text):
            try container.encode("text_selection", forKey: .type)
            try container.encode(id, forKey: .id)
            try container.encode(text, forKey: .text)
        }
    }
}

struct PromptSubmission {
    let userInput: PromptUserInput
    let summary: String
    let actionBinding: ActionBindingPayload?

    var composed: String {
        userInput.items.compactMap { item in
            switch item {
            case .text(_, let text):
                return text
            case .textSelection(_, let text):
                return text
            case .image:
                return nil
            case .skill(_, _, _, let prompt):
                return prompt
            }
        }.joined(separator: "\n\n")
    }

    var socketAttachments: [UserMessageAttachmentPayload] {
        userInput.items.compactMap { item in
            switch item {
            case .textSelection(let id, let text):
                return .textSelection(id: id, text: text)
            case .image(let id, let mimeType, let base64):
                return .image(id: id, mimeType: mimeType, base64: base64)
            case .text, .skill:
                return nil
            }
        }
    }

    static func compose(
        draft: String,
        attachments: [PromptAttachmentResult],
        actionBinding: ActionBindingPayload? = nil
    ) -> PromptSubmission? {
        let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }

        var items: [PromptInputItem] = [.text(id: UUID().uuidString, text: trimmed)]
        for attachment in attachments {
            switch attachment {
            case .textSelection(let id, let text):
                items.append(.textSelection(id: id, text: text))
            case .imageRegion(let id, let mimeType, let base64):
                items.append(.image(id: id, mimeType: mimeType, base64: base64))
            case .textToken(let token):
                items.append(.text(id: UUID().uuidString, text: token))
            case .selectionError, .noAttachment:
                continue
            }
        }

        let summary = items.count > 1
            ? trimmed + "\n\n[附件 ×\(items.count - 1)]"
            : trimmed

        return PromptSubmission(
            userInput: PromptUserInput(items: items),
            summary: summary,
            actionBinding: actionBinding
        )
    }
}

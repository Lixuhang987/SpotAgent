import Foundation

struct PromptSubmission {
    let composed: String
    let summary: String
    let socketAttachments: [UserMessageAttachmentPayload]

    static func compose(draft: String, attachments: [PromptAttachmentResult]) -> PromptSubmission? {
        let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }

        let tokenSuffix = attachments.compactMap { attachment -> String? in
            if case .textToken(let token) = attachment { return token }
            return nil
        }
        let composed = ([trimmed] + tokenSuffix).joined(separator: "\n\n")

        let socketAttachments = attachments.compactMap { attachment -> UserMessageAttachmentPayload? in
            switch attachment {
            case .textSelection(let id, let text):
                return .textSelection(id: id, text: text)
            case .imageRegion(let id, let mimeType, let base64):
                return .image(id: id, mimeType: mimeType, base64: base64)
            case .noAttachment, .textToken, .selectionError:
                return nil
            }
        }

        let summary = socketAttachments.isEmpty
            ? composed
            : composed + "\n\n[附件 ×\(socketAttachments.count)]"

        return PromptSubmission(
            composed: composed,
            summary: summary,
            socketAttachments: socketAttachments
        )
    }
}

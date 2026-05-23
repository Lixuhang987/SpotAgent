import Foundation

enum PromptAttachmentResult: Equatable, Identifiable {
    case noAttachment
    case textToken(String)
    case textSelection(id: String, text: String)
    case imageRegion(id: String, mimeType: String, base64: String)
    case selectionError(id: String, message: String)

    var id: String {
        switch self {
        case .noAttachment: return "none"
        case .textToken(let token): return "token:\(token)"
        case .textSelection(let id, _): return id
        case .imageRegion(let id, _, _): return id
        case .selectionError(let id, _): return id
        }
    }

    var displayLabel: String {
        switch self {
        case .noAttachment: return ""
        case .textToken(let token): return token
        case .textSelection(_, let text):
            let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
            let preview = trimmed.split(whereSeparator: \.isNewline).first.map(String.init) ?? trimmed
            if preview.count > 32 {
                return String(preview.prefix(32)) + "…"
            }
            return preview.isEmpty ? "选区" : preview
        case .imageRegion:
            return "区域截图"
        case .selectionError:
            return "选区采集失败"
        }
    }

    var iconSystemName: String {
        switch self {
        case .imageRegion: return "photo"
        case .selectionError: return "exclamationmark.triangle"
        default: return "text.quote"
        }
    }

    var isError: Bool {
        if case .selectionError = self { return true }
        return false
    }

    var isImage: Bool {
        if case .imageRegion = self { return true }
        return false
    }

    var imageBase64: String? {
        if case .imageRegion(_, _, let base64) = self { return base64 }
        return nil
    }
}

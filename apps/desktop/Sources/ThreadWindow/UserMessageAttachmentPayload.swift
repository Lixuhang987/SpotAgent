import Foundation

struct UserMessageAttachmentPayload: Encodable, Equatable {
    enum Kind: String, Encodable, Equatable {
        case textSelection = "text_selection"
        case image
    }

    let kind: Kind
    let id: String
    let text: String?
    let mimeType: String?
    let base64: String?

    static func textSelection(id: String, text: String) -> UserMessageAttachmentPayload {
        UserMessageAttachmentPayload(
            kind: .textSelection,
            id: id,
            text: text,
            mimeType: nil,
            base64: nil
        )
    }

    static func image(id: String, mimeType: String, base64: String) -> UserMessageAttachmentPayload {
        UserMessageAttachmentPayload(
            kind: .image,
            id: id,
            text: nil,
            mimeType: mimeType,
            base64: base64
        )
    }

    private enum CodingKeys: String, CodingKey {
        case kind, id, text, mimeType, base64
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(kind, forKey: .kind)
        try container.encode(id, forKey: .id)
        try container.encodeIfPresent(text, forKey: .text)
        try container.encodeIfPresent(mimeType, forKey: .mimeType)
        try container.encodeIfPresent(base64, forKey: .base64)
    }
}

extension UserMessageAttachmentPayload {
    var jsonObject: [String: Any] {
        switch kind {
        case .textSelection:
            return ["kind": kind.rawValue, "id": id, "text": text ?? ""]
        case .image:
            return [
                "kind": kind.rawValue,
                "id": id,
                "mimeType": mimeType ?? "image/png",
                "base64": base64 ?? "",
            ]
        }
    }
}

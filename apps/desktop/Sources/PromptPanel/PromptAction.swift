import Foundation
import KeyboardShortcuts

enum PromptAttachmentResult: Equatable {
    case noAttachment
    case textToken(String)
}

struct PromptAction: Identifiable {
    let id: String
    let title: String
    let keywords: [String]
    let defaultShortcut: KeyboardShortcuts.Shortcut?
    let perform: () -> Void

    var shortcutName: KeyboardShortcuts.Name {
        KeyboardShortcuts.Name("action.\(id)")
    }

    static func filter(_ actions: [PromptAction], query: String) -> [PromptAction] {
        let trimmedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedQuery.isEmpty else { return actions }

        let normalizedQuery = trimmedQuery.lowercased()

        return actions.filter { action in
            action.title.lowercased().contains(normalizedQuery)
                || action.keywords.contains(where: { $0.lowercased().contains(normalizedQuery) })
        }
    }
}

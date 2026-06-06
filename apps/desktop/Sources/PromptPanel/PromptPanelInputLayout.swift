import Foundation

enum PromptPanelInputLayout {
    static let emptyDraftTextWidth: CGFloat = 180

    static func shouldExpandInput(for draft: String) -> Bool {
        !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    static func inputWidth(for draft: String) -> CGFloat? {
        shouldExpandInput(for: draft) ? nil : emptyDraftTextWidth
    }
}

import Foundation

enum PromptPanelInputLayout {
    static func shouldExpandInput(for draft: String) -> Bool {
        !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

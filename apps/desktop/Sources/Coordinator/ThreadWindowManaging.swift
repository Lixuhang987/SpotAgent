import Foundation

@MainActor
protocol ThreadWindowManaging: AnyObject {
    var webHost: ThreadWindowWebHost? { get }

    func prepareForPromptPanel()
    func openOrFocusHistory(onClosed: @escaping @MainActor () -> Void)
    func createTabWithInitialPrompt(_ prompt: PromptSubmission, onClosed: @escaping @MainActor () -> Void)
    func focus(threadID: String?) -> Bool
    func close()
}

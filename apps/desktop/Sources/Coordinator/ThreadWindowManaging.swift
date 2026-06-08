import Foundation

@MainActor
protocol ThreadWindowManaging: AnyObject {
    var webHost: ThreadWindowWebHost? { get }

    func prepareForPromptPanel()
    func openOrFocusHistory(
        onOpened: @escaping @MainActor () -> Void,
        onFailed: @escaping @MainActor (String) -> Void,
        onClosed: @escaping @MainActor () -> Void
    )
    func createTabWithInitialPrompt(
        _ prompt: PromptSubmission,
        onOpened: @escaping @MainActor () -> Void,
        onFailed: @escaping @MainActor (String) -> Void,
        onClosed: @escaping @MainActor () -> Void
    )
    func focus(threadID: String?, onFailure: @escaping @MainActor () -> Void) -> Bool
    func close()
}

import Foundation

@MainActor
protocol ThreadWindowCommanding: AnyObject {
    var onThreadWindowClosed: (() -> Void)? { get set }

    func prepareThreadWindow() throws
    func openInitialPrompt(_ prompt: PromptSubmission) throws
    func openHistory() throws
    func focus(threadId: String?) throws
}

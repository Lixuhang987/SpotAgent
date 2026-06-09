import Foundation

enum ThreadWindowCommandKind: Equatable {
    case openInitialPrompt
    case openHistory
    case focus
}

struct ThreadWindowCommandResult: Equatable {
    let commandId: String
    let kind: ThreadWindowCommandKind
    let ok: Bool
    let error: String?
}

@MainActor
protocol ThreadWindowCommanding: AnyObject {
    var onThreadWindowClosed: (() -> Void)? { get set }
    var onCommandResult: ((ThreadWindowCommandResult) -> Void)? { get set }

    @discardableResult
    func openInitialPrompt(_ prompt: PromptSubmission) throws -> String

    @discardableResult
    func openHistory() throws -> String

    @discardableResult
    func focus(threadId: String?) throws -> String

    @discardableResult
    func sendThemeChanged(_ theme: HostThemePayload) throws -> String
}

import Foundation

@MainActor
final class ThreadWindowWebHost {
    struct InitialPromptPayload: Encodable, Equatable {
        let text: String
        let attachments: [UserMessageAttachmentPayload]
        let actionBinding: ActionBindingPayload?
    }

    let threadWebSocketURL: URL
    let webAppURL: URL

    private var pendingInitialPrompts: [InitialPromptPayload] = []
    var onInitialPromptsEnqueued: (() -> Void)?

    var pendingInitialPromptCount: Int {
        pendingInitialPrompts.count
    }

    var configurationScript: String {
        let config = ["threadWebSocketURL": threadWebSocketURL.absoluteString]
        guard
            let data = try? JSONEncoder().encode(config),
            let json = String(data: data, encoding: .utf8)
        else {
            return "window.__HANDAGENT_CONFIG__ = {};"
        }
        return "window.__HANDAGENT_CONFIG__ = \(json);"
    }

    init(threadWebSocketURL: URL, webAppURL: URL) {
        self.threadWebSocketURL = threadWebSocketURL
        self.webAppURL = webAppURL
    }

    func enqueue(initialPrompt prompt: PromptSubmission) {
        pendingInitialPrompts.append(
            InitialPromptPayload(
                text: prompt.composed,
                attachments: prompt.socketAttachments,
                actionBinding: prompt.actionBinding
            )
        )
        onInitialPromptsEnqueued?()
    }

    func drainInitialPrompts() -> [InitialPromptPayload] {
        let prompts = pendingInitialPrompts
        pendingInitialPrompts = []
        return prompts
    }
}

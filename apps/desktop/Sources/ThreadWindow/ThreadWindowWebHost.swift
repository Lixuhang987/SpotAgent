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

@MainActor
final class ThreadEventBus<Message> {
    final class Subscription {
        private var cancelHandler: (() -> Void)?

        fileprivate init(cancelHandler: @escaping () -> Void) {
            self.cancelHandler = cancelHandler
        }

        func cancel() {
            cancelHandler?()
            cancelHandler = nil
        }

        deinit {
            cancel()
        }
    }

    typealias Handler = (Message) -> Void

    private var threadSubscribers: [String: [UUID: Handler]] = [:]
    private var globalSubscribers: [UUID: Handler] = [:]

    @discardableResult
    func subscribe(threadID: String, handler: @escaping Handler) -> Subscription {
        let id = UUID()
        threadSubscribers[threadID, default: [:]][id] = handler
        return Subscription { [weak self] in
            self?.unsubscribe(threadID: threadID, id: id)
        }
    }

    @discardableResult
    func subscribeGlobal(handler: @escaping Handler) -> Subscription {
        let id = UUID()
        globalSubscribers[id] = handler
        return Subscription { [weak self] in
            self?.unsubscribeGlobal(id: id)
        }
    }

    func publish(_ message: Message, to threadID: String) {
        guard let handlers = threadSubscribers[threadID]?.values else { return }
        for handler in handlers {
            handler(message)
        }
    }

    func publishGlobal(_ message: Message) {
        for handler in globalSubscribers.values {
            handler(message)
        }
    }

    private func unsubscribe(threadID: String, id: UUID) {
        guard var handlers = threadSubscribers[threadID] else { return }
        handlers.removeValue(forKey: id)
        if handlers.isEmpty {
            threadSubscribers.removeValue(forKey: threadID)
        } else {
            threadSubscribers[threadID] = handlers
        }
    }

    private func unsubscribeGlobal(id: UUID) {
        globalSubscribers.removeValue(forKey: id)
    }
}

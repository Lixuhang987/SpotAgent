import Foundation

@MainActor
final class ThreadWindowWebHost {
    struct InitialPromptPayload: Encodable, Equatable {
        let clientRequestId: String
        let text: String
        let attachments: [UserMessageAttachmentPayload]
        let actionBinding: ActionBindingPayload?

        enum CodingKeys: String, CodingKey {
            case clientRequestId
            case text
            case attachments
            case actionBinding
        }

        func encode(to encoder: Encoder) throws {
            var container = encoder.container(keyedBy: CodingKeys.self)
            try container.encode(clientRequestId, forKey: .clientRequestId)
            try container.encode(text, forKey: .text)
            try container.encode(attachments, forKey: .attachments)
            if let actionBinding {
                try container.encode(actionBinding, forKey: .actionBinding)
            } else {
                try container.encodeNil(forKey: .actionBinding)
            }
        }
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
        let json: String
        if
            let data = try? JSONEncoder().encode(config),
            let encoded = String(data: data, encoding: .utf8)
        {
            json = encoded
        } else {
            json = "{}"
        }
        return """
        (() => {
          window.handAgentThreadWindowConfig = \(json);
          window.handAgentPendingInitialPrompts = Array.isArray(window.handAgentPendingInitialPrompts)
            ? window.handAgentPendingInitialPrompts
            : [];
          if (typeof window.handAgentReceiveInitialPrompt !== "function") {
            window.handAgentReceiveInitialPrompt = (payload) => {
              window.handAgentPendingInitialPrompts.push(payload);
            };
          }
        })();
        """
    }

    init(threadWebSocketURL: URL, webAppURL: URL) {
        self.threadWebSocketURL = threadWebSocketURL
        self.webAppURL = webAppURL
    }

    func enqueue(initialPrompt prompt: PromptSubmission) {
        pendingInitialPrompts.append(
            InitialPromptPayload(
                clientRequestId: UUID().uuidString,
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

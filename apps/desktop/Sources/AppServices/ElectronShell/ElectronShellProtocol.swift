import Foundation

struct ElectronInitialPromptPayload: Encodable, Equatable {
    let clientRequestId: String
    let text: String
    let attachments: [UserMessageAttachmentPayload]
    let actionBinding: ActionBindingPayload?

    init(
        clientRequestId: String,
        text: String,
        attachments: [UserMessageAttachmentPayload],
        actionBinding: ActionBindingPayload?
    ) {
        self.clientRequestId = clientRequestId
        self.text = text
        self.attachments = attachments
        self.actionBinding = actionBinding
    }

    init(prompt: PromptSubmission, clientRequestId: String = UUID().uuidString) {
        self.clientRequestId = clientRequestId
        self.text = prompt.composed
        self.attachments = prompt.socketAttachments
        self.actionBinding = prompt.actionBinding
    }

    private enum CodingKeys: String, CodingKey {
        case clientRequestId, text, attachments, actionBinding
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

enum ElectronShellCommand: Encodable, Equatable {
    case openInitialPrompt(commandId: String, payload: ElectronInitialPromptPayload)
    case openHistory(commandId: String)
    case focus(commandId: String, threadId: String?)
    case showActivityWindow(commandId: String)
    case themeChanged(commandId: String, theme: HostThemePayload)
    case shutdown(commandId: String)

    private enum CodingKeys: String, CodingKey {
        case channel, type, commandId, payload, threadId, theme
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode("electron_shell", forKey: .channel)
        switch self {
        case .openInitialPrompt(let commandId, let payload):
            try container.encode("thread_window.open_initial_prompt", forKey: .type)
            try container.encode(commandId, forKey: .commandId)
            try container.encode(payload, forKey: .payload)
        case .openHistory(let commandId):
            try container.encode("thread_window.open_history", forKey: .type)
            try container.encode(commandId, forKey: .commandId)
        case .focus(let commandId, let threadId):
            try container.encode("thread_window.focus", forKey: .type)
            try container.encode(commandId, forKey: .commandId)
            try container.encodeIfPresent(threadId, forKey: .threadId)
        case .showActivityWindow(let commandId):
            try container.encode("activity_window.show", forKey: .type)
            try container.encode(commandId, forKey: .commandId)
        case .themeChanged(let commandId, let theme):
            try container.encode("theme.changed", forKey: .type)
            try container.encode(commandId, forKey: .commandId)
            try container.encode(theme, forKey: .theme)
        case .shutdown(let commandId):
            try container.encode("shutdown", forKey: .type)
            try container.encode(commandId, forKey: .commandId)
        }
    }
}

enum ElectronShellEvent: Decodable, Equatable {
    case electronReady(timestamp: String)
    case threadWindowPrepared(timestamp: String)
    case threadWindowPrepareFailed(message: String)
    case commandAck(commandId: String, ok: Bool, error: String?)
    case threadWindowClosed(timestamp: String, wasVisible: Bool)
    case rendererCrashed(window: ElectronShellRendererWindow, reason: String)
    case agentServerHealth(available: Bool, message: String?)
    case promptPanelShowRequested(reason: PromptPanelShowRequestReason)

    private enum CodingKeys: String, CodingKey {
        case channel, type, timestamp, commandId, ok, error, window, reason, available, message, wasVisible
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let channel = try container.decode(String.self, forKey: .channel)
        guard channel == "electron_shell" else {
            throw DecodingError.dataCorruptedError(
                forKey: .channel,
                in: container,
                debugDescription: "unsupported channel"
            )
        }

        let type = try container.decode(String.self, forKey: .type)
        switch type {
        case "electron.ready":
            self = .electronReady(timestamp: try container.decode(String.self, forKey: .timestamp))
        case "command.ack":
            self = .commandAck(
                commandId: try container.decode(String.self, forKey: .commandId),
                ok: try container.decode(Bool.self, forKey: .ok),
                error: try container.decodeIfPresent(String.self, forKey: .error)
            )
        case "thread_window.closed":
            self = .threadWindowClosed(
                timestamp: try container.decode(String.self, forKey: .timestamp),
                wasVisible: try container.decode(Bool.self, forKey: .wasVisible)
            )
        case "renderer.crashed":
            self = .rendererCrashed(
                window: try container.decode(ElectronShellRendererWindow.self, forKey: .window),
                reason: try container.decode(String.self, forKey: .reason)
            )
        case "agent_server.health":
            self = .agentServerHealth(
                available: try container.decode(Bool.self, forKey: .available),
                message: try container.decodeIfPresent(String.self, forKey: .message)
            )
        case "prompt_panel.show_requested":
            self = .promptPanelShowRequested(
                reason: try container.decode(PromptPanelShowRequestReason.self, forKey: .reason)
            )
        default:
            if type == "thread_window." + "prepared" {
                self = .threadWindowPrepared(timestamp: try container.decode(String.self, forKey: .timestamp))
                return
            }
            if type == "thread_window." + "prepare_failed" {
                self = .threadWindowPrepareFailed(message: try container.decode(String.self, forKey: .message))
                return
            }
            throw DecodingError.dataCorruptedError(
                forKey: .type,
                in: container,
                debugDescription: "unsupported event"
            )
        }
    }
}

enum ElectronShellRendererWindow: String, Decodable, Equatable {
    case thread
    case activity
}

enum PromptPanelShowRequestReason: String, Decodable, Equatable {
    case activityWindowClickedWithoutThread = "activity_window.clicked_without_thread"
}

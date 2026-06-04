import AppKit
import Foundation

@Observable
@MainActor
final class SessionWindowLifecycle {
    private(set) var viewModel: SessionWindowViewModel?

    @ObservationIgnored private let registry: SessionRegistry
    @ObservationIgnored private let windowPresenter: any SessionWindowPresenting
    @ObservationIgnored private let agentServerURL: URL
    @ObservationIgnored private let activationPolicy: AppActivationPolicyCoordinator
    @ObservationIgnored private let setActivationPolicy: @MainActor (NSApplication.ActivationPolicy) -> Void
    @ObservationIgnored private var window: NSWindow?
    @ObservationIgnored private var sharedConnection: AppServerConnection?
    @ObservationIgnored private var sharedEventBus: SessionEventBus<SessionEvent>?

    init(
        registry: SessionRegistry,
        windowPresenter: any SessionWindowPresenting,
        agentServerURL: URL,
        activationPolicy: AppActivationPolicyCoordinator,
        setActivationPolicy: @escaping @MainActor (NSApplication.ActivationPolicy) -> Void
    ) {
        self.registry = registry
        self.windowPresenter = windowPresenter
        self.agentServerURL = agentServerURL
        self.activationPolicy = activationPolicy
        self.setActivationPolicy = setActivationPolicy
        setActivationPolicy(activationPolicy.policyAfterUpdatingOpenSessionWindows(by: 0))
    }

    func openOrFocusHistory(onClosed: @escaping @MainActor () -> Void) {
        let model = ensureWindow(onClosed: onClosed)
        model.openOrFocusHistory()
    }

    func createTabWithInitialPrompt(
        _ prompt: PromptSubmission,
        onClosed: @escaping @MainActor () -> Void
    ) {
        let model = ensureWindow(onClosed: onClosed)
        model.createTabWithInitialPrompt(
            prompt.composed,
            attachments: prompt.socketAttachments,
            actionBinding: prompt.actionBinding
        )
    }

    func createNewTabWithInitialPrompt(
        _ prompt: PromptSubmission,
        onClosed: @escaping @MainActor () -> Void
    ) {
        createTabWithInitialPrompt(prompt, onClosed: onClosed)
    }

    @discardableResult
    func focus() -> Bool {
        guard let window else { return false }
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        return true
    }

    func close() {
        viewModel?.tabs.forEach { tab in
            syncSummary(from: tab, windowIsOpen: false)
            tab.disconnect()
        }
        viewModel = nil
        sharedConnection?.disconnect()
        sharedConnection = nil
        sharedEventBus = nil
        if window != nil {
            window = nil
            setActivationPolicy(activationPolicy.policyAfterUpdatingOpenSessionWindows(by: -1))
        }
    }

    private func ensureWindow(onClosed: @escaping @MainActor () -> Void) -> SessionWindowViewModel {
        if let window, let viewModel {
            window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return viewModel
        }

        let eventBus = SessionEventBus<SessionEvent>()
        let connection = AppServerConnection(serverURL: agentServerURL)
        let model = SessionWindowViewModel(
            subscribeToSessionEvents: { sessionID, handler in
                eventBus.subscribe(sessionID: sessionID, handler: handler)
            },
            subscribeToGlobalEvents: { handler in
                eventBus.subscribeGlobal(handler: handler)
            },
            sendCommand: { [weak connection] command in
                guard let connection,
                      let text = try? SessionProtocolClient.encode(command: command) else { return }
                connection.send(text: text)
            },
            sendResponse: { [weak connection] response in
                guard let connection,
                      let text = try? SessionProtocolClient.encode(response: response) else { return }
                connection.send(text: text)
            },
            onTabStateChanged: { [weak self] tab in
                self?.syncSummary(from: tab, windowIsOpen: true)
            },
            onTabClosed: { [weak self] tab in
                self?.syncSummary(from: tab, windowIsOpen: false)
            }
        )
        connection.onStateChange = { [weak model] state in
            Task { @MainActor in
                model?.handleConnectionState(state.asSessionConnectionState)
            }
        }
        connection.onTextMessage = { [weak eventBus] text in
            Task { @MainActor in
                guard let inbound = try? SessionProtocolClient.decodeInboundMessage(from: text) else { return }
                publishInboundMessage(inbound, on: eventBus)
            }
        }
        connection.connect()

        viewModel = model
        sharedConnection = connection
        sharedEventBus = eventBus
        window = windowPresenter.present(viewModel: model) {
            Task { @MainActor in onClosed() }
        }
        if window != nil {
            setActivationPolicy(activationPolicy.policyAfterUpdatingOpenSessionWindows(by: 1))
        }
        return model
    }

    private func syncSummary(from tab: SessionTabViewModel, windowIsOpen: Bool) {
        registry.upsert(
            SessionSummary(
                sessionId: tab.sessionID,
                isRunning: tab.status.isRunning,
                latestSummary: latestNonEmptyMessageText(from: tab) ?? "",
                lastActiveAt: .now,
                windowIsOpen: windowIsOpen
            )
        )
    }

    private func latestNonEmptyMessageText(from tab: SessionTabViewModel) -> String? {
        tab.messages
            .reversed()
            .map(\.text)
            .first { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    }
}

private extension AppServerConnectionState {
    var asSessionConnectionState: SessionConnectionState {
        switch self {
        case .disconnected:
            return .disconnected
        case .connecting:
            return .connecting
        case .connected:
            return .connected
        case .reconnecting:
            return .reconnecting
        }
    }
}

@MainActor
private func publishInboundMessage(
    _ inbound: SessionProtocolClient.InboundMessage,
    on eventBus: SessionEventBus<SessionEvent>?
) {
    guard let eventBus else { return }

    switch inbound {
    case .event(let event):
        routeProtocolEvent(event, on: eventBus)
    case .request(let request):
        let translated = translateProtocolRequest(request)
        switch request {
        case .permissionAsk(let ask):
            eventBus.publish(translated, to: ask.sessionId)
        case .workspaceAsk(let ask):
            eventBus.publish(translated, to: ask.sessionId)
        }
    }
}

@MainActor
private func routeProtocolEvent(
    _ event: SessionProtocolClient.Event,
    on eventBus: SessionEventBus<SessionEvent>
) {
    switch event {
    case .sessionCreated:
        eventBus.publishGlobal(translateProtocolEvent(event))
    case .sessionSnapshot(let value):
        eventBus.publish(translateProtocolEvent(event), to: value.sessionId)
    case .userMessageRecorded(let value):
        eventBus.publish(translateProtocolEvent(event), to: value.sessionId)
    case .turnStarted(let value):
        eventBus.publish(translateProtocolEvent(event), to: value.sessionId)
    case .assistantDelta(let value):
        eventBus.publish(translateProtocolEvent(event), to: value.sessionId)
    case .toolStarted(let value):
        eventBus.publish(translateProtocolEvent(event), to: value.sessionId)
    case .toolFinished(let value):
        eventBus.publish(translateProtocolEvent(event), to: value.sessionId)
    case .turnCompleted(let value):
        eventBus.publish(translateProtocolEvent(event), to: value.sessionId)
    case .sessionStatusChanged(let value):
        eventBus.publish(translateProtocolEvent(event), to: value.sessionId)
    case .sessionsListed, .sessionDeleted:
        eventBus.publishGlobal(translateProtocolEvent(event))
    case .sessionError(let value):
        if let sessionId = value.sessionId {
            eventBus.publish(translateProtocolEvent(event), to: sessionId)
        } else {
            eventBus.publishGlobal(translateProtocolEvent(event))
        }
    }
}

@MainActor
private func translateProtocolEvent(_ event: SessionProtocolClient.Event) -> SessionEvent {
    switch event {
    case .sessionCreated(let value):
        return .createSessionResponse(
            sessionID: value.sessionId,
            title: value.title,
            responseMessageID: value.commandId ?? ""
        )
    case .sessionSnapshot(let value):
        return .sessionSnapshot(
            messages: value.messages,
            status: value.status.rawValue
        )
    case .userMessageRecorded(let value):
        return .userMessage(
            messageID: value.messageId,
            text: value.text,
            timestamp: value.timestamp
        )
    case .turnStarted:
        return .status(value: SessionRunStatus.running.rawValue)
    case .assistantDelta(let value):
        return .assistantMessageDelta(
            messageID: value.itemId,
            text: value.text,
            timestamp: value.timestamp
        )
    case .toolStarted(let value):
        return .toolMessage(
            messageID: value.itemId,
            name: value.name,
            text: value.inputJSON,
            status: "running",
            timestamp: value.timestamp
        )
    case .toolFinished(let value):
        return .toolMessage(
            messageID: value.itemId,
            name: value.name,
            text: value.output,
            status: value.status.rawValue,
            timestamp: value.timestamp
        )
    case .turnCompleted(let value):
        return .status(value: value.status.rawValue)
    case .sessionStatusChanged(let value):
        return .status(value: value.status.rawValue)
    case .sessionsListed(let value):
        return .sessionList(sessions: value.sessions)
    case .sessionDeleted(let value):
        return .deleteSessionResponse(
            targetSessionID: value.targetSessionId,
            status: value.status
        )
    case .sessionError(let value):
        if value.sessionId == nil, let commandId = value.commandId {
            return .userMessageFailed(
                reason: value.code ?? "invalid_request",
                message: value.message,
                responseMessageID: commandId
            )
        }
        if value.code == "not_found" {
            return .sessionOpenFailed(
                reason: value.code ?? "not_found",
                message: value.message
            )
        }
        return .error(
            messageID: value.eventId,
            message: value.message,
            timestamp: value.timestamp
        )
    }
}

@MainActor
private func translateProtocolRequest(_ request: SessionProtocolClient.Request) -> SessionEvent {
    switch request {
    case .permissionAsk(let value):
        return .permissionRequest(
            requestId: value.requestId,
            toolName: value.toolName,
            toolCallId: value.toolCallId,
            argumentsJSON: value.argumentsJSON
        )
    case .workspaceAsk(let value):
        return .workspaceAskRequest(
            requestId: value.requestId,
            prompt: value.prompt,
            candidates: value.candidates
        )
    }
}

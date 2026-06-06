import AppKit
import Foundation

@Observable
@MainActor
final class ThreadWindowLifecycle {
    private(set) var viewModel: ThreadWindowViewModel?

    @ObservationIgnored private let registry: ThreadRegistry
    @ObservationIgnored private let windowPresenter: any ThreadWindowPresenting
    @ObservationIgnored private let appServer: any AppServerManaging
    @ObservationIgnored private let activationPolicy: AppActivationPolicyCoordinator
    @ObservationIgnored private let setActivationPolicy: @MainActor (NSApplication.ActivationPolicy) -> Void
    @ObservationIgnored private var window: NSWindow?
    @ObservationIgnored private var sharedEventBus: ThreadEventBus<ThreadEvent>?

    init(
        registry: ThreadRegistry,
        windowPresenter: any ThreadWindowPresenting,
        appServer: any AppServerManaging,
        activationPolicy: AppActivationPolicyCoordinator,
        setActivationPolicy: @escaping @MainActor (NSApplication.ActivationPolicy) -> Void
    ) {
        self.registry = registry
        self.windowPresenter = windowPresenter
        self.appServer = appServer
        self.activationPolicy = activationPolicy
        self.setActivationPolicy = setActivationPolicy
        setActivationPolicy(activationPolicy.policyAfterUpdatingOpenThreadWindows(by: 0))
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
        appServer.disconnectThreadClient()
        appServer.onThreadConnectionStateChange = nil
        appServer.onThreadMessage = nil
        sharedEventBus = nil
        if window != nil {
            window = nil
            setActivationPolicy(activationPolicy.policyAfterUpdatingOpenThreadWindows(by: -1))
        }
    }

    private func ensureWindow(onClosed: @escaping @MainActor () -> Void) -> ThreadWindowViewModel {
        if let window, let viewModel {
            window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return viewModel
        }

        let eventBus = ThreadEventBus<ThreadEvent>()
        let model = ThreadWindowViewModel(
            subscribeToThreadEvents: { threadID, handler in
                eventBus.subscribe(threadID: threadID, handler: handler)
            },
            subscribeToGlobalEvents: { handler in
                eventBus.subscribeGlobal(handler: handler)
            },
            sendCommand: { [weak self] command in
                guard let text = try? ThreadProtocolClient.encode(command: command) else { return }
                self?.appServer.sendThreadMessage(text)
            },
            sendResponse: { [weak self] response in
                guard let text = try? ThreadProtocolClient.encode(response: response) else { return }
                self?.appServer.sendThreadMessage(text)
            },
            onTabStateChanged: { [weak self] tab in
                self?.syncSummary(from: tab, windowIsOpen: true)
            },
            onTabClosed: { [weak self] tab in
                self?.syncSummary(from: tab, windowIsOpen: false)
            }
        )
        appServer.onThreadConnectionStateChange = { [weak model] state in
            model?.handleConnectionState(state.asThreadConnectionState)
        }
        appServer.onThreadMessage = { [weak eventBus] text in
            guard let inbound = try? ThreadProtocolClient.decodeInboundMessage(from: text) else { return }
            publishInboundMessage(inbound, on: eventBus)
        }
        appServer.connectThreadClient()

        viewModel = model
        sharedEventBus = eventBus
        window = windowPresenter.present(viewModel: model) {
            Task { @MainActor in onClosed() }
        }
        if window != nil {
            setActivationPolicy(activationPolicy.policyAfterUpdatingOpenThreadWindows(by: 1))
        }
        return model
    }

    private func syncSummary(from tab: ThreadTabViewModel, windowIsOpen: Bool) {
        registry.upsert(
            ThreadSummary(
                threadId: tab.threadID,
                isRunning: tab.status.isRunning,
                latestSummary: latestNonEmptyMessageText(from: tab) ?? "",
                lastActiveAt: .now,
                windowIsOpen: windowIsOpen
            )
        )
    }

    private func latestNonEmptyMessageText(from tab: ThreadTabViewModel) -> String? {
        tab.messages
            .reversed()
            .map(\.text)
            .first { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    }
}

private extension AppServerConnectionState {
    var asThreadConnectionState: ThreadConnectionState {
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
    _ inbound: ThreadProtocolClient.InboundMessage,
    on eventBus: ThreadEventBus<ThreadEvent>?
) {
    guard let eventBus else { return }

    switch inbound {
    case .notification(let event):
        routeProtocolEvent(event, on: eventBus)
    case .request(let request):
        let translated = translateProtocolRequest(request)
        switch request {
        case .permissionRequested(let ask):
            eventBus.publish(translated, to: ask.threadId)
        case .workspaceRequested(let ask):
            eventBus.publish(translated, to: ask.threadId)
        }
    }
}

@MainActor
private func routeProtocolEvent(
    _ event: ThreadProtocolClient.Notification,
    on eventBus: ThreadEventBus<ThreadEvent>
) {
    switch event {
    case .threadStarted:
        eventBus.publishGlobal(translateProtocolEvent(event))
    case .threadSnapshot(let value):
        eventBus.publish(translateProtocolEvent(event), to: value.threadId)
    case .userMessageRecorded(let value):
        eventBus.publish(translateProtocolEvent(event), to: value.threadId)
    case .turnStarted(let value):
        eventBus.publish(translateProtocolEvent(event), to: value.threadId)
    case .assistantDelta(let value):
        eventBus.publish(translateProtocolEvent(event), to: value.threadId)
    case .toolStarted(let value):
        eventBus.publish(translateProtocolEvent(event), to: value.threadId)
    case .toolFinished(let value):
        eventBus.publish(translateProtocolEvent(event), to: value.threadId)
    case .turnCompleted(let value):
        eventBus.publish(translateProtocolEvent(event), to: value.threadId)
    case .threadStatusChanged(let value):
        eventBus.publish(translateProtocolEvent(event), to: value.threadId)
    case .threadListed, .threadDeleted:
        eventBus.publishGlobal(translateProtocolEvent(event))
    case .threadError(let value):
        if let threadId = value.threadId {
            eventBus.publish(translateProtocolEvent(event), to: threadId)
        } else {
            eventBus.publishGlobal(translateProtocolEvent(event))
        }
    }
}

@MainActor
private func translateProtocolEvent(_ event: ThreadProtocolClient.Notification) -> ThreadEvent {
    switch event {
    case .threadStarted(let value):
        return .threadStarted(
            threadID: value.threadId,
            title: value.preview,
            responseMessageID: value.commandId ?? ""
        )
    case .threadSnapshot(let value):
        return .threadSnapshot(
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
        return .status(value: ThreadRunStatus.running.rawValue)
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
    case .threadStatusChanged(let value):
        return .status(value: value.status.rawValue)
    case .threadListed(let value):
        return .threadList(threads: value.threads)
    case .threadDeleted(let value):
        return .threadDeleted(
            targetThreadID: value.targetThreadId,
            status: value.status
        )
    case .threadError(let value):
        if value.threadId == nil, let commandId = value.commandId {
            return .threadStartFailed(
                reason: value.code ?? "invalid_request",
                message: value.message,
                responseMessageID: commandId
            )
        }
        if value.code == "not_found" {
            return .threadOpenFailed(
                reason: value.code ?? "not_found",
                message: value.message
            )
        }
        return .error(
            messageID: value.notificationId,
            message: value.message,
            timestamp: value.timestamp
        )
    }
}

@MainActor
private func translateProtocolRequest(_ request: ThreadProtocolClient.Request) -> ThreadEvent {
    switch request {
    case .permissionRequested(let value):
        return .permissionRequest(
            requestId: value.requestId,
            toolName: value.toolName,
            toolCallId: value.toolCallId,
            argumentsJSON: value.argumentsJSON
        )
    case .workspaceRequested(let value):
        return .workspaceAskRequest(
            requestId: value.requestId,
            prompt: value.prompt,
            candidates: value.candidates
        )
    }
}

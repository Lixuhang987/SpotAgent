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
        appServer.onThreadEvent = nil
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
                self?.send(command)
            },
            sendResponse: { [weak self] response in
                self?.send(response)
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
        appServer.onThreadEvent = { [weak eventBus] event in
            publishAppServerThreadEvent(event, on: eventBus)
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

    private func send(_ command: ThreadWindowCommand) {
        switch command {
        case let .threadStart(commandId, timestamp, workspaceId, actionBinding):
            appServer.startThread(
                commandId: commandId,
                timestamp: timestamp,
                workspaceId: workspaceId,
                actionBinding: actionBinding
            )
        case let .threadResume(threadId, commandId, timestamp):
            appServer.resumeThread(threadId: threadId, commandId: commandId, timestamp: timestamp)
        case let .turnStart(threadId, commandId, timestamp, text, attachments):
            appServer.startTurn(
                threadId: threadId,
                commandId: commandId,
                timestamp: timestamp,
                text: text,
                attachments: attachments
            )
        case let .turnInterrupt(threadId, commandId, timestamp):
            appServer.interruptTurn(threadId: threadId, commandId: commandId, timestamp: timestamp)
        case let .threadList(commandId, timestamp):
            appServer.listThreads(commandId: commandId, timestamp: timestamp)
        case let .threadDelete(commandId, timestamp, targetThreadId):
            appServer.deleteThread(commandId: commandId, timestamp: timestamp, targetThreadId: targetThreadId)
        }
    }

    private func send(_ response: ThreadWindowResponse) {
        switch response {
        case let .permissionAnswered(requestId, timestamp, decision, scope, reason):
            appServer.answerPermission(
                requestId: requestId,
                timestamp: timestamp,
                decision: AppServerPermissionDecision(rawValue: decision.rawValue) ?? .deny,
                scope: scope.flatMap { AppServerPermissionScope(rawValue: $0.rawValue) },
                reason: reason
            )
        case let .workspaceAnswered(requestId, timestamp, workspaceId, cancelled):
            appServer.answerWorkspace(
                requestId: requestId,
                timestamp: timestamp,
                workspaceId: workspaceId,
                cancelled: cancelled
            )
        }
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
private func publishAppServerThreadEvent(
    _ event: AppServerThreadEvent,
    on eventBus: ThreadEventBus<ThreadEvent>?
) {
    guard let eventBus else { return }

    switch event {
    case .global(let threadEvent):
        eventBus.publishGlobal(threadEvent)
    case let .thread(threadId, threadEvent):
        eventBus.publish(threadEvent, to: threadId)
    }
}

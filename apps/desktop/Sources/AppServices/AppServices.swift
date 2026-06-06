import AppKit
import Foundation
import KeyboardShortcuts
import SwiftUI

@MainActor
protocol ThreadWindowPresenting {
    func present(
        viewModel: ThreadWindowViewModel,
        onClose: @escaping () -> Void
    ) -> NSWindow?
}

@MainActor
protocol SettingsWindowPresenting {
    func present(
        settingsViewModel: AgentSettingsViewModel,
        toolSettingsViewModel: ToolSettingsViewModel,
        pluginSettingsViewModel: PluginSettingsViewModel,
        appendPromptSettingsViewModel: AppendPromptSettingsViewModel,
        mcpSettingsViewModel: MCPSettingsViewModel,
        permissionRulesViewModel: PermissionRulesViewModel,
        workspaceViewModel: WorkspaceSettingsViewModel,
        shortcutActions: [ActionDefinition],
        onClose: @escaping () -> Void
    ) -> NSWindow?
}

@MainActor
protocol HotkeyRegistering {
    func registerShowPromptPanel(handler: @escaping () -> Void)
    func registerCaptureSelection(handler: @escaping () -> Void)
    func registerCaptureRegion(handler: @escaping () -> Void)
    func registerActionShortcut(
        name: KeyboardShortcuts.Name,
        defaultShortcut: KeyboardShortcuts.Shortcut?,
        handler: @escaping () -> Void
    )
    func unregisterActionShortcut(name: KeyboardShortcuts.Name)
}

@MainActor
protocol FatalAlertPresenting {
    func showFatal(title: String, message: String, primaryButtonTitle: String, secondaryButtonTitle: String?, onSecondary: (() -> Void)?)
}

@MainActor
final class AppServices {
    let appServer: any AppServerManaging
    let threadRegistry: ThreadRegistry
    let settingsStore: AgentSettingsStore
    let threadHistoryStore: ThreadHistoryStore
    let actionManifestStore: ActionManifestStore
    let appServerURL: URL
    let hotkeyRegistrar: any HotkeyRegistering
    let threadWindowPresenter: any ThreadWindowPresenting
    let settingsWindowPresenter: any SettingsWindowPresenting
    let fatalAlertPresenter: any FatalAlertPresenting
    let setActivationPolicy: @MainActor (NSApplication.ActivationPolicy) -> Void
    let showsStatusBubble: Bool

    init(
        appServer: (any AppServerManaging)? = nil,
        threadRegistry: ThreadRegistry = ThreadRegistry(),
        settingsStore: AgentSettingsStore = AgentSettingsStore(),
        threadHistoryStore: ThreadHistoryStore = ThreadHistoryStore(),
        actionManifestStore: ActionManifestStore = ActionManifestStore(),
        appServerURL: URL = URL(string: "ws://127.0.0.1:4317/api/thread")!,
        hotkeyRegistrar: any HotkeyRegistering = ProductionHotkeyRegistrar(),
        threadWindowPresenter: any ThreadWindowPresenting = ProductionThreadWindowPresenter(),
        settingsWindowPresenter: any SettingsWindowPresenting = ProductionSettingsWindowPresenter(),
        fatalAlertPresenter: any FatalAlertPresenting = ProductionFatalAlertPresenter(),
        setActivationPolicy: @escaping @MainActor (NSApplication.ActivationPolicy) -> Void = {
            NSApplication.shared.setActivationPolicy($0)
        },
        showsStatusBubble: Bool = true
    ) {
        self.appServer = appServer ?? AppServer(
            agentServer: AgentServerService(),
            client: AppServerClient(
                connection: AppServerConnection(serverURL: appServerURL),
                platformBridge: PlatformBridgeService()
            )
        )
        self.threadRegistry = threadRegistry
        self.settingsStore = settingsStore
        self.threadHistoryStore = threadHistoryStore
        self.actionManifestStore = actionManifestStore
        self.appServerURL = appServerURL
        self.hotkeyRegistrar = hotkeyRegistrar
        self.threadWindowPresenter = threadWindowPresenter
        self.settingsWindowPresenter = settingsWindowPresenter
        self.fatalAlertPresenter = fatalAlertPresenter
        self.setActivationPolicy = setActivationPolicy
        self.showsStatusBubble = showsStatusBubble
    }

    static func testing(
        setActivationPolicy: @escaping @MainActor (NSApplication.ActivationPolicy) -> Void = { _ in },
        settingsWindowPresenter: any SettingsWindowPresenting = NopSettingsWindowPresenter(),
        actionManifestStore: ActionManifestStore = ActionManifestStore(
            pluginsDirectoryURL: URL(fileURLWithPath: "/dev/null", isDirectory: true)
        )
    ) -> AppServices {
        AppServices(
            appServer: NopAppServer(),
            actionManifestStore: actionManifestStore,
            appServerURL: URL(string: "ws://127.0.0.1:0/noop")!,
            hotkeyRegistrar: NopHotkeyRegistrar(),
            threadWindowPresenter: NopThreadWindowPresenter(),
            settingsWindowPresenter: settingsWindowPresenter,
            fatalAlertPresenter: NopFatalAlertPresenter(),
            setActivationPolicy: setActivationPolicy,
            showsStatusBubble: false
        )
    }
}

@MainActor
final class NopAppServer: AppServerManaging {
    var threadConnectionState: AppServerConnectionState = .disconnected
    var isAvailable = true
    var startupErrorMessage: String?
    var onAvailabilityChange: ((Bool) -> Void)?
    var onFatalError: ((String) -> Void)?
    var onThreadConnectionStateChange: ((AppServerConnectionState) -> Void)?
    var onInboundMessage: ((ThreadProtocolClient.InboundMessage) -> Void)?

    func start() {}
    func stop() {}
    func connectThreadClient() {}
    func disconnectThreadClient() {}
    func startThread(commandId: String, timestamp: String, workspaceId: String?, actionBinding: ActionBindingPayload?) {}
    func resumeThread(threadId: String, commandId: String, timestamp: String) {}
    func listThreads(commandId: String, timestamp: String) {}
    func deleteThread(commandId: String, timestamp: String, targetThreadId: String) {}
    func startTurn(
        threadId: String,
        commandId: String,
        timestamp: String,
        text: String,
        attachments: [UserMessageAttachmentPayload]
    ) {}
    func interruptTurn(threadId: String, commandId: String, timestamp: String) {}
    func answerPermission(
        requestId: String,
        timestamp: String,
        decision: ThreadProtocolClient.PermissionDecision,
        scope: ThreadProtocolClient.PermissionScope?,
        reason: String?
    ) {}
    func answerWorkspace(requestId: String, timestamp: String, workspaceId: String?, cancelled: Bool?) {}
}

@MainActor
final class NopHotkeyRegistrar: HotkeyRegistering {
    func registerShowPromptPanel(handler: @escaping () -> Void) {}
    func registerCaptureSelection(handler: @escaping () -> Void) {}
    func registerCaptureRegion(handler: @escaping () -> Void) {}
    func registerActionShortcut(
        name: KeyboardShortcuts.Name,
        defaultShortcut: KeyboardShortcuts.Shortcut?,
        handler: @escaping () -> Void
    ) {}
    func unregisterActionShortcut(name: KeyboardShortcuts.Name) {}
}

@MainActor
final class NopThreadWindowPresenter: ThreadWindowPresenting {
    private(set) var presentedViewModel: ThreadWindowViewModel?

    func present(viewModel: ThreadWindowViewModel, onClose: @escaping () -> Void) -> NSWindow? {
        presentedViewModel = viewModel
        return NSWindow()
    }
}

@MainActor
final class NopSettingsWindowPresenter: SettingsWindowPresenting {
    func present(
        settingsViewModel: AgentSettingsViewModel,
        toolSettingsViewModel: ToolSettingsViewModel,
        pluginSettingsViewModel: PluginSettingsViewModel,
        appendPromptSettingsViewModel: AppendPromptSettingsViewModel,
        mcpSettingsViewModel: MCPSettingsViewModel,
        permissionRulesViewModel: PermissionRulesViewModel,
        workspaceViewModel: WorkspaceSettingsViewModel,
        shortcutActions: [ActionDefinition],
        onClose: @escaping () -> Void
    ) -> NSWindow? {
        nil
    }
}

@MainActor
final class NopFatalAlertPresenter: FatalAlertPresenting {
    func showFatal(title: String, message: String, primaryButtonTitle: String, secondaryButtonTitle: String?, onSecondary: (() -> Void)?) {}
}

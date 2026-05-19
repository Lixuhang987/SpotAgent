import AppKit
import Foundation
import SwiftUI

@MainActor
protocol SessionWindowPresenting {
    func present(
        sessionID: String,
        viewModel: SessionViewModel,
        onClose: @escaping () -> Void
    ) -> NSWindow?
}

@MainActor
protocol SettingsWindowPresenting {
    func present(
        settingsViewModel: AgentSettingsViewModel,
        toolSettingsViewModel: ToolSettingsViewModel,
        permissionRulesViewModel: PermissionRulesViewModel,
        workspaceViewModel: WorkspaceSettingsViewModel,
        shortcutActions: [PromptAction],
        onClose: @escaping () -> Void
    ) -> NSWindow?
}

@MainActor
protocol HistoryWindowPresenting {
    func present(
        historyViewModel: SessionHistoryViewModel,
        onClose: @escaping () -> Void
    ) -> NSWindow?
}

@MainActor
protocol HotkeyRegistering {
    func registerShowPromptPanel(handler: @escaping () -> Void)
    func registerCaptureSelection(handler: @escaping () -> Void)
    func registerCaptureRegion(handler: @escaping () -> Void)
}

@MainActor
protocol FatalAlertPresenting {
    func showFatal(title: String, message: String, primaryButtonTitle: String, secondaryButtonTitle: String?, onSecondary: (() -> Void)?)
}

@MainActor
final class AppServices {
    let agentServer: any AgentServerStarting
    let sessionRegistry: SessionRegistry
    let settingsStore: AgentSettingsStore
    let sessionHistoryStore: SessionHistoryStore
    let agentServerURL: URL
    let platformBridgeFactory: @MainActor (URL) -> (any PlatformBridgeRunning)?
    let hotkeyRegistrar: any HotkeyRegistering
    let sessionWindowPresenter: any SessionWindowPresenting
    let settingsWindowPresenter: any SettingsWindowPresenting
    let historyWindowPresenter: any HistoryWindowPresenting
    let fatalAlertPresenter: any FatalAlertPresenting
    let setActivationPolicy: @MainActor (NSApplication.ActivationPolicy) -> Void
    let showsStatusBubble: Bool

    init(
        agentServer: any AgentServerStarting = AgentServerService(),
        sessionRegistry: SessionRegistry = SessionRegistry(),
        settingsStore: AgentSettingsStore = AgentSettingsStore(),
        sessionHistoryStore: SessionHistoryStore = SessionHistoryStore(),
        agentServerURL: URL = URL(string: "ws://127.0.0.1:4317/api/session")!,
        platformBridgeFactory: @escaping @MainActor (URL) -> (any PlatformBridgeRunning)? = { url in
            PlatformBridgeService(serverURL: url)
        },
        hotkeyRegistrar: any HotkeyRegistering = ProductionHotkeyRegistrar(),
        sessionWindowPresenter: any SessionWindowPresenting = ProductionSessionWindowPresenter(),
        settingsWindowPresenter: any SettingsWindowPresenting = ProductionSettingsWindowPresenter(),
        historyWindowPresenter: any HistoryWindowPresenting = ProductionHistoryWindowPresenter(),
        fatalAlertPresenter: any FatalAlertPresenting = ProductionFatalAlertPresenter(),
        setActivationPolicy: @escaping @MainActor (NSApplication.ActivationPolicy) -> Void = {
            NSApplication.shared.setActivationPolicy($0)
        },
        showsStatusBubble: Bool = true
    ) {
        self.agentServer = agentServer
        self.sessionRegistry = sessionRegistry
        self.settingsStore = settingsStore
        self.sessionHistoryStore = sessionHistoryStore
        self.agentServerURL = agentServerURL
        self.platformBridgeFactory = platformBridgeFactory
        self.hotkeyRegistrar = hotkeyRegistrar
        self.sessionWindowPresenter = sessionWindowPresenter
        self.settingsWindowPresenter = settingsWindowPresenter
        self.historyWindowPresenter = historyWindowPresenter
        self.fatalAlertPresenter = fatalAlertPresenter
        self.setActivationPolicy = setActivationPolicy
        self.showsStatusBubble = showsStatusBubble
    }

    static func testing(
        setActivationPolicy: @escaping @MainActor (NSApplication.ActivationPolicy) -> Void = { _ in },
        settingsWindowPresenter: any SettingsWindowPresenting = NopSettingsWindowPresenter()
    ) -> AppServices {
        AppServices(
            agentServer: NopAgentServerService(),
            agentServerURL: URL(string: "ws://127.0.0.1:0/noop")!,
            platformBridgeFactory: { _ in nil },
            hotkeyRegistrar: NopHotkeyRegistrar(),
            sessionWindowPresenter: NopSessionWindowPresenter(),
            settingsWindowPresenter: settingsWindowPresenter,
            historyWindowPresenter: NopHistoryWindowPresenter(),
            fatalAlertPresenter: NopFatalAlertPresenter(),
            setActivationPolicy: setActivationPolicy,
            showsStatusBubble: false
        )
    }
}

@MainActor
final class NopAgentServerService: AgentServerStarting {
    var lastStartupError: String?
    var fatalErrorMessage: String?
    var isAvailable = false
    var onAvailabilityChange: ((Bool) -> Void)?
    var onFatalError: ((String) -> Void)?
    func start() throws {}
    func stop() {}
}

@MainActor
final class NopHotkeyRegistrar: HotkeyRegistering {
    func registerShowPromptPanel(handler: @escaping () -> Void) {}
    func registerCaptureSelection(handler: @escaping () -> Void) {}
    func registerCaptureRegion(handler: @escaping () -> Void) {}
}

@MainActor
final class NopSessionWindowPresenter: SessionWindowPresenting {
    func present(sessionID: String, viewModel: SessionViewModel, onClose: @escaping () -> Void) -> NSWindow? {
        nil
    }
}

@MainActor
final class NopSettingsWindowPresenter: SettingsWindowPresenting {
    func present(
        settingsViewModel: AgentSettingsViewModel,
        toolSettingsViewModel: ToolSettingsViewModel,
        permissionRulesViewModel: PermissionRulesViewModel,
        workspaceViewModel: WorkspaceSettingsViewModel,
        shortcutActions: [PromptAction],
        onClose: @escaping () -> Void
    ) -> NSWindow? {
        nil
    }
}

@MainActor
final class NopHistoryWindowPresenter: HistoryWindowPresenting {
    func present(historyViewModel: SessionHistoryViewModel, onClose: @escaping () -> Void) -> NSWindow? {
        nil
    }
}

@MainActor
final class NopFatalAlertPresenter: FatalAlertPresenting {
    func showFatal(title: String, message: String, primaryButtonTitle: String, secondaryButtonTitle: String?, onSecondary: (() -> Void)?) {}
}

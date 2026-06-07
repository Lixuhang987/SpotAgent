import AppKit
import Foundation
import KeyboardShortcuts
import SwiftUI

@MainActor
protocol ThreadWindowPresenting {
    func present(
        host: ThreadWindowWebHost,
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
    let platformServerURL: URL
    let threadWindowWebAppURL: URL
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
        platformServerURL: URL = URL(string: "ws://127.0.0.1:4317/api/platform")!,
        threadWindowWebAppURL: URL = AppServices.defaultThreadWindowWebAppURL(),
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
            platformClient: PlatformBridgeConnectionClient(
                connection: AppServerConnection(serverURL: platformServerURL),
                platformBridge: PlatformBridgeService()
            )
        )
        self.threadRegistry = threadRegistry
        self.settingsStore = settingsStore
        self.threadHistoryStore = threadHistoryStore
        self.actionManifestStore = actionManifestStore
        self.appServerURL = appServerURL
        self.platformServerURL = platformServerURL
        self.threadWindowWebAppURL = threadWindowWebAppURL
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
            platformServerURL: URL(string: "ws://127.0.0.1:0/noop-platform")!,
            threadWindowWebAppURL: URL(fileURLWithPath: "/tmp/index.html"),
            hotkeyRegistrar: NopHotkeyRegistrar(),
            threadWindowPresenter: NopThreadWindowPresenter(),
            settingsWindowPresenter: settingsWindowPresenter,
            fatalAlertPresenter: NopFatalAlertPresenter(),
            setActivationPolicy: setActivationPolicy,
            showsStatusBubble: false
        )
    }

    static func defaultThreadWindowWebAppURL(
        environment: [String: String] = ProcessInfo.processInfo.environment,
        bundle: Bundle = .main,
        currentDirectoryURL: URL = URL(fileURLWithPath: FileManager.default.currentDirectoryPath, isDirectory: true)
    ) -> URL {
        if let rawURL = environment["HANDAGENT_THREAD_WINDOW_WEB_URL"], !rawURL.isEmpty {
            if let parsed = URL(string: rawURL), parsed.scheme != nil {
                return parsed
            }
            return URL(fileURLWithPath: rawURL)
        }

        return URL(string: "http://127.0.0.1:4317/thread-window/index.html")!
    }
}

@MainActor
final class NopAppServer: AppServerManaging {
    var isAvailable = true
    var startupErrorMessage: String?
    var onAvailabilityChange: ((Bool) -> Void)?
    var onFatalError: ((String) -> Void)?

    func start() {}
    func stop() {}
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
    private(set) var presentedHost: ThreadWindowWebHost?

    func present(host: ThreadWindowWebHost, onClose: @escaping () -> Void) -> NSWindow? {
        presentedHost = host
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

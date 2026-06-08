import AppKit
import Foundation
import KeyboardShortcuts
import SwiftUI

@MainActor
protocol ThreadWindowPresenting {
    func makeWindow(
        host: ThreadWindowWebHost,
        onClose: @escaping () -> Void
    ) -> NSWindow?
    func show(window: NSWindow)
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
struct ElectronShellLaunchConfiguration: Equatable {
    let launchPath: String
    let arguments: [String]
    let environment: [String: String]
    let currentDirectoryURL: URL?
}

@MainActor
struct AppServicesRuntime {
    let appServer: any AppServerManaging
    let threadWindowCommandClient: (any ThreadWindowCommanding)?
    let activityWindowCommandClient: (any ActivityWindowCommanding)?
}

@MainActor
final class AppServices {
    let appServer: any AppServerManaging
    let threadWindowCommandClient: (any ThreadWindowCommanding)?
    let activityWindowCommandClient: (any ActivityWindowCommanding)?
    let threadRegistry: ThreadRegistry
    let settingsStore: AgentSettingsStore
    let threadHistoryStore: ThreadHistoryStore
    let actionManifestStore: ActionManifestStore
    let appServerURL: URL
    let activityServerURL: URL
    let platformServerURL: URL
    let threadWindowWebAppURL: URL
    let hotkeyRegistrar: any HotkeyRegistering
    let threadWindowPresenter: any ThreadWindowPresenting
    let settingsWindowPresenter: any SettingsWindowPresenting
    let fatalAlertPresenter: any FatalAlertPresenting
    let setActivationPolicy: @MainActor (NSApplication.ActivationPolicy) -> Void
    let showsStatusBubble: Bool
    let showsFatalAlert: Bool

    init(
        appServer: (any AppServerManaging)? = nil,
        threadWindowCommandClient: (any ThreadWindowCommanding)? = nil,
        activityWindowCommandClient: (any ActivityWindowCommanding)? = nil,
        threadRegistry: ThreadRegistry = ThreadRegistry(),
        settingsStore: AgentSettingsStore = AgentSettingsStore(),
        threadHistoryStore: ThreadHistoryStore = ThreadHistoryStore(),
        actionManifestStore: ActionManifestStore = ActionManifestStore(),
        appServerURL: URL = URL(string: "ws://127.0.0.1:4317/api/thread")!,
        activityServerURL: URL = URL(string: "ws://127.0.0.1:4317/api/activity")!,
        platformServerURL: URL = URL(string: "ws://127.0.0.1:4317/api/platform")!,
        threadWindowWebAppURL: URL = AppServices.defaultThreadWindowWebAppURL(),
        hotkeyRegistrar: any HotkeyRegistering = ProductionHotkeyRegistrar(),
        threadWindowPresenter: any ThreadWindowPresenting = ProductionThreadWindowPresenter(),
        settingsWindowPresenter: any SettingsWindowPresenting = ProductionSettingsWindowPresenter(),
        fatalAlertPresenter: any FatalAlertPresenting = ProductionFatalAlertPresenter(),
        setActivationPolicy: @escaping @MainActor (NSApplication.ActivationPolicy) -> Void = {
            NSApplication.shared.setActivationPolicy($0)
        },
        showsStatusBubble: Bool = true,
        environment: [String: String] = ProcessInfo.processInfo.environment,
        showsFatalAlert: Bool = true
    ) {
        let resolvedThreadRegistry = threadRegistry
        let runtime = appServer == nil
            ? AppServices.defaultRuntime(
                environment: environment,
                platformServerURL: platformServerURL,
                activityServerURL: activityServerURL,
                threadRegistry: resolvedThreadRegistry
            )
            : nil
        self.appServer = appServer ?? runtime!.appServer
        self.threadWindowCommandClient = threadWindowCommandClient ?? runtime?.threadWindowCommandClient
        self.activityWindowCommandClient = activityWindowCommandClient ?? runtime?.activityWindowCommandClient
        self.threadRegistry = resolvedThreadRegistry
        self.settingsStore = settingsStore
        self.threadHistoryStore = threadHistoryStore
        self.actionManifestStore = actionManifestStore
        self.appServerURL = appServerURL
        self.activityServerURL = activityServerURL
        self.platformServerURL = platformServerURL
        self.threadWindowWebAppURL = threadWindowWebAppURL
        self.hotkeyRegistrar = hotkeyRegistrar
        self.threadWindowPresenter = threadWindowPresenter
        self.settingsWindowPresenter = settingsWindowPresenter
        self.fatalAlertPresenter = fatalAlertPresenter
        self.setActivationPolicy = setActivationPolicy
        self.showsStatusBubble = showsStatusBubble && self.activityWindowCommandClient == nil
        self.showsFatalAlert = showsFatalAlert
    }

    static func testing(
        setActivationPolicy: @escaping @MainActor (NSApplication.ActivationPolicy) -> Void = { _ in },
        threadWindowPresenter: any ThreadWindowPresenting = NopThreadWindowPresenter(),
        settingsWindowPresenter: any SettingsWindowPresenting = NopSettingsWindowPresenter(),
        actionManifestStore: ActionManifestStore = ActionManifestStore(
            pluginsDirectoryURL: URL(fileURLWithPath: "/dev/null", isDirectory: true)
        )
    ) -> AppServices {
        AppServices(
            appServer: NopAppServer(),
            actionManifestStore: actionManifestStore,
            appServerURL: URL(string: "ws://127.0.0.1:0/noop")!,
            activityServerURL: URL(string: "ws://127.0.0.1:0/noop-activity")!,
            platformServerURL: URL(string: "ws://127.0.0.1:0/noop-platform")!,
            threadWindowWebAppURL: URL(fileURLWithPath: "/tmp/index.html"),
            hotkeyRegistrar: NopHotkeyRegistrar(),
            threadWindowPresenter: threadWindowPresenter,
            settingsWindowPresenter: settingsWindowPresenter,
            fatalAlertPresenter: NopFatalAlertPresenter(),
            setActivationPolicy: setActivationPolicy,
            showsStatusBubble: false,
            showsFatalAlert: false
        )
    }

    static func defaultAppServer(
        environment: [String: String] = ProcessInfo.processInfo.environment,
        platformServerURL: URL,
        activityServerURL: URL = URL(string: "ws://127.0.0.1:4317/api/activity")!,
        threadRegistry: ThreadRegistry = ThreadRegistry()
    ) -> any AppServerManaging {
        defaultRuntime(
            environment: environment,
            platformServerURL: platformServerURL,
            activityServerURL: activityServerURL,
            threadRegistry: threadRegistry
        ).appServer
    }

    static func defaultRuntime(
        environment: [String: String] = ProcessInfo.processInfo.environment,
        platformServerURL: URL,
        activityServerURL: URL = URL(string: "ws://127.0.0.1:4317/api/activity")!,
        threadRegistry: ThreadRegistry = ThreadRegistry()
    ) -> AppServicesRuntime {
        let platformClient = PlatformBridgeConnectionClient(
            connection: AppServerConnection(serverURL: platformServerURL),
            platformBridge: PlatformBridgeService()
        )

        if environment["HANDAGENT_ELECTRON_SHELL"] == "1" {
            let configuration = defaultElectronShellLaunchConfiguration(environment: environment)
            let shell = ElectronShellProcess(
                launchPath: configuration.launchPath,
                arguments: configuration.arguments,
                environment: configuration.environment,
                currentDirectoryURL: configuration.currentDirectoryURL
            )
            let appServer = ElectronBackedAppServer(shell: shell, platformClient: platformClient)
            return AppServicesRuntime(
                appServer: appServer,
                threadWindowCommandClient: appServer,
                activityWindowCommandClient: appServer
            )
        }

        return AppServicesRuntime(
            appServer: AppServer(
                agentServer: AgentServerService(),
                platformClient: platformClient,
                activityClient: AgentActivityConnectionClient(
                    connection: AppServerConnection(serverURL: activityServerURL),
                    registry: threadRegistry
                )
            ),
            threadWindowCommandClient: nil,
            activityWindowCommandClient: nil
        )
    }

    static func defaultElectronShellLaunchConfiguration(
        environment: [String: String] = ProcessInfo.processInfo.environment,
        currentDirectoryURL: URL = URL(fileURLWithPath: FileManager.default.currentDirectoryPath, isDirectory: true),
        bundleExecutableURL: URL? = Bundle.main.executableURL,
        bundleResourceURL: URL? = Bundle.main.resourceURL,
        bundleURL: URL? = Bundle.main.bundleURL,
        fileExists: @escaping (String) -> Bool = { FileManager.default.fileExists(atPath: $0) }
    ) -> ElectronShellLaunchConfiguration {
        let bundledElectronMain = bundleResourceURL?
            .appendingPathComponent("ElectronShell/dist/main/main.js")
        let explicitElectronMain = environment["HANDAGENT_ELECTRON_MAIN"].flatMap { $0.isEmpty ? nil : $0 }
        let bundledElectronMainPath = bundledElectronMain.flatMap { fileExists($0.path) ? $0.path : nil }
        let electronMain = explicitElectronMain
            ?? bundledElectronMainPath
            ?? "apps/electron-shell/dist/main/main.js"
        let repoRoot = AgentServerRepositoryRootLocator(
            agentServerRelativePath: "apps/electron-shell/package.json",
            fileExists: fileExists
        ).locate(
            bundleExecutableURL: bundleExecutableURL,
            bundleResourceURL: bundleResourceURL,
            bundleURL: bundleURL,
            currentDirectoryURL: currentDirectoryURL
        )
        var launchEnvironment = environment
        if let repoRoot {
            launchEnvironment["HANDAGENT_REPO_ROOT"] = repoRoot.path
        }
        AgentServerRuntimeMode.apply(to: &launchEnvironment, resourcesURL: bundleResourceURL)

        if let electronBinary = environment["HANDAGENT_ELECTRON_BINARY"].flatMap({ $0.isEmpty ? nil : $0 }) {
            return ElectronShellLaunchConfiguration(
                launchPath: electronBinary,
                arguments: electronBinary == "/usr/bin/env" ? ["electron", electronMain] : [electronMain],
                environment: launchEnvironment,
                currentDirectoryURL: repoRoot
            )
        }

        if explicitElectronMain == nil && bundledElectronMainPath != nil {
            return ElectronShellLaunchConfiguration(
                launchPath: "/usr/bin/env",
                arguments: ["electron", electronMain],
                environment: launchEnvironment,
                currentDirectoryURL: nil
            )
        }

        return ElectronShellLaunchConfiguration(
            launchPath: "/usr/bin/env",
            arguments: [
                "pnpm",
                "--filter",
                "handagent-electron-shell",
                "exec",
                "electron",
                electronMain
            ],
            environment: launchEnvironment,
            currentDirectoryURL: repoRoot
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

    func makeWindow(host: ThreadWindowWebHost, onClose: @escaping () -> Void) -> NSWindow? {
        presentedHost = host
        return NSWindow()
    }

    func show(window: NSWindow) {}
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

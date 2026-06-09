import AppKit
import Foundation
import KeyboardShortcuts

@MainActor
protocol SettingsWindowPresenting {
    func present(
        settingsViewModel: AgentSettingsViewModel,
        appearanceViewModel: AppearanceSettingsViewModel,
        toolSettingsViewModel: ToolSettingsViewModel,
        pluginSettingsViewModel: PluginSettingsViewModel,
        appendPromptSettingsViewModel: AppendPromptSettingsViewModel,
        mcpSettingsViewModel: MCPSettingsViewModel,
        permissionRulesViewModel: PermissionRulesViewModel,
        workspaceViewModel: WorkspaceSettingsViewModel,
        shortcutActions: [ActionDefinition],
        appTheme: AppTheme,
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
    let threadWindowCommandClient: any ThreadWindowCommanding
    let activityWindowCommandClient: (any ActivityWindowCommanding)?
}

@MainActor
final class AppServices {
    let appServer: any AppServerManaging
    let threadWindowCommandClient: any ThreadWindowCommanding
    let activityWindowCommandClient: (any ActivityWindowCommanding)?
    let settingsStore: AgentSettingsStore
    let appearanceThemeService: AppearanceThemeService
    let appearanceChangeObserver: any AppearanceChangeObserving
    let actionManifestStore: ActionManifestStore
    let platformServerURL: URL
    let hotkeyRegistrar: any HotkeyRegistering
    let settingsWindowPresenter: any SettingsWindowPresenting
    let fatalAlertPresenter: any FatalAlertPresenting
    let setActivationPolicy: @MainActor (NSApplication.ActivationPolicy) -> Void
    let showsFatalAlert: Bool

    init(
        appServer: (any AppServerManaging)? = nil,
        threadWindowCommandClient: (any ThreadWindowCommanding)? = nil,
        activityWindowCommandClient: (any ActivityWindowCommanding)? = nil,
        settingsStore: AgentSettingsStore = AgentSettingsStore(),
        appearanceThemeService: AppearanceThemeService? = nil,
        appearanceChangeObserver: (any AppearanceChangeObserving)? = nil,
        actionManifestStore: ActionManifestStore = ActionManifestStore(),
        platformServerURL: URL = URL(string: "ws://127.0.0.1:4317/api/platform")!,
        hotkeyRegistrar: any HotkeyRegistering = ProductionHotkeyRegistrar(),
        settingsWindowPresenter: any SettingsWindowPresenting = ProductionSettingsWindowPresenter(),
        fatalAlertPresenter: any FatalAlertPresenting = ProductionFatalAlertPresenter(),
        setActivationPolicy: @escaping @MainActor (NSApplication.ActivationPolicy) -> Void = {
            NSApplication.shared.setActivationPolicy($0)
        },
        environment: [String: String] = ProcessInfo.processInfo.environment,
        showsFatalAlert: Bool = true
    ) {
        let runtime = appServer == nil
            ? AppServices.defaultRuntime(
                environment: environment,
                platformServerURL: platformServerURL
            )
            : nil
        self.appServer = appServer ?? runtime!.appServer
        self.threadWindowCommandClient = threadWindowCommandClient ?? runtime?.threadWindowCommandClient ?? NopThreadWindowCommandClient()
        self.activityWindowCommandClient = activityWindowCommandClient ?? runtime?.activityWindowCommandClient
        self.settingsStore = settingsStore
        self.appearanceThemeService = appearanceThemeService ?? AppearanceThemeService(store: settingsStore)
        self.appearanceChangeObserver = appearanceChangeObserver ?? SystemAppearanceChangeObserver()
        self.actionManifestStore = actionManifestStore
        self.platformServerURL = platformServerURL
        self.hotkeyRegistrar = hotkeyRegistrar
        self.settingsWindowPresenter = settingsWindowPresenter
        self.fatalAlertPresenter = fatalAlertPresenter
        self.setActivationPolicy = setActivationPolicy
        self.showsFatalAlert = showsFatalAlert
    }

    static func testing(
        setActivationPolicy: @escaping @MainActor (NSApplication.ActivationPolicy) -> Void = { _ in },
        threadWindowCommandClient: any ThreadWindowCommanding = NopThreadWindowCommandClient(),
        activityWindowCommandClient: (any ActivityWindowCommanding)? = nil,
        settingsWindowPresenter: any SettingsWindowPresenting = NopSettingsWindowPresenter(),
        settingsStore: AgentSettingsStore = AgentSettingsStore(),
        appearanceThemeService: AppearanceThemeService? = nil,
        appearanceChangeObserver: (any AppearanceChangeObserving)? = nil,
        actionManifestStore: ActionManifestStore = ActionManifestStore(
            pluginsDirectoryURL: URL(fileURLWithPath: "/dev/null", isDirectory: true)
        )
    ) -> AppServices {
        AppServices(
            appServer: NopAppServer(),
            threadWindowCommandClient: threadWindowCommandClient,
            activityWindowCommandClient: activityWindowCommandClient,
            settingsStore: settingsStore,
            appearanceThemeService: appearanceThemeService,
            appearanceChangeObserver: appearanceChangeObserver ?? NopAppearanceChangeObserver(),
            actionManifestStore: actionManifestStore,
            platformServerURL: URL(string: "ws://127.0.0.1:0/noop-platform")!,
            hotkeyRegistrar: NopHotkeyRegistrar(),
            settingsWindowPresenter: settingsWindowPresenter,
            fatalAlertPresenter: NopFatalAlertPresenter(),
            setActivationPolicy: setActivationPolicy,
            showsFatalAlert: false
        )
    }

    static func defaultAppServer(
        environment: [String: String] = ProcessInfo.processInfo.environment,
        platformServerURL: URL
    ) -> any AppServerManaging {
        defaultRuntime(
            environment: environment,
            platformServerURL: platformServerURL
        ).appServer
    }

    static func defaultRuntime(
        environment: [String: String] = ProcessInfo.processInfo.environment,
        platformServerURL: URL
    ) -> AppServicesRuntime {
        let platformClient = PlatformBridgeConnectionClient(
            connection: AppServerConnection(serverURL: platformServerURL),
            platformBridge: PlatformBridgeService()
        )

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

    static func defaultElectronShellLaunchConfiguration(
        environment: [String: String] = ProcessInfo.processInfo.environment,
        currentDirectoryURL: URL = URL(fileURLWithPath: FileManager.default.currentDirectoryPath, isDirectory: true),
        bundleExecutableURL: URL? = Bundle.main.executableURL,
        bundleResourceURL: URL? = Bundle.main.resourceURL,
        bundleURL: URL? = Bundle.main.bundleURL,
        fileExists: @escaping (String) -> Bool = { FileManager.default.fileExists(atPath: $0) }
    ) -> ElectronShellLaunchConfiguration {
        let repoRoot = AgentServerRepositoryRootLocator(
            agentServerRelativePath: "apps/electron-shell/package.json",
            fileExists: fileExists
        ).locate(
            bundleExecutableURL: bundleExecutableURL,
            bundleResourceURL: bundleResourceURL,
            bundleURL: bundleURL,
            currentDirectoryURL: currentDirectoryURL
        )
        let bundledElectronMain = bundleResourceURL?
            .appendingPathComponent("ElectronShell/dist/main/main.js")
        let explicitElectronMain = environment["HANDAGENT_ELECTRON_MAIN"]
            .flatMap { $0.isEmpty ? nil : $0 }
            .map { resolveElectronMainPath($0, repoRoot: repoRoot) }
        let bundledElectronMainPath = bundledElectronMain.flatMap { fileExists($0.path) ? $0.path : nil }
        let defaultElectronMain = repoRoot?
            .appendingPathComponent("apps/electron-shell/dist/main/main.js")
            .path
            ?? "apps/electron-shell/dist/main/main.js"
        let electronMain = explicitElectronMain
            ?? bundledElectronMainPath
            ?? defaultElectronMain
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

    private static func resolveElectronMainPath(_ path: String, repoRoot: URL?) -> String {
        guard !path.hasPrefix("/"), let repoRoot else {
            return path
        }
        return repoRoot.appendingPathComponent(path).path
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
final class NopThreadWindowCommandClient: ThreadWindowCommanding {
    var onThreadWindowClosed: (() -> Void)?
    var onCommandResult: ((ThreadWindowCommandResult) -> Void)?

    func openInitialPrompt(_ prompt: PromptSubmission) throws -> String {
        "noop-open-initial-prompt"
    }

    func openHistory() throws -> String {
        "noop-open-history"
    }

    func focus(threadId: String?) throws -> String {
        "noop-focus"
    }

    func sendThemeChanged(_ theme: HostThemePayload) throws -> String {
        "noop-theme-changed"
    }
}

@MainActor
final class NopAppearanceChangeObserver: AppearanceChangeObserving {
    var onSystemAppearanceChange: (() -> Void)?

    func start() {}
    func stop() {}
}

@MainActor
final class NopSettingsWindowPresenter: SettingsWindowPresenting {
    func present(
        settingsViewModel: AgentSettingsViewModel,
        appearanceViewModel: AppearanceSettingsViewModel,
        toolSettingsViewModel: ToolSettingsViewModel,
        pluginSettingsViewModel: PluginSettingsViewModel,
        appendPromptSettingsViewModel: AppendPromptSettingsViewModel,
        mcpSettingsViewModel: MCPSettingsViewModel,
        permissionRulesViewModel: PermissionRulesViewModel,
        workspaceViewModel: WorkspaceSettingsViewModel,
        shortcutActions: [ActionDefinition],
        appTheme: AppTheme,
        onClose: @escaping () -> Void
    ) -> NSWindow? {
        nil
    }
}

@MainActor
final class NopFatalAlertPresenter: FatalAlertPresenting {
    func showFatal(title: String, message: String, primaryButtonTitle: String, secondaryButtonTitle: String?, onSecondary: (() -> Void)?) {}
}

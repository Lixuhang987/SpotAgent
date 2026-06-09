import XCTest
@testable import HandAgentDesktop

final class AppCoordinatorTests: XCTestCase {
    @MainActor
    func testOpenSettingsBuildsSettingsWindowAndPromotesRegularPolicy() {
        var builtWindowCount = 0
        var appliedPolicies: [NSApplication.ActivationPolicy] = []
        let presenter = StubSettingsWindowPresenter { builtWindowCount += 1 }
        let services = AppServices.testing(
            setActivationPolicy: { appliedPolicies.append($0) },
            settingsWindowPresenter: presenter
        )
        let coordinator = AppCoordinator(services: services)

        coordinator.send(.openSettings)

        XCTAssertEqual(builtWindowCount, 1)
        XCTAssertEqual(appliedPolicies.last, .regular)
    }

    @MainActor
    func testSettingsWindowClosedReturnsAccessoryPolicyWithoutThreads() {
        var appliedPolicies: [NSApplication.ActivationPolicy] = []
        let presenter = StubSettingsWindowPresenter()
        let services = AppServices.testing(
            setActivationPolicy: { appliedPolicies.append($0) },
            settingsWindowPresenter: presenter
        )
        let coordinator = AppCoordinator(services: services)

        coordinator.send(.openSettings)
        coordinator.send(.settingsWindowClosed)

        XCTAssertEqual(appliedPolicies.suffix(2), [.regular, .accessory])
    }

    @MainActor
    func testSubmitPromptSendsElectronCommand() {
        let client = RecordingThreadWindowCommandClient()
        let coordinator = AppCoordinator(services: electronServices(commandClient: client))

        coordinator.send(.submitPrompt("hello", attachments: []))

        XCTAssertEqual(client.openedPrompts.map(\.composed), ["hello"])
    }

    @MainActor
    func testThreadWindowOpenAckPromotesRegularPolicy() {
        var appliedPolicies: [NSApplication.ActivationPolicy] = []
        let client = RecordingThreadWindowCommandClient()
        let coordinator = AppCoordinator(
            services: electronServices(
                commandClient: client,
                setActivationPolicy: { appliedPolicies.append($0) }
            )
        )

        coordinator.send(.submitPrompt("hello", attachments: []))
        client.complete(commandId: "open-initial-prompt-1", kind: .openInitialPrompt, ok: true)

        XCTAssertEqual(appliedPolicies.last, .regular)
    }

    @MainActor
    func testThreadWindowClosedDemotesAccessoryPolicyWhenSettingsIsClosed() {
        var appliedPolicies: [NSApplication.ActivationPolicy] = []
        let client = RecordingThreadWindowCommandClient()
        let coordinator = AppCoordinator(
            services: electronServices(
                commandClient: client,
                setActivationPolicy: { appliedPolicies.append($0) }
            )
        )

        coordinator.send(.submitPrompt("hello", attachments: []))
        client.complete(commandId: "open-initial-prompt-1", kind: .openInitialPrompt, ok: true)
        coordinator.send(.threadWindowClosed)

        XCTAssertEqual(appliedPolicies, [.regular, .accessory])
    }

    @MainActor
    func testRepeatedThreadWindowOpenAcksDoNotOvercountActivationPolicy() {
        var appliedPolicies: [NSApplication.ActivationPolicy] = []
        let client = RecordingThreadWindowCommandClient()
        let coordinator = AppCoordinator(
            services: electronServices(
                commandClient: client,
                setActivationPolicy: { appliedPolicies.append($0) }
            )
        )

        coordinator.send(.submitPrompt("hello", attachments: []))
        client.complete(commandId: "open-initial-prompt-1", kind: .openInitialPrompt, ok: true)
        coordinator.send(.openHistory)
        client.complete(commandId: "open-history-1", kind: .openHistory, ok: true)
        coordinator.send(.threadWindowClosed)

        XCTAssertEqual(appliedPolicies, [.regular, .accessory])
    }

    @MainActor
    func testOpenHistorySendsElectronCommand() {
        let client = RecordingThreadWindowCommandClient()
        let coordinator = AppCoordinator(services: electronServices(commandClient: client))

        coordinator.send(.openHistory)

        XCTAssertEqual(client.openHistoryCount, 1)
    }

    @MainActor
    func testAppearancePreferenceChangeSendsThemeToElectron() {
        let client = RecordingThreadWindowCommandClient()
        let coordinator = AppCoordinator(services: electronServices(commandClient: client))

        coordinator.makeAppearanceSettingsViewModel().themePreference = .dark

        XCTAssertEqual(client.sentThemes.last, HostThemePayload(preference: .dark, resolved: .dark))
    }

    @MainActor
    func testSystemAppearanceChangeSendsResolvedThemeToElectron() {
        let client = RecordingThreadWindowCommandClient()
        let observer = RecordingAppearanceChangeObserver()
        let homeURL = TestFiles.makeTemporaryHomeDirectory()
        defer { try? FileManager.default.removeItem(at: homeURL) }
        let settingsStore = AgentSettingsStore(homeDirectoryURL: homeURL)
        var resolvedTheme: ResolvedAppearanceTheme = .light
        let appearanceThemeService = AppearanceThemeService(
            store: settingsStore,
            systemResolver: { resolvedTheme }
        )
        let coordinator = AppCoordinator(
            services: AppServices(
                appServer: NopAppServer(),
                threadWindowCommandClient: client,
                settingsStore: settingsStore,
                appearanceThemeService: appearanceThemeService,
                appearanceChangeObserver: observer,
                platformServerURL: URL(string: "ws://127.0.0.1:0/noop-platform")!,
                hotkeyRegistrar: NopHotkeyRegistrar(),
                settingsWindowPresenter: NopSettingsWindowPresenter(),
                fatalAlertPresenter: NopFatalAlertPresenter(),
                setActivationPolicy: { _ in }
            )
        )

        XCTAssertEqual(observer.startCount, 1)

        resolvedTheme = .dark
        observer.publishSystemAppearanceChange()

        XCTAssertEqual(client.sentThemes.last, HostThemePayload(preference: .system, resolved: .dark))

        coordinator.shutdown()
        XCTAssertEqual(observer.stopCount, 1)
    }

    @MainActor
    func testShowAndTogglePromptPanelDoNotSendThreadWindowCommand() {
        let client = RecordingThreadWindowCommandClient()
        let coordinator = AppCoordinator(services: electronServices(commandClient: client))

        coordinator.send(.showPromptPanel)
        coordinator.send(.togglePromptPanel)

        XCTAssertEqual(client.commandCount, 0)
    }

    @MainActor
    func testShowsActivityWindowWhenAppServerBecomesAvailable() async throws {
        let appServer = TriggerableAppServer()
        appServer.isAvailable = false
        let client = RecordingThreadWindowCommandClient()
        let activityClient = RecordingActivityWindowCommandClient()
        let coordinator = AppCoordinator(
            services: electronServices(
                appServer: appServer,
                commandClient: client,
                activityClient: activityClient
            )
        )

        XCTAssertEqual(activityClient.showCount, 0)

        appServer.publishAvailability(true)
        try await Task.sleep(for: .milliseconds(10))

        XCTAssertEqual(activityClient.showCount, 1)
        XCTAssertEqual(client.sentThemes, [HostThemePayload(preference: .system, resolved: .light)])
        _ = coordinator
    }

    @MainActor
    func testActivityShowThrowDoesNotCreateSwiftStatusBubbleFallback() async throws {
        closeStatusBubblePanels()
        let appServer = TriggerableAppServer()
        appServer.isAvailable = false
        let activityClient = RecordingActivityWindowCommandClient()
        activityClient.showError = RecordingActivityWindowCommandError.showFailed
        let coordinator = AppCoordinator(
            services: electronServices(
                appServer: appServer,
                commandClient: RecordingThreadWindowCommandClient(),
                activityClient: activityClient
            )
        )

        appServer.publishAvailability(true)
        try await Task.sleep(for: .milliseconds(10))

        XCTAssertEqual(activityClient.showCount, 1)
        XCTAssertEqual(visibleStatusBubblePanelCount(), 0)
        coordinator.shutdown()
        closeStatusBubblePanels()
    }

    @MainActor
    func testShutdownClosesPromptPanelWindows() async throws {
        closePromptPanelWindows()
        let app = NSApplication.shared
        let commandClient = RecordingThreadWindowCommandClient()
        let activityClient = RecordingActivityWindowCommandClient()
        let coordinator = AppCoordinator(
            services: electronServices(
                commandClient: commandClient,
                activityClient: activityClient
            )
        )

        coordinator.shutdown()
        try await Task.sleep(for: .milliseconds(10))

        XCTAssertFalse(app.windows.contains { $0 is PromptPanelWindow && $0.isVisible })
        closePromptPanelWindows()
    }

    @MainActor
    func testSubmitPromptIgnoresEmptyString() {
        let client = RecordingThreadWindowCommandClient()
        let coordinator = AppCoordinator(services: electronServices(commandClient: client))

        coordinator.send(.submitPrompt("   ", attachments: []))

        XCTAssertEqual(client.commandCount, 0)
    }

    @MainActor
    func testSubmitPromptDoesNotCreateThreadWhileAgentServerUnavailable() async throws {
        let stub = TriggerableAppServer()
        let client = RecordingThreadWindowCommandClient()
        let services = electronServices(appServer: stub, commandClient: client)
        let coordinator = AppCoordinator(services: services)

        stub.publishAvailability(false)
        try await Task.sleep(for: .milliseconds(10))
        coordinator.send(.submitPrompt("hello", attachments: []))

        XCTAssertEqual(client.commandCount, 0)
        XCTAssertEqual(coordinator.agentServerError, "agent-server 已断开，正在尝试重连…")
    }

    @MainActor
    func testHistoryActionSendsCommandEveryTime() {
        let client = RecordingThreadWindowCommandClient()
        let coordinator = AppCoordinator(services: electronServices(commandClient: client))

        coordinator.send(.openHistory)
        coordinator.send(.openHistory)

        XCTAssertEqual(client.openHistoryCount, 2)
    }

    @MainActor
    func testMultiplePromptsSendMultipleElectronCommands() {
        let client = RecordingThreadWindowCommandClient()
        let coordinator = AppCoordinator(services: electronServices(commandClient: client))

        coordinator.send(.submitPrompt("first", attachments: []))
        coordinator.send(.submitPrompt("second", attachments: []))

        XCTAssertEqual(client.openedPrompts.map(\.composed), ["first", "second"])
    }

    @MainActor
    func testInjectedAgentServerStartIsCalledOnBootstrap() throws {
        let stub = TriggerableAppServer()
        _ = AppCoordinator(services: electronServices(appServer: stub, commandClient: RecordingThreadWindowCommandClient()))

        XCTAssertEqual(stub.startCount, 1)
    }

    @MainActor
    func testHostTerminationRequestTerminatesApplication() {
        let appServer = TriggerableAppServer()
        var terminateCount = 0
        let coordinator = AppCoordinator(
            services: electronServices(
                appServer: appServer,
                commandClient: RecordingThreadWindowCommandClient(),
                terminateApplication: { terminateCount += 1 }
            )
        )

        appServer.requestHostTermination()

        _ = coordinator
        XCTAssertEqual(terminateCount, 1)
    }

    @MainActor
    func testShortcutActionsComeOnlyFromManifestActions() throws {
        let root = try FileManager.default.url(
            for: .itemReplacementDirectory,
            in: .userDomainMask,
            appropriateFor: FileManager.default.temporaryDirectory,
            create: true
        )
        defer { try? FileManager.default.removeItem(at: root) }
        let plugins = root.appendingPathComponent("plugins", isDirectory: true)
        let pluginDir = plugins.appendingPathComponent("conflict", isDirectory: true)
        try FileManager.default.createDirectory(at: pluginDir, withIntermediateDirectories: true)
        try """
        {
          "version": 1,
          "id": "conflict",
          "title": "Conflict",
          "enabled": true,
          "prompts": [
            {
              "name": "settings",
              "trigger": "settings",
              "title": "Plugin Settings",
              "template": "Plugin settings"
            }
          ]
        }
        """.data(using: .utf8)!.write(to: pluginDir.appendingPathComponent("plugin.json"))
        let presenter = StubSettingsWindowPresenter()
        let services = AppServices.testing(
            settingsWindowPresenter: presenter,
            actionManifestStore: ActionManifestStore(pluginsDirectoryURL: plugins)
        )
        let coordinator = AppCoordinator(services: services)

        coordinator.send(.openSettings)

        XCTAssertEqual(presenter.lastShortcutActions.map(\.id), ["conflict/settings"])
    }
}

@MainActor
private func closePromptPanelWindows() {
    for window in NSApplication.shared.windows where window is PromptPanelWindow {
        window.close()
    }
}

@MainActor
private func visibleStatusBubblePanelCount() -> Int {
    NSApplication.shared.windows.filter {
        String(describing: type(of: $0)).contains("StatusBubblePanel") && $0.isVisible
    }.count
}

@MainActor
private func closeStatusBubblePanels() {
    for window in NSApplication.shared.windows where String(describing: type(of: window)).contains("StatusBubblePanel") {
        window.close()
    }
}

@MainActor
private func electronServices(
    appServer: any AppServerManaging = NopAppServer(),
    commandClient: RecordingThreadWindowCommandClient,
    activityClient: RecordingActivityWindowCommandClient? = nil,
    setActivationPolicy: @escaping @MainActor (NSApplication.ActivationPolicy) -> Void = { _ in },
    terminateApplication: @escaping @MainActor () -> Void = {}
) -> AppServices {
    let settingsStore = AgentSettingsStore(homeDirectoryURL: TestFiles.makeTemporaryHomeDirectory())
    return AppServices(
        appServer: appServer,
        threadWindowCommandClient: commandClient,
        activityWindowCommandClient: activityClient,
        settingsStore: settingsStore,
        appearanceThemeService: AppearanceThemeService(store: settingsStore, systemResolver: { .light }),
        platformServerURL: URL(string: "ws://127.0.0.1:0/noop-platform")!,
        hotkeyRegistrar: NopHotkeyRegistrar(),
        settingsWindowPresenter: NopSettingsWindowPresenter(),
        fatalAlertPresenter: NopFatalAlertPresenter(),
        setActivationPolicy: setActivationPolicy,
        terminateApplication: terminateApplication,
        promptPanelPresentationMode: .hiddenForTesting
    )
}

private enum RecordingActivityWindowCommandError: Error {
    case showFailed
}

@MainActor
private final class RecordingAppearanceChangeObserver: AppearanceChangeObserving {
    var onSystemAppearanceChange: (() -> Void)?
    private(set) var startCount = 0
    private(set) var stopCount = 0

    func start() {
        startCount += 1
    }

    func stop() {
        stopCount += 1
    }

    func publishSystemAppearanceChange() {
        onSystemAppearanceChange?()
    }
}

@MainActor
private final class RecordingActivityWindowCommandClient: ActivityWindowCommanding {
    var onActivityWindowCommandResult: ((ActivityWindowCommandResult) -> Void)?
    var showError: Error?
    private(set) var showCount = 0

    func showActivityWindow() throws -> String {
        showCount += 1
        if let showError {
            throw showError
        }
        return "activity-show-\(showCount)"
    }
}

@MainActor
private final class TriggerableAppServer: AppServerManaging {
    var isAvailable = true
    var startupErrorMessage: String?
    var onAvailabilityChange: ((Bool) -> Void)?
    var onFatalError: ((String) -> Void)?
    var onHostTerminationRequest: (() -> Void)?
    private(set) var startCount = 0

    func start() { startCount += 1 }
    func stop() {}

    func publishAvailability(_ available: Bool) {
        isAvailable = available
        onAvailabilityChange?(available)
    }

    func requestHostTermination() {
        onHostTerminationRequest?()
    }
}

@MainActor
private final class RecordingThreadWindowCommandClient: ThreadWindowCommanding {
    var onThreadWindowClosed: (() -> Void)?
    var onCommandResult: ((ThreadWindowCommandResult) -> Void)?
    private(set) var openedPrompts: [PromptSubmission] = []
    private(set) var openHistoryCount = 0
    private(set) var focusedThreadIDs: [String?] = []
    private(set) var sentThemes: [HostThemePayload] = []
    private var commandCounters: [ThreadWindowCommandKind: Int] = [:]

    var commandCount: Int {
        openedPrompts.count + openHistoryCount + focusedThreadIDs.count
    }

    func openInitialPrompt(_ prompt: PromptSubmission) throws -> String {
        openedPrompts.append(prompt)
        return nextCommandId(for: .openInitialPrompt)
    }

    func openHistory() throws -> String {
        openHistoryCount += 1
        return nextCommandId(for: .openHistory)
    }

    func focus(threadId: String?) throws -> String {
        focusedThreadIDs.append(threadId)
        return nextCommandId(for: .focus)
    }

    func sendThemeChanged(_ theme: HostThemePayload) throws -> String {
        sentThemes.append(theme)
        return "theme-\(sentThemes.count)"
    }

    func complete(
        commandId: String,
        kind: ThreadWindowCommandKind,
        ok: Bool,
        error: String? = nil
    ) {
        onCommandResult?(
            ThreadWindowCommandResult(
                commandId: commandId,
                kind: kind,
                ok: ok,
                error: error
            )
        )
    }

    private func nextCommandId(for kind: ThreadWindowCommandKind) -> String {
        let next = (commandCounters[kind] ?? 0) + 1
        commandCounters[kind] = next
        switch kind {
        case .openInitialPrompt:
            return "open-initial-prompt-\(next)"
        case .openHistory:
            return "open-history-\(next)"
        case .focus:
            return "focus-\(next)"
        }
    }
}

@MainActor
final class StubSettingsWindowPresenter: SettingsWindowPresenting {
    private let onPresent: () -> Void
    private(set) var lastShortcutActions: [ActionDefinition] = []
    private(set) var presentedWindow: NSWindow?
    private(set) var refreshedThemes: [AppTheme] = []

    init(onPresent: @escaping () -> Void = {}) {
        self.onPresent = onPresent
    }

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
        lastShortcutActions = shortcutActions
        onPresent()
        let window = NSWindow()
        presentedWindow = window
        return window
    }

    func updateTheme(_ appTheme: AppTheme, for window: NSWindow?) {
        refreshedThemes.append(appTheme)
    }
}

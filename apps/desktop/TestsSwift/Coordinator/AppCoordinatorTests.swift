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
    func testSubmitPromptCreatesThreadWindow() {
        let coordinator = AppCoordinator(services: AppServices.testing())

        coordinator.send(.submitPrompt("hello", attachments: []))

        XCTAssertNotNil(coordinator.threadWindowWebHost)
        XCTAssertEqual(coordinator.threadWindowWebHost?.pendingInitialPromptCount, 1)
    }

    @MainActor
    func testShowPromptPanelPrewarmsHiddenThreadWindowWithoutPromotingRegularPolicy() async throws {
        let presenter = StubThreadWindowPresenter()
        var appliedPolicies: [NSApplication.ActivationPolicy] = []
        let services = AppServices.testing(
            setActivationPolicy: { appliedPolicies.append($0) },
            threadWindowPresenter: presenter
        )
        let coordinator = AppCoordinator(services: services)

        coordinator.send(.showPromptPanel)
        try await Task.sleep(for: .milliseconds(20))

        XCTAssertNotNil(coordinator.threadWindowWebHost)
        XCTAssertEqual(presenter.makeWindowCount, 1)
        XCTAssertEqual(presenter.showCount, 0)
        XCTAssertFalse(appliedPolicies.contains(.regular))
    }

    @MainActor
    func testSubmitPromptReusesPromptPanelPrewarmedThreadWindow() async throws {
        let presenter = StubThreadWindowPresenter()
        let services = AppServices.testing(threadWindowPresenter: presenter)
        let coordinator = AppCoordinator(services: services)

        coordinator.send(.showPromptPanel)
        try await Task.sleep(for: .milliseconds(20))
        let prewarmedHost = coordinator.threadWindowWebHost

        coordinator.send(.submitPrompt("hello", attachments: []))

        XCTAssertTrue(coordinator.threadWindowWebHost === prewarmedHost)
        XCTAssertEqual(presenter.makeWindowCount, 1)
        XCTAssertEqual(presenter.showCount, 1)
        XCTAssertEqual(coordinator.threadWindowWebHost?.drainInitialPrompts().map(\.text), ["hello"])
    }

    @MainActor
    func testShowPromptPanelDoesNotPrewarmThreadWindowWhileAgentServerUnavailable() async throws {
        final class StubAppServer: AppServerManaging {
            var isAvailable = true
            var startupErrorMessage: String?
            var onAvailabilityChange: ((Bool) -> Void)?
            var onFatalError: ((String) -> Void)?
            func start() {}
            func stop() {}
        }
        let stub = StubAppServer()
        let presenter = StubThreadWindowPresenter()
        let services = AppServices(
            appServer: stub,
            appServerURL: URL(string: "ws://127.0.0.1:0/noop")!,
            hotkeyRegistrar: NopHotkeyRegistrar(),
            threadWindowPresenter: presenter,
            settingsWindowPresenter: NopSettingsWindowPresenter(),
            fatalAlertPresenter: NopFatalAlertPresenter(),
            setActivationPolicy: { _ in },
            showsStatusBubble: false
        )
        let coordinator = AppCoordinator(services: services)

        stub.onAvailabilityChange?(false)
        coordinator.send(.showPromptPanel)
        try await Task.sleep(for: .milliseconds(20))

        XCTAssertNil(coordinator.threadWindowWebHost)
        XCTAssertEqual(presenter.makeWindowCount, 0)
    }

    @MainActor
    func testThreadClosedRemovesWindowViewModel() {
        let coordinator = AppCoordinator(services: AppServices.testing())

        coordinator.send(.submitPrompt("hello", attachments: []))

        coordinator.send(.threadWindowClosed)

        XCTAssertNil(coordinator.threadWindowWebHost)
    }

    @MainActor
    func testSubmitPromptIgnoresEmptyString() {
        let coordinator = AppCoordinator(services: AppServices.testing())

        coordinator.send(.submitPrompt("   ", attachments: []))

        XCTAssertNil(coordinator.threadWindowWebHost)
    }

    @MainActor
    func testSubmitPromptDoesNotCreateThreadWhileAgentServerUnavailable() async throws {
        final class StubAppServer: AppServerManaging {
            var isAvailable = true
            var startupErrorMessage: String?
            var onAvailabilityChange: ((Bool) -> Void)?
            var onFatalError: ((String) -> Void)?
            func start() {}
            func stop() {}
        }
        let stub = StubAppServer()
        let services = AppServices(
            appServer: stub,
            appServerURL: URL(string: "ws://127.0.0.1:0/noop")!,
            hotkeyRegistrar: NopHotkeyRegistrar(),
            threadWindowPresenter: NopThreadWindowPresenter(),
            settingsWindowPresenter: NopSettingsWindowPresenter(),
            fatalAlertPresenter: NopFatalAlertPresenter(),
            setActivationPolicy: { _ in },
            showsStatusBubble: false
        )
        let coordinator = AppCoordinator(services: services)

        stub.onAvailabilityChange?(false)
        try await Task.sleep(for: .milliseconds(10))
        coordinator.send(.submitPrompt("hello", attachments: []))

        XCTAssertNil(coordinator.threadWindowWebHost)
        XCTAssertEqual(coordinator.agentServerError, "agent-server 已断开，正在尝试重连…")
    }

    @MainActor
    func testHistoryActionOpensSingleThreadWindowWithoutQueuingPrompt() {
        let coordinator = AppCoordinator(services: AppServices.testing())

        coordinator.send(.openHistory)
        let firstHost = coordinator.threadWindowWebHost

        coordinator.send(.openHistory)

        XCTAssertTrue(coordinator.threadWindowWebHost === firstHost)
        XCTAssertEqual(coordinator.threadWindowWebHost?.pendingInitialPromptCount, 0)
    }

    @MainActor
    func testMultiplePromptsReuseSingleWindow() {
        let coordinator = AppCoordinator(services: AppServices.testing())

        coordinator.send(.submitPrompt("first", attachments: []))
        let firstHost = coordinator.threadWindowWebHost
        coordinator.send(.submitPrompt("second", attachments: []))

        XCTAssertTrue(coordinator.threadWindowWebHost === firstHost)
        XCTAssertEqual(coordinator.threadWindowWebHost?.pendingInitialPromptCount, 2)
    }

    @MainActor
    func testInjectedAgentServerStartIsCalledOnBootstrap() throws {
        final class StubAppServer: AppServerManaging {
            var isAvailable = false
            var startupErrorMessage: String?
            var onAvailabilityChange: ((Bool) -> Void)?
            var onFatalError: ((String) -> Void)?
            var startCount = 0
            func start() { startCount += 1 }
            func stop() {}
        }
        let stub = StubAppServer()
        let services = AppServices(
            appServer: stub,
            appServerURL: URL(string: "ws://127.0.0.1:0/noop")!,
            hotkeyRegistrar: NopHotkeyRegistrar(),
            threadWindowPresenter: NopThreadWindowPresenter(),
            settingsWindowPresenter: NopSettingsWindowPresenter(),
            fatalAlertPresenter: NopFatalAlertPresenter(),
            setActivationPolicy: { _ in },
            showsStatusBubble: false
        )
        _ = AppCoordinator(services: services)

        XCTAssertEqual(stub.startCount, 1)
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
final class StubSettingsWindowPresenter: SettingsWindowPresenting {
    private let onPresent: () -> Void
    private(set) var lastShortcutActions: [ActionDefinition] = []
    private(set) var presentedWindow: NSWindow?

    init(onPresent: @escaping () -> Void = {}) {
        self.onPresent = onPresent
    }

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
        lastShortcutActions = shortcutActions
        onPresent()
        let window = NSWindow()
        presentedWindow = window
        return window
    }
}

@MainActor
final class StubThreadWindowPresenter: ThreadWindowPresenting {
    private(set) var makeWindowCount = 0
    private(set) var showCount = 0

    func makeWindow(host: ThreadWindowWebHost, onClose: @escaping () -> Void) -> NSWindow? {
        makeWindowCount += 1
        return NSWindow()
    }

    func show(window: NSWindow) {
        showCount += 1
    }
}

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
    func testSettingsWindowClosedReturnsAccessoryPolicyWithoutSessions() {
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
    func testSubmitPromptCreatesSessionWindow() {
        let coordinator = AppCoordinator(services: AppServices.testing())

        coordinator.send(.submitPrompt("hello", attachments: []))

        XCTAssertNotNil(coordinator.sessionWindowViewModel)
    }

    @MainActor
    func testSessionClosedRemovesWindowViewModel() {
        let coordinator = AppCoordinator(services: AppServices.testing())

        coordinator.send(.submitPrompt("hello", attachments: []))

        coordinator.send(.sessionWindowClosed)

        XCTAssertNil(coordinator.sessionWindowViewModel)
    }

    @MainActor
    func testSubmitPromptIgnoresEmptyString() {
        let coordinator = AppCoordinator(services: AppServices.testing())

        coordinator.send(.submitPrompt("   ", attachments: []))

        XCTAssertNil(coordinator.sessionWindowViewModel)
    }

    @MainActor
    func testSubmitPromptDoesNotCreateSessionWhileAgentServerUnavailable() async throws {
        final class StubServer: AgentServerStarting {
            var lastStartupError: String?
            var fatalErrorMessage: String?
            var isAvailable = true
            var onAvailabilityChange: ((Bool) -> Void)?
            var onFatalError: ((String) -> Void)?
            func start() throws {}
            func stop() {}
        }
        let stub = StubServer()
        let services = AppServices(
            agentServer: stub,
            agentServerURL: URL(string: "ws://127.0.0.1:0/noop")!,
            platformBridgeFactory: { _ in nil },
            hotkeyRegistrar: NopHotkeyRegistrar(),
            sessionWindowPresenter: NopSessionWindowPresenter(),
            settingsWindowPresenter: NopSettingsWindowPresenter(),
            fatalAlertPresenter: NopFatalAlertPresenter(),
            setActivationPolicy: { _ in },
            showsStatusBubble: false
        )
        let coordinator = AppCoordinator(services: services)

        stub.onAvailabilityChange?(false)
        try await Task.sleep(for: .milliseconds(10))
        coordinator.send(.submitPrompt("hello", attachments: []))

        XCTAssertNil(coordinator.sessionWindowViewModel)
        XCTAssertEqual(coordinator.agentServerError, "agent-server 已断开，正在尝试重连…")
    }

    @MainActor
    func testHistoryActionOpensSingleSessionWindowWithoutChangingActiveTab() {
        let coordinator = AppCoordinator(services: AppServices.testing())

        coordinator.send(.openHistory)
        coordinator.sessionWindowViewModel?.handleWindowEvent(
            .createSessionResponse(sessionID: "session-1", title: nil)
        )
        let firstActive = coordinator.sessionWindowViewModel?.activeTabID

        coordinator.send(.openHistory)

        XCTAssertNotNil(firstActive)
        XCTAssertEqual(coordinator.sessionWindowViewModel?.activeTabID, firstActive)
    }

    @MainActor
    func testMultiplePromptsReuseSingleWindow() {
        let coordinator = AppCoordinator(services: AppServices.testing())

        coordinator.send(.submitPrompt("first", attachments: []))
        let firstModel = coordinator.sessionWindowViewModel
        coordinator.send(.submitPrompt("second", attachments: []))

        XCTAssertTrue(coordinator.sessionWindowViewModel === firstModel)
    }

    @MainActor
    func testInjectedAgentServerStartIsCalledOnBootstrap() throws {
        final class StubServer: AgentServerStarting {
            var lastStartupError: String?
            var fatalErrorMessage: String?
            var isAvailable = false
            var onAvailabilityChange: ((Bool) -> Void)?
            var onFatalError: ((String) -> Void)?
            var startCount = 0
            func start() throws { startCount += 1 }
            func stop() {}
        }
        let stub = StubServer()
        let services = AppServices(
            agentServer: stub,
            agentServerURL: URL(string: "ws://127.0.0.1:0/noop")!,
            platformBridgeFactory: { _ in nil },
            hotkeyRegistrar: NopHotkeyRegistrar(),
            sessionWindowPresenter: NopSessionWindowPresenter(),
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

    init(onPresent: @escaping () -> Void = {}) {
        self.onPresent = onPresent
    }

    func present(
        settingsViewModel: AgentSettingsViewModel,
        toolSettingsViewModel: ToolSettingsViewModel,
        permissionRulesViewModel: PermissionRulesViewModel,
        workspaceViewModel: WorkspaceSettingsViewModel,
        shortcutActions: [ActionDefinition],
        onClose: @escaping () -> Void
    ) -> NSWindow? {
        lastShortcutActions = shortcutActions
        onPresent()
        return NSWindow()
    }
}

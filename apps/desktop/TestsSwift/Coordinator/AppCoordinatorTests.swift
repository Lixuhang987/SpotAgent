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
    func testElectronSubmitPromptSendsCommandWithoutCreatingWebHost() {
        let client = RecordingThreadWindowCommandClient()
        let coordinator = AppCoordinator(services: electronServices(commandClient: client))

        coordinator.send(.submitPrompt("hello", attachments: []))

        XCTAssertNil(coordinator.threadWindowWebHost)
        XCTAssertEqual(client.openedPrompts.map(\.composed), ["hello"])
    }

    @MainActor
    func testElectronOpenHistorySendsCommandWithoutCreatingWebHost() {
        let client = RecordingThreadWindowCommandClient()
        let coordinator = AppCoordinator(services: electronServices(commandClient: client))

        coordinator.send(.openHistory)

        XCTAssertNil(coordinator.threadWindowWebHost)
        XCTAssertEqual(client.openHistoryCount, 1)
    }

    @MainActor
    func testElectronStatusBubbleTapWithoutThreadIDDoesNotFocusOpenThreadWindow() {
        let client = RecordingThreadWindowCommandClient()
        let coordinator = AppCoordinator(services: electronServices(commandClient: client))

        coordinator.send(.openHistory)
        client.complete(commandId: "open-history-1", kind: .openHistory, ok: true)
        coordinator.send(.statusBubbleTapped(nil))

        XCTAssertTrue(client.focusedThreadIDs.isEmpty)
    }

    @MainActor
    func testElectronStatusBubbleFocusFailureAllowsPromptFallback() {
        let client = RecordingThreadWindowCommandClient()
        let coordinator = AppCoordinator(services: electronServices(commandClient: client))

        coordinator.send(.openHistory)
        client.complete(commandId: "open-history-1", kind: .openHistory, ok: true)
        coordinator.send(.statusBubbleTapped("thread-1"))
        client.complete(
            commandId: "focus-1",
            kind: .focus,
            ok: false,
            error: "thread window is not visible"
        )
        coordinator.send(.statusBubbleTapped("thread-1"))

        XCTAssertEqual(client.focusedThreadIDs, ["thread-1"])
    }

    @MainActor
    func testElectronShowAndToggleDoNotSendThreadWindowCommand() {
        let client = RecordingThreadWindowCommandClient()
        let coordinator = AppCoordinator(services: electronServices(commandClient: client))

        coordinator.send(.showPromptPanel)
        coordinator.send(.togglePromptPanel)

        XCTAssertEqual(client.commandCount, 0)
    }

    @MainActor
    func testElectronShowsActivityWindowWhenAppServerBecomesAvailable() async throws {
        closeStatusBubblePanels()
        let appServer = TriggerableAppServer()
        appServer.isAvailable = false
        let activityClient = RecordingActivityWindowCommandClient()
        let coordinator = AppCoordinator(
            services: electronServices(
                appServer: appServer,
                commandClient: RecordingThreadWindowCommandClient(),
                activityClient: activityClient
            )
        )

        XCTAssertEqual(activityClient.showCount, 0)

        appServer.publishAvailability(true)
        try await Task.sleep(for: .milliseconds(10))

        XCTAssertEqual(activityClient.showCount, 1)
        XCTAssertEqual(visibleStatusBubblePanelCount(), 0)
        _ = coordinator
    }

    @MainActor
    func testElectronActivityShowThrowFallsBackToSwiftStatusBubble() async throws {
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
        defer {
            coordinator.shutdown()
            closeStatusBubblePanels()
        }

        appServer.publishAvailability(true)
        try await Task.sleep(for: .milliseconds(10))

        XCTAssertEqual(activityClient.showCount, 1)
        XCTAssertEqual(visibleStatusBubblePanelCount(), 1)
    }

    @MainActor
    func testElectronActivityShowAckFailureFallsBackToSwiftStatusBubble() async throws {
        closeStatusBubblePanels()
        let appServer = TriggerableAppServer()
        appServer.isAvailable = false
        let activityClient = RecordingActivityWindowCommandClient()
        let coordinator = AppCoordinator(
            services: electronServices(
                appServer: appServer,
                commandClient: RecordingThreadWindowCommandClient(),
                activityClient: activityClient
            )
        )
        defer {
            coordinator.shutdown()
            closeStatusBubblePanels()
        }

        appServer.publishAvailability(true)
        try await Task.sleep(for: .milliseconds(10))
        XCTAssertEqual(visibleStatusBubblePanelCount(), 0)

        activityClient.complete(commandId: "activity-show-1", ok: false, error: "activity window failed")
        try await Task.sleep(for: .milliseconds(10))

        XCTAssertEqual(activityClient.showCount, 1)
        XCTAssertEqual(visibleStatusBubblePanelCount(), 1)
    }

    @MainActor
    func testElectronActivityPromptRequestShowsPromptPanelWithoutFocusingThreadWindow() {
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

        activityClient.requestPromptPanel()

        XCTAssertTrue(app.windows.contains { $0 is PromptPanelWindow && $0.isVisible })
        XCTAssertTrue(commandClient.focusedThreadIDs.isEmpty)
        coordinator.send(.hidePromptPanel)
        closePromptPanelWindows()
    }

    @MainActor
    func testShutdownClearsElectronActivityPromptRequestCallback() async throws {
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
        XCTAssertNil(activityClient.onPromptPanelShowRequested)
        XCTAssertNil(activityClient.onActivityWindowCommandResult)
        activityClient.requestPromptPanel()
        try await Task.sleep(for: .milliseconds(10))

        XCTAssertFalse(app.windows.contains { $0 is PromptPanelWindow && $0.isVisible })
        closePromptPanelWindows()
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
private func closePromptPanelWindows() {
    for window in NSApplication.shared.windows where window is PromptPanelWindow {
        window.close()
    }
}

@MainActor
private func electronServices(
    appServer: any AppServerManaging = NopAppServer(),
    commandClient: RecordingThreadWindowCommandClient,
    activityClient: RecordingActivityWindowCommandClient? = nil
) -> AppServices {
    AppServices(
        appServer: appServer,
        threadWindowCommandClient: commandClient,
        activityWindowCommandClient: activityClient,
        appServerURL: URL(string: "ws://127.0.0.1:0/noop")!,
        platformServerURL: URL(string: "ws://127.0.0.1:0/noop-platform")!,
        threadWindowWebAppURL: URL(fileURLWithPath: "/tmp/index.html"),
        hotkeyRegistrar: NopHotkeyRegistrar(),
        threadWindowPresenter: NopThreadWindowPresenter(),
        settingsWindowPresenter: NopSettingsWindowPresenter(),
        fatalAlertPresenter: NopFatalAlertPresenter(),
        setActivationPolicy: { _ in },
        showsStatusBubble: false
    )
}

private enum RecordingActivityWindowCommandError: Error {
    case showFailed
}

@MainActor
private final class RecordingActivityWindowCommandClient: ActivityWindowCommanding {
    var onActivityWindowCommandResult: ((ActivityWindowCommandResult) -> Void)?
    var onPromptPanelShowRequested: (() -> Void)?
    var showError: Error?
    private(set) var showCount = 0

    func showActivityWindow() throws -> String {
        showCount += 1
        if let showError {
            throw showError
        }
        return "activity-show-\(showCount)"
    }

    func requestPromptPanel() {
        onPromptPanelShowRequested?()
    }

    func complete(commandId: String, ok: Bool, error: String? = nil) {
        onActivityWindowCommandResult?(
            ActivityWindowCommandResult(
                commandId: commandId,
                kind: .show,
                ok: ok,
                error: error
            )
        )
    }
}

@MainActor
private final class TriggerableAppServer: AppServerManaging {
    var isAvailable = true
    var startupErrorMessage: String?
    var onAvailabilityChange: ((Bool) -> Void)?
    var onFatalError: ((String) -> Void)?

    func start() {}
    func stop() {}

    func publishAvailability(_ available: Bool) {
        isAvailable = available
        onAvailabilityChange?(available)
    }
}

@MainActor
private final class RecordingThreadWindowCommandClient: ThreadWindowCommanding {
    var onThreadWindowClosed: (() -> Void)?
    var onCommandResult: ((ThreadWindowCommandResult) -> Void)?
    private(set) var openedPrompts: [PromptSubmission] = []
    private(set) var openHistoryCount = 0
    private(set) var focusedThreadIDs: [String?] = []
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

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
    func testSubmitPromptCreatesSessionViewModel() {
        let coordinator = AppCoordinator(services: AppServices.testing())

        coordinator.send(.submitPrompt("hello", attachments: []))

        XCTAssertEqual(coordinator.sessionViewModels.count, 1)
        XCTAssertEqual(coordinator.sessionViewModels.values.first?.messages.first?.text, "hello")
    }

    @MainActor
    func testSessionClosedRemovesViewModel() {
        let coordinator = AppCoordinator(services: AppServices.testing())

        coordinator.send(.submitPrompt("hello", attachments: []))
        let sessionID = coordinator.sessionViewModels.keys.first!

        coordinator.send(.sessionClosed(sessionID))

        XCTAssertTrue(coordinator.sessionViewModels.isEmpty)
    }

    @MainActor
    func testSubmitPromptIgnoresEmptyString() {
        let coordinator = AppCoordinator(services: AppServices.testing())

        coordinator.send(.submitPrompt("   ", attachments: []))

        XCTAssertTrue(coordinator.sessionViewModels.isEmpty)
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
}

@MainActor
final class StubSettingsWindowPresenter: SettingsWindowPresenting {
    private let onPresent: () -> Void

    init(onPresent: @escaping () -> Void = {}) {
        self.onPresent = onPresent
    }

    func present(
        settingsViewModel: AgentSettingsViewModel,
        workspaceViewModel: WorkspaceSettingsViewModel,
        shortcutActions: [PromptAction],
        onClose: @escaping () -> Void
    ) -> NSWindow? {
        onPresent()
        return NSWindow()
    }
}

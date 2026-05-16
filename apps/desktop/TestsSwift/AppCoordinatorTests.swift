import XCTest
@testable import HandAgentDesktop

final class AppCoordinatorTests: XCTestCase {
    @MainActor
    func testOpenSettingsBuildsSettingsWindowAndPromotesRegularPolicy() {
        var builtWindowCount = 0
        var appliedPolicies: [NSApplication.ActivationPolicy] = []
        let coordinator = AppCoordinator(
            skipServerStart: true,
            setActivationPolicy: { appliedPolicies.append($0) },
            settingsWindowFactory: {
                builtWindowCount += 1
                return NSWindow()
            }
        )

        coordinator.send(.openSettings)

        XCTAssertEqual(builtWindowCount, 1)
        XCTAssertEqual(appliedPolicies.last, .regular)
    }

    @MainActor
    func testSettingsWindowClosedReturnsAccessoryPolicyWithoutSessions() {
        var appliedPolicies: [NSApplication.ActivationPolicy] = []
        let coordinator = AppCoordinator(
            skipServerStart: true,
            setActivationPolicy: { appliedPolicies.append($0) },
            settingsWindowFactory: { NSWindow() }
        )

        coordinator.send(.openSettings)
        coordinator.send(.settingsWindowClosed)

        XCTAssertEqual(appliedPolicies.suffix(2), [.regular, .accessory])
    }

    @MainActor
    func testSubmitPromptCreatesSessionViewModel() {
        let coordinator = AppCoordinator(skipServerStart: true)

        coordinator.send(.submitPrompt("hello", attachments: []))

        XCTAssertEqual(coordinator.sessionViewModels.count, 1)
        XCTAssertEqual(coordinator.sessionViewModels.values.first?.messages.first?.text, "hello")
    }

    @MainActor
    func testSessionClosedRemovesViewModel() {
        let coordinator = AppCoordinator(skipServerStart: true)

        coordinator.send(.submitPrompt("hello", attachments: []))
        let sessionID = coordinator.sessionViewModels.keys.first!

        coordinator.send(.sessionClosed(sessionID))

        XCTAssertTrue(coordinator.sessionViewModels.isEmpty)
    }

    @MainActor
    func testSubmitPromptIgnoresEmptyString() {
        let coordinator = AppCoordinator(skipServerStart: true)

        coordinator.send(.submitPrompt("   ", attachments: []))

        XCTAssertTrue(coordinator.sessionViewModels.isEmpty)
    }
}

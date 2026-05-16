import XCTest
@testable import HandAgentDesktop

final class AppCoordinatorTests: XCTestCase {
    @MainActor
    func testOpenSettingsInvokesInjectedWindowOpener() {
        var didOpenSettings = false
        let coordinator = AppCoordinator(
            skipServerStart: true,
            openSettingsWindow: {
                didOpenSettings = true
            }
        )

        coordinator.send(.openSettings)

        XCTAssertTrue(didOpenSettings)
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

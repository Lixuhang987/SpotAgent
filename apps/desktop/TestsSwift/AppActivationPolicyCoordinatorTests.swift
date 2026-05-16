import AppKit
import XCTest
@testable import HandAgentDesktop

final class AppActivationPolicyCoordinatorTests: XCTestCase {
    @MainActor
    func testUsesAccessoryPolicyWithoutSessionWindows() {
        let coordinator = AppActivationPolicyCoordinator()

        XCTAssertEqual(
            coordinator.policyAfterUpdatingOpenSessionWindows(by: 0),
            .accessory
        )
    }

    @MainActor
    func testSwitchesToRegularPolicyWhenFirstSessionWindowOpens() {
        let coordinator = AppActivationPolicyCoordinator()

        _ = coordinator.policyAfterUpdatingOpenSessionWindows(by: 1)

        XCTAssertEqual(
            coordinator.policyAfterUpdatingOpenSessionWindows(by: 0),
            .regular
        )
    }

    @MainActor
    func testReturnsToAccessoryPolicyWhenLastSessionWindowCloses() {
        let coordinator = AppActivationPolicyCoordinator()

        _ = coordinator.policyAfterUpdatingOpenSessionWindows(by: 1)

        XCTAssertEqual(
            coordinator.policyAfterUpdatingOpenSessionWindows(by: -1),
            .accessory
        )
    }

    @MainActor
    func testUsesRegularPolicyWhenSettingsWindowIsOpen() {
        let coordinator = AppActivationPolicyCoordinator()

        XCTAssertEqual(
            coordinator.policyAfterUpdatingSettingsWindow(isOpen: true),
            .regular
        )
    }

    @MainActor
    func testReturnsToAccessoryPolicyWhenSettingsWindowClosesWithoutSessions() {
        let coordinator = AppActivationPolicyCoordinator()

        _ = coordinator.policyAfterUpdatingSettingsWindow(isOpen: true)

        XCTAssertEqual(
            coordinator.policyAfterUpdatingSettingsWindow(isOpen: false),
            .accessory
        )
    }
}

import AppKit
import XCTest
@testable import HandAgentDesktop

final class AppActivationPolicyCoordinatorTests: XCTestCase {
    @MainActor
    func testUsesAccessoryPolicyWithoutThreadWindows() {
        let coordinator = AppActivationPolicyCoordinator()

        XCTAssertEqual(
            coordinator.policyAfterUpdatingOpenThreadWindows(by: 0),
            .accessory
        )
    }

    @MainActor
    func testSwitchesToRegularPolicyWhenFirstThreadWindowOpens() {
        let coordinator = AppActivationPolicyCoordinator()

        _ = coordinator.policyAfterUpdatingOpenThreadWindows(by: 1)

        XCTAssertEqual(
            coordinator.policyAfterUpdatingOpenThreadWindows(by: 0),
            .regular
        )
    }

    @MainActor
    func testReturnsToAccessoryPolicyWhenLastThreadWindowCloses() {
        let coordinator = AppActivationPolicyCoordinator()

        _ = coordinator.policyAfterUpdatingOpenThreadWindows(by: 1)

        XCTAssertEqual(
            coordinator.policyAfterUpdatingOpenThreadWindows(by: -1),
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
    func testReturnsToAccessoryPolicyWhenSettingsWindowClosesWithoutThreads() {
        let coordinator = AppActivationPolicyCoordinator()

        _ = coordinator.policyAfterUpdatingSettingsWindow(isOpen: true)

        XCTAssertEqual(
            coordinator.policyAfterUpdatingSettingsWindow(isOpen: false),
            .accessory
        )
    }

}

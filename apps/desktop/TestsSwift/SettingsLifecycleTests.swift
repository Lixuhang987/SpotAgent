import AppKit
import XCTest
@testable import HandAgentDesktop

final class SettingsLifecycleTests: XCTestCase {
    @MainActor
    func testOpenOrFocusFirstTimePresentsAndPromotesPolicy() {
        var presentCount = 0
        let presenter = StubSettingsWindowPresenter { presentCount += 1 }
        var policies: [NSApplication.ActivationPolicy] = []
        let lifecycle = SettingsLifecycle(
            windowPresenter: presenter,
            activationPolicy: AppActivationPolicyCoordinator(),
            setActivationPolicy: { policies.append($0) }
        )

        lifecycle.openOrFocus(
            settingsViewModel: AgentSettingsViewModel(store: AgentSettingsStore()),
            toolSettingsViewModel: ToolSettingsViewModel(store: AgentSettingsStore()),
            workspaceViewModel: WorkspaceSettingsViewModel(),
            shortcutActions: [],
            onClosed: {}
        )

        XCTAssertEqual(presentCount, 1)
        XCTAssertEqual(policies.last, .regular)
    }

    @MainActor
    func testOpenOrFocusSecondTimeDoesNotRepresent() {
        var presentCount = 0
        let presenter = StubSettingsWindowPresenter { presentCount += 1 }
        let lifecycle = SettingsLifecycle(
            windowPresenter: presenter,
            activationPolicy: AppActivationPolicyCoordinator(),
            setActivationPolicy: { _ in }
        )

        lifecycle.openOrFocus(
            settingsViewModel: AgentSettingsViewModel(store: AgentSettingsStore()),
            toolSettingsViewModel: ToolSettingsViewModel(store: AgentSettingsStore()),
            workspaceViewModel: WorkspaceSettingsViewModel(),
            shortcutActions: [],
            onClosed: {}
        )
        lifecycle.openOrFocus(
            settingsViewModel: AgentSettingsViewModel(store: AgentSettingsStore()),
            toolSettingsViewModel: ToolSettingsViewModel(store: AgentSettingsStore()),
            workspaceViewModel: WorkspaceSettingsViewModel(),
            shortcutActions: [],
            onClosed: {}
        )

        XCTAssertEqual(presentCount, 1)
    }

    @MainActor
    func testHandleClosedDemotesPolicy() {
        var policies: [NSApplication.ActivationPolicy] = []
        let lifecycle = SettingsLifecycle(
            windowPresenter: StubSettingsWindowPresenter(),
            activationPolicy: AppActivationPolicyCoordinator(),
            setActivationPolicy: { policies.append($0) }
        )

        lifecycle.openOrFocus(
            settingsViewModel: AgentSettingsViewModel(store: AgentSettingsStore()),
            toolSettingsViewModel: ToolSettingsViewModel(store: AgentSettingsStore()),
            workspaceViewModel: WorkspaceSettingsViewModel(),
            shortcutActions: [],
            onClosed: {}
        )
        lifecycle.handleClosed()

        XCTAssertEqual(policies.suffix(2), [.regular, .accessory])
    }
}

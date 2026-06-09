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
            appearanceViewModel: AppearanceSettingsViewModel(store: AgentSettingsStore()),
            toolSettingsViewModel: ToolSettingsViewModel(store: AgentSettingsStore()),
            pluginSettingsViewModel: PluginSettingsViewModel(),
            appendPromptSettingsViewModel: AppendPromptSettingsViewModel(),
            mcpSettingsViewModel: MCPSettingsViewModel(),
            permissionRulesViewModel: PermissionRulesViewModel(),
            workspaceViewModel: WorkspaceSettingsViewModel(),
            shortcutActions: [],
            appTheme: .default,
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
            appearanceViewModel: AppearanceSettingsViewModel(store: AgentSettingsStore()),
            toolSettingsViewModel: ToolSettingsViewModel(store: AgentSettingsStore()),
            pluginSettingsViewModel: PluginSettingsViewModel(),
            appendPromptSettingsViewModel: AppendPromptSettingsViewModel(),
            mcpSettingsViewModel: MCPSettingsViewModel(),
            permissionRulesViewModel: PermissionRulesViewModel(),
            workspaceViewModel: WorkspaceSettingsViewModel(),
            shortcutActions: [],
            appTheme: .default,
            onClosed: {}
        )
        lifecycle.openOrFocus(
            settingsViewModel: AgentSettingsViewModel(store: AgentSettingsStore()),
            appearanceViewModel: AppearanceSettingsViewModel(store: AgentSettingsStore()),
            toolSettingsViewModel: ToolSettingsViewModel(store: AgentSettingsStore()),
            pluginSettingsViewModel: PluginSettingsViewModel(),
            appendPromptSettingsViewModel: AppendPromptSettingsViewModel(),
            mcpSettingsViewModel: MCPSettingsViewModel(),
            permissionRulesViewModel: PermissionRulesViewModel(),
            workspaceViewModel: WorkspaceSettingsViewModel(),
            shortcutActions: [],
            appTheme: .default,
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
            appearanceViewModel: AppearanceSettingsViewModel(store: AgentSettingsStore()),
            toolSettingsViewModel: ToolSettingsViewModel(store: AgentSettingsStore()),
            pluginSettingsViewModel: PluginSettingsViewModel(),
            appendPromptSettingsViewModel: AppendPromptSettingsViewModel(),
            mcpSettingsViewModel: MCPSettingsViewModel(),
            permissionRulesViewModel: PermissionRulesViewModel(),
            workspaceViewModel: WorkspaceSettingsViewModel(),
            shortcutActions: [],
            appTheme: .default,
            onClosed: {}
        )
        lifecycle.handleClosed()

        XCTAssertEqual(policies.suffix(2), [.regular, .accessory])
    }

    @MainActor
    func testUpdateThemeRefreshesOpenWindow() {
        let presenter = ThemeRefreshingSettingsWindowPresenter()
        let lifecycle = SettingsLifecycle(
            windowPresenter: presenter,
            activationPolicy: AppActivationPolicyCoordinator(),
            setActivationPolicy: { _ in }
        )

        lifecycle.openOrFocus(
            settingsViewModel: AgentSettingsViewModel(store: AgentSettingsStore()),
            appearanceViewModel: AppearanceSettingsViewModel(store: AgentSettingsStore()),
            toolSettingsViewModel: ToolSettingsViewModel(store: AgentSettingsStore()),
            pluginSettingsViewModel: PluginSettingsViewModel(),
            appendPromptSettingsViewModel: AppendPromptSettingsViewModel(),
            mcpSettingsViewModel: MCPSettingsViewModel(),
            permissionRulesViewModel: PermissionRulesViewModel(),
            workspaceViewModel: WorkspaceSettingsViewModel(),
            shortcutActions: [],
            appTheme: .light,
            onClosed: {}
        )

        lifecycle.updateTheme(.dark)

        XCTAssertEqual(presenter.refreshedThemes.count, 1)
    }
}

@MainActor
private final class ThemeRefreshingSettingsWindowPresenter: SettingsWindowPresenting {
    private(set) var refreshedThemes: [AppTheme] = []
    private let window = NSWindow()

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
        window
    }

    func updateTheme(_ appTheme: AppTheme, for window: NSWindow?) {
        refreshedThemes.append(appTheme)
    }
}

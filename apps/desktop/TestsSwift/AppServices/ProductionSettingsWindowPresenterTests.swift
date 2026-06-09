import AppKit
import XCTest
@testable import HandAgentDesktop

@MainActor
final class ProductionSettingsWindowPresenterTests: XCTestCase {
    func testPresentedWindowUsesAquaAppearance() {
        let presenter = ProductionSettingsWindowPresenter()

        let window = presenter.present(
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
            onClose: {}
        )
        defer { window?.close() }

        XCTAssertEqual(
            window?.appearance?.bestMatch(from: [.aqua, .darkAqua]),
            .aqua
        )
    }
}

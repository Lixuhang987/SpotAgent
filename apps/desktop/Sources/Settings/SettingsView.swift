import SwiftUI

struct SettingsView: View {
    @Bindable var settingsViewModel: AgentSettingsViewModel
    @Bindable var toolSettingsViewModel: ToolSettingsViewModel
    @Bindable var pluginSettingsViewModel: PluginSettingsViewModel
    @Bindable var appendPromptSettingsViewModel: AppendPromptSettingsViewModel
    @Bindable var mcpSettingsViewModel: MCPSettingsViewModel
    @Bindable var permissionRulesViewModel: PermissionRulesViewModel
    @Bindable var workspaceViewModel: WorkspaceSettingsViewModel
    let shortcutActions: [ActionDefinition]
    @Environment(\.appTheme) private var theme
    @State private var selectedTab = SettingsTab.model

    var body: some View {
        VStack(spacing: 0) {
            SettingsTabBar(tabs: SettingsTab.allCases, selected: $selectedTab)
            SettingsSectionSeparator()
            tabContent
        }
        .frame(width: 660, height: 520)
        .background(theme.colors.canvas)
    }

    @ViewBuilder
    private var tabContent: some View {
        switch selectedTab {
        case .model:
            AgentSettingsView(viewModel: settingsViewModel)
        case .tools:
            ToolSettingsView(viewModel: toolSettingsViewModel)
        case .plugins:
            PluginSettingsView(viewModel: pluginSettingsViewModel)
        case .appendPrompts:
            AppendPromptSettingsView(viewModel: appendPromptSettingsViewModel)
        case .mcp:
            MCPSettingsView(viewModel: mcpSettingsViewModel)
        case .permissions:
            PermissionRulesView(viewModel: permissionRulesViewModel)
        case .shortcuts:
            ShortcutSettingsView(actions: shortcutActions)
        case .workspaces:
            WorkspaceSettingsView(viewModel: workspaceViewModel)
        }
    }
}

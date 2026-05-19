import SwiftUI

struct SettingsView: View {
    @Bindable var settingsViewModel: AgentSettingsViewModel
    @Bindable var toolSettingsViewModel: ToolSettingsViewModel
    @Bindable var permissionRulesViewModel: PermissionRulesViewModel
    @Bindable var workspaceViewModel: WorkspaceSettingsViewModel
    let shortcutActions: [PromptAction]
    @Environment(\.appTheme) private var theme
    @State private var selectedTab = "model"

    private let tabs: [SettingsTabItem] = [
        SettingsTabItem(id: "model", title: "模型", icon: "cpu"),
        SettingsTabItem(id: "tools", title: "工具", icon: "slider.horizontal.3"),
        SettingsTabItem(id: "permissions", title: "权限", icon: "lock.shield"),
        SettingsTabItem(id: "shortcuts", title: "快捷键", icon: "keyboard"),
        SettingsTabItem(id: "workspaces", title: "工作区", icon: "folder"),
    ]

    var body: some View {
        VStack(spacing: 0) {
            SettingsTabBar(tabs: tabs, selected: $selectedTab)
            SettingsSectionSeparator()
            tabContent
        }
        .frame(width: 660, height: 520)
        .background(.ultraThinMaterial)
        .background(theme.colors.background.opacity(0.85))
    }

    @ViewBuilder
    private var tabContent: some View {
        switch selectedTab {
        case "model":
            AgentSettingsView(viewModel: settingsViewModel)
        case "tools":
            ToolSettingsView(viewModel: toolSettingsViewModel)
        case "permissions":
            PermissionRulesView(viewModel: permissionRulesViewModel)
        case "shortcuts":
            ShortcutSettingsView(actions: shortcutActions)
        case "workspaces":
            WorkspaceSettingsView(viewModel: workspaceViewModel)
        default:
            EmptyView()
        }
    }
}

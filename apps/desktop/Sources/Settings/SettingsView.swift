import SwiftUI

struct SettingsView: View {
    @Bindable var settingsViewModel: AgentSettingsViewModel
    let shortcutActions: [PromptAction]
    @Environment(\.appTheme) private var theme
    @State private var selectedTab = "model"

    private let tabs: [SettingsTabItem] = [
        SettingsTabItem(id: "model", title: "模型", icon: "cpu"),
        SettingsTabItem(id: "shortcuts", title: "快捷键", icon: "keyboard"),
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
        case "shortcuts":
            ShortcutSettingsView(actions: shortcutActions)
        default:
            EmptyView()
        }
    }
}

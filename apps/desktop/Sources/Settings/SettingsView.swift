import SwiftUI

struct SettingsView: View {
    @Bindable var settingsViewModel: AgentSettingsViewModel
    let shortcutActions: [PromptAction]

    var body: some View {
        TabView {
            Tab("模型", systemImage: "cpu") {
                AgentSettingsView(viewModel: settingsViewModel)
            }
            Tab("快捷键", systemImage: "keyboard") {
                ShortcutSettingsView(actions: shortcutActions)
            }
        }
        .frame(width: 580, height: 480)
    }
}

import SwiftUI

struct AgentSettingsView: View {
    @Bindable var viewModel: AgentSettingsViewModel
    @Environment(\.appTheme) private var theme

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: theme.spacing.xl) {
                GroupBox("模型") {
                    VStack(alignment: .leading, spacing: theme.spacing.md) {
                        TextField("gpt-5-mini", text: $viewModel.model)

                        Picker("接口", selection: $viewModel.api) {
                            ForEach(AgentAPIType.allCases) { api in
                                Text(api.title).tag(api)
                            }
                        }

                        TextField("https://api.openai.com/v1", text: $viewModel.baseURL)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }

                GroupBox("认证") {
                    TextField("sk-...", text: $viewModel.apiKey)
                        .privacySensitive()
                        .textFieldStyle(.roundedBorder)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                VStack(alignment: .leading, spacing: theme.spacing.sm) {
                    Text("设置会自动保存到 `~/.spotAgent/settings.json`。")
                        .foregroundStyle(theme.colors.textSecondary)

                    if let saveErrorMessage = viewModel.saveErrorMessage {
                        Text(saveErrorMessage)
                            .foregroundStyle(theme.colors.error)
                    }
                }
            }
            .padding(theme.spacing.xl)
        }
        .frame(width: 520)
    }
}

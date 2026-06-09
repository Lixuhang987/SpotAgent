import SwiftUI

struct AgentSettingsView: View {
    @Bindable var viewModel: AgentSettingsViewModel
    @Environment(\.appTheme) private var theme

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                SettingsSection {
                    SettingsRow("Provider") {
                        providerSegmented
                    }
                    SettingsRowDivider()
                    SettingsRow("模型") {
                        TextField("gpt-5-mini", text: $viewModel.model)
                            .textFieldStyle(SettingsFieldStyle())
                    }
                    SettingsRowDivider()
                    SettingsRow("接口") {
                        apiSegmented
                    }
                    SettingsRowDivider()
                    SettingsRow("Base URL") {
                        TextField("https://api.openai.com/v1", text: $viewModel.baseURL)
                            .textFieldStyle(SettingsFieldStyle())
                    }
                }

                SettingsSectionSeparator()

                SettingsSection {
                    SettingsRow("API Key") {
                        SecureField("sk-...", text: $viewModel.apiKey)
                            .privacySensitive()
                            .textFieldStyle(SettingsFieldStyle())
                    }
                }

                Spacer(minLength: 0)

                if let error = viewModel.saveErrorMessage {
                    HStack(spacing: theme.spacing.sm) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .foregroundStyle(theme.colors.error)
                            .font(.system(size: 11))
                        Text(error)
                            .font(theme.typography.captionFont)
                            .foregroundStyle(theme.colors.error)
                    }
                    .padding(theme.spacing.lg)
                }
            }
        }
    }

    private var apiSegmented: some View {
        SettingsSegmentedControl(
            AgentAPIType.allCases,
            selection: $viewModel.api,
            title: \.title
        )
        .frame(maxWidth: 340)
    }

    private var providerSegmented: some View {
        SettingsSegmentedControl(
            AgentLLMProvider.allCases,
            selection: $viewModel.provider,
            title: \.title
        )
        .frame(maxWidth: 340)
    }
}

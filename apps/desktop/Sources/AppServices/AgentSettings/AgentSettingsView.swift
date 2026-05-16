import SwiftUI

struct AgentSettingsView: View {
    @Bindable var viewModel: AgentSettingsViewModel
    @Environment(\.appTheme) private var theme

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                SettingsSection {
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
                        TextField("sk-...", text: $viewModel.apiKey)
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
        .background(theme.colors.background)
    }

    private var apiSegmented: some View {
        HStack(spacing: 0) {
            ForEach(AgentAPIType.allCases) { api in
                apiButton(api)
            }
        }
        .background(Color.black.opacity(0.3))
        .clipShape(RoundedRectangle(cornerRadius: theme.radius.sm))
        .overlay(
            RoundedRectangle(cornerRadius: theme.radius.sm)
                .strokeBorder(theme.colors.border, lineWidth: 0.5)
        )
    }

    private func apiButton(_ api: AgentAPIType) -> some View {
        let isSelected = viewModel.api == api
        return Button {
            viewModel.api = api
        } label: {
            Text(api.title)
                .font(theme.typography.captionFont)
                .fontWeight(isSelected ? .medium : .regular)
                .foregroundStyle(isSelected ? theme.colors.textPrimary : theme.colors.textSecondary)
                .padding(.horizontal, theme.spacing.md)
                .padding(.vertical, 7)
                .background(
                    RoundedRectangle(cornerRadius: theme.radius.sm - 1)
                        .fill(isSelected ? theme.colors.surface : Color.clear)
                )
        }
        .buttonStyle(.plain)
    }
}

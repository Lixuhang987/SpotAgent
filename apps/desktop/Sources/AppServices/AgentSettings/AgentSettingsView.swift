import SwiftUI

struct AgentSettingsView: View {
    @Bindable var viewModel: AgentSettingsViewModel
    @Environment(\.appTheme) private var theme

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: theme.spacing.lg) {
                modelCard
                authCard
                footer
            }
            .padding(theme.spacing.xl)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(theme.colors.background)
    }

    private var modelCard: some View {
        VStack(alignment: .leading, spacing: theme.spacing.md) {
            SettingsRow("模型 ID", hint: "传给 LLM provider 的 model 字段，例如 gpt-5-mini") {
                TextField("gpt-5-mini", text: $viewModel.model)
                    .textFieldStyle(SettingsFieldStyle())
            }

            SettingsRow("接口类型", hint: "决定 agent-server 调用 OpenAI 的哪一类 endpoint") {
                apiSegmented
            }

            SettingsRow("Base URL", hint: "可指向兼容 OpenAI 协议的代理 / 自托管服务") {
                TextField("https://api.openai.com/v1", text: $viewModel.baseURL)
                    .textFieldStyle(SettingsFieldStyle())
            }
        }
        .settingsCard("模型")
    }

    private var authCard: some View {
        SettingsRow("API Key", hint: "保存在 ~/.spotAgent/settings.json，本机使用") {
            TextField("sk-...", text: $viewModel.apiKey)
                .privacySensitive()
                .textFieldStyle(SettingsFieldStyle())
        }
        .settingsCard("认证")
    }

    private var apiSegmented: some View {
        HStack(spacing: 4) {
            ForEach(AgentAPIType.allCases) { api in
                apiSegmentButton(api)
            }
        }
        .padding(3)
        .background(theme.colors.background.opacity(0.6))
        .clipShape(RoundedRectangle(cornerRadius: theme.radius.sm))
        .overlay(
            RoundedRectangle(cornerRadius: theme.radius.sm)
                .strokeBorder(theme.colors.border, lineWidth: 0.5)
        )
    }

    private func apiSegmentButton(_ api: AgentAPIType) -> some View {
        let isSelected = viewModel.api == api
        return Button {
            viewModel.api = api
        } label: {
            Text(api.title)
                .font(theme.typography.captionFont)
                .fontWeight(isSelected ? .semibold : .regular)
                .foregroundStyle(isSelected ? theme.colors.textPrimary : theme.colors.textSecondary)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 6)
                .background(
                    RoundedRectangle(cornerRadius: theme.radius.sm - 2)
                        .fill(isSelected ? theme.colors.accentSubtle : Color.clear)
                )
        }
        .buttonStyle(.plain)
    }

    private var footer: some View {
        VStack(alignment: .leading, spacing: theme.spacing.xs) {
            Text("设置会自动保存到 ~/.spotAgent/settings.json")
                .font(theme.typography.captionFont)
                .foregroundStyle(theme.colors.textSecondary)

            if let saveErrorMessage = viewModel.saveErrorMessage {
                Text(saveErrorMessage)
                    .font(theme.typography.captionFont)
                    .foregroundStyle(theme.colors.error)
            }
        }
        .padding(.horizontal, theme.spacing.xs)
    }
}

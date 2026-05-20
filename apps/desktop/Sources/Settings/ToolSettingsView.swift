import SwiftUI

struct ToolSettingsView: View {
    @Bindable var viewModel: ToolSettingsViewModel
    @Environment(\.appTheme) private var theme

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                SettingsListSection(items: viewModel.tools) { tool in
                    toolRow(tool)
                }

                Spacer(minLength: 0)
            }
        }
    }

    private func toolRow(_ tool: BuiltinToolSetting) -> some View {
        SettingsRow(tool.title) {
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(tool.description)
                        .font(theme.typography.captionFont)
                        .foregroundStyle(theme.colors.textPrimary)
                        .lineLimit(2)
                    Spacer()
                    Text(tool.riskLabel)
                        .font(theme.typography.captionFont)
                        .foregroundStyle(riskColor(tool.risk))
                }
                HStack(spacing: 8) {
                    Text(tool.name)
                        .font(theme.typography.captionFont)
                        .foregroundStyle(theme.colors.textSecondary)
                    Spacer()
                    Toggle("启用", isOn: Binding(
                        get: { viewModel.isEnabled(tool.name) },
                        set: { viewModel.setEnabled(tool.name, enabled: $0) }
                    ))
                    .labelsHidden()
                    .toggleStyle(.switch)
                }
            }
        }
    }

    private func riskColor(_ risk: BuiltinToolSetting.Risk) -> Color {
        switch risk {
        case .low: return theme.colors.accent
        case .medium: return .orange
        case .high: return theme.colors.error
        }
    }
}

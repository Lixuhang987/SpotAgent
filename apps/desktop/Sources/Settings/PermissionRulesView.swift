import SwiftUI

struct PermissionRulesView: View {
    @Bindable var viewModel: PermissionRulesViewModel
    @Environment(\.appTheme) private var theme

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                if viewModel.rules.isEmpty {
                    emptyState
                } else {
                    SettingsListSection(items: viewModel.rules) { rule in
                        ruleRow(rule)
                    }
                }
                Spacer(minLength: 0)
            }
        }
    }

    private var emptyState: some View {
        SettingsSection {
            HStack(spacing: theme.spacing.sm) {
                Image(systemName: "lock.slash")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(theme.colors.textSecondary)
                Text("暂无永久权限规则")
                    .font(theme.typography.bodyFont)
                    .foregroundStyle(theme.colors.textSecondary)
                Spacer()
                Button {
                    viewModel.reload()
                } label: {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 12))
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func ruleRow(_ rule: PermissionRuleEntry) -> some View {
        SettingsRow(rule.toolName) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    Text(rule.decision == "allow" ? "允许" : "拒绝")
                        .font(theme.typography.captionFont)
                        .foregroundStyle(rule.decision == "allow" ? theme.colors.accent : theme.colors.error)
                    Text(rule.createdAtText)
                        .font(theme.typography.captionFont)
                        .foregroundStyle(theme.colors.textSecondary)
                    Spacer()
                    Button("撤销") {
                        viewModel.revoke(ruleId: rule.id)
                    }
                    .font(theme.typography.captionFont)
                    .buttonStyle(.plain)
                    .foregroundStyle(theme.colors.error)
                }
                Text(rule.argumentsSummary)
                    .font(theme.typography.captionFont.monospaced())
                    .foregroundStyle(theme.colors.textSecondary)
                    .textSelection(.enabled)
                    .lineLimit(4)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }
}

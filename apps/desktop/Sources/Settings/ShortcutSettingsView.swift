import KeyboardShortcuts
import SwiftUI

struct ShortcutSettingsView: View {
    let actions: [PromptAction]
    @Environment(\.appTheme) private var theme

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: theme.spacing.lg) {
                globalCard
                actionsCard
            }
            .padding(theme.spacing.xl)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(theme.colors.background)
    }

    private var globalCard: some View {
        VStack(alignment: .leading, spacing: theme.spacing.md) {
            shortcutRow(
                title: "唤起 PromptPanel",
                hint: "全局任意位置按下后打开命令面板"
            ) {
                KeyboardShortcuts.Recorder("", name: .showPromptPanel)
            }
        }
        .settingsCard("全局快捷键")
    }

    private var actionsCard: some View {
        VStack(alignment: .leading, spacing: theme.spacing.md) {
            if actions.isEmpty {
                Text("当前没有可配置的 PromptAction")
                    .font(theme.typography.captionFont)
                    .foregroundStyle(theme.colors.textSecondary)
            } else {
                ForEach(Array(actions.enumerated()), id: \.element.id) { index, action in
                    if index > 0 {
                        Divider().overlay(theme.colors.border)
                    }
                    shortcutRow(title: action.title, hint: nil) {
                        KeyboardShortcuts.Recorder("", name: action.shortcutName)
                    }
                }
            }
        }
        .settingsCard("PromptAction 快捷键")
    }

    private func shortcutRow<Recorder: View>(
        title: String,
        hint: String?,
        @ViewBuilder recorder: () -> Recorder
    ) -> some View {
        HStack(alignment: .center, spacing: theme.spacing.md) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(theme.typography.bodyFont)
                    .foregroundStyle(theme.colors.textPrimary)
                if let hint {
                    Text(hint)
                        .font(theme.typography.captionFont)
                        .foregroundStyle(theme.colors.textSecondary)
                }
            }
            Spacer(minLength: theme.spacing.md)
            recorder()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

import SwiftUI

private enum UIConstants {
    static let maxContentWidth: CGFloat = 720
}

struct SessionWorkspaceView: View {
    let tabs: [SessionTabViewModel]
    let activeTabID: String?
    let activeTab: SessionTabViewModel?
    @Binding var draft: String
    let onActivateTab: (String) -> Void
    let onCloseTab: (String) -> Void
    let onNewTab: () -> Void
    let onStopActiveTab: () -> Void
    let onSendPrompt: (String) -> Void

    @Environment(\.appTheme) private var theme

    var body: some View {
        VStack(spacing: 0) {
            if !tabs.isEmpty {
                SessionTabBarView(
                    tabs: tabs,
                    activeTabID: activeTabID,
                    onActivate: onActivateTab,
                    onClose: onCloseTab,
                    onNewTab: onNewTab
                )
            }

            if let activeTab {
                SessionContentView(tab: activeTab)
            } else {
                SessionEmptyStateView()
            }

            SessionComposerView(
                draft: $draft,
                canSendPrompt: activeTab?.canSendPrompt ?? true,
                isRunning: activeTab?.status.isRunning ?? false,
                onSendPrompt: onSendPrompt,
                onStop: onStopActiveTab
            )
        }
        .background(theme.colors.background)
    }
}

struct SessionEmptyStateView: View {
    @Environment(\.appTheme) private var theme

    var body: some View {
        VStack(spacing: theme.spacing.md) {
            Image(systemName: "bubble.left.and.text.bubble.right")
                .font(.system(size: 30, weight: .medium))
                .foregroundStyle(theme.colors.accent)
                .accessibilityHidden(true)

            VStack(spacing: theme.spacing.xs) {
                Text("选择会话或开始新对话")
                    .font(theme.typography.titleFont)
                    .foregroundStyle(theme.colors.textPrimary)
                Text("左侧历史用于恢复上下文；底部输入会创建新会话。")
                    .font(theme.typography.bodyFont)
                    .foregroundStyle(theme.colors.textSecondary)
            }
        }
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

struct SessionComposerView: View {
    @Binding var draft: String
    let canSendPrompt: Bool
    let isRunning: Bool
    let onSendPrompt: (String) -> Void
    let onStop: () -> Void

    @Environment(\.appTheme) private var theme
    @FocusState private var isFocused: Bool

    var body: some View {
        HStack(spacing: theme.spacing.md) {
            Button(action: {}) {
                Image(systemName: "plus")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(theme.colors.textSecondary)
                    .frame(width: 28, height: 28)
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .help("添加附件")

            TextField("发送消息", text: $draft, axis: .vertical)
                .textFieldStyle(.plain)
                .font(theme.typography.promptInputFont)
                .foregroundStyle(theme.colors.textPrimary)
                .lineLimit(1...5)
                .focused($isFocused)
                .disabled(!canSendPrompt)
                .onSubmit(submit)

            Button(action: {}) {
                Image(systemName: "mic")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(theme.colors.textSecondary.opacity(0.5))
                    .frame(width: 28, height: 28)
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .disabled(true)
            .help("语音输入（即将推出）")

            if isRunning {
                Button(action: onStop) {
                    Image(systemName: "stop.fill")
                        .font(.system(size: 12))
                        .foregroundStyle(theme.colors.background)
                        .frame(width: 28, height: 28)
                        .background(theme.colors.accent)
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)
                .help("停止")
            } else {
                Button(action: submit) {
                    Image(systemName: "arrow.up")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(canSubmit ? theme.colors.background : theme.colors.textSecondary)
                        .frame(width: 28, height: 28)
                        .background(canSubmit ? theme.colors.accent : theme.colors.surfaceHover)
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)
                .disabled(!canSubmit)
                .help("发送消息")
            }
        }
        .padding(.horizontal, theme.spacing.lg)
        .padding(.vertical, theme.spacing.md)
        .background(theme.colors.surface)
        .clipShape(RoundedRectangle(cornerRadius: theme.radius.pill))
        .overlay(
            RoundedRectangle(cornerRadius: theme.radius.pill)
                .strokeBorder(isFocused ? Color.white.opacity(0.12) : theme.colors.border, lineWidth: 0.75)
        )
        .frame(maxWidth: UIConstants.maxContentWidth)
        .frame(maxWidth: .infinity)
        .padding(.horizontal, theme.spacing.xl)
        .padding(.vertical, theme.spacing.md)
    }

    private var canSubmit: Bool {
        canSendPrompt && !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func submit() {
        guard canSubmit else { return }
        let currentDraft = draft
        draft = ""
        onSendPrompt(currentDraft)
    }
}

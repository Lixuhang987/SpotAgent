import SwiftUI

struct SessionWorkspaceView: View {
    let tabs: [SessionTabViewModel]
    let activeTabID: String?
    let activeTab: SessionTabViewModel?
    @Binding var draft: String
    let onActivateTab: (String) -> Void
    let onCloseTab: (String) -> Void
    let onStopActiveTab: () -> Void
    let onSendPrompt: (String) -> Void

    @Environment(\.appTheme) private var theme

    var body: some View {
        VStack(spacing: 0) {
            SessionStatusHeaderView(
                tab: activeTab,
                openTabCount: tabs.count,
                onStop: onStopActiveTab
            )

            if !tabs.isEmpty {
                SessionTabBarView(
                    tabs: tabs,
                    activeTabID: activeTabID,
                    onActivate: onActivateTab,
                    onClose: onCloseTab
                )
            }

            Divider().overlay(theme.colors.border)

            if let connectionMessage = activeTab?.connectionMessage {
                SessionConnectionBannerView(message: connectionMessage)
            }

            if let activeTab {
                SessionContentView(tab: activeTab)
            } else {
                SessionEmptyStateView()
            }

            Divider().overlay(theme.colors.border)

            SessionComposerView(
                draft: $draft,
                canSendPrompt: activeTab?.canSendPrompt ?? true,
                onSendPrompt: onSendPrompt
            )
        }
        .background(theme.colors.background)
    }
}

struct SessionStatusHeaderView: View {
    let tab: SessionTabViewModel?
    let openTabCount: Int
    let onStop: () -> Void

    @Environment(\.appTheme) private var theme

    var body: some View {
        HStack(spacing: theme.spacing.md) {
            VStack(alignment: .leading, spacing: theme.spacing.xs) {
                Text(title)
                    .font(theme.typography.titleFont)
                    .foregroundStyle(theme.colors.textPrimary)
                    .lineLimit(1)
                    .truncationMode(.tail)

                HStack(spacing: theme.spacing.sm) {
                    SessionStatusPill(label: statusLabel, color: statusColor)
                    Text(openTabCountLabel)
                        .font(theme.typography.captionFont)
                        .foregroundStyle(theme.colors.textSecondary)
                }
            }

            Spacer()

            if tab?.status.isRunning == true {
                SessionStopButton(onStop: onStop)
            }
        }
        .padding(.horizontal, theme.spacing.xl)
        .padding(.top, theme.spacing.xl)
        .padding(.bottom, theme.spacing.md)
        .background(theme.colors.background)
    }

    private var title: String {
        guard let tab else { return "HandAgent" }
        let rawTitle = tab.messages.first {
            !$0.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }?.text ?? "Session \(tab.sessionID.prefix(8))"
        return rawTitle.replacingOccurrences(of: "\n", with: " ")
    }

    private var openTabCountLabel: String {
        openTabCount == 0 ? "没有打开的标签页" : "\(openTabCount) 个已打开标签页"
    }

    private var statusColor: Color {
        guard let tab else {
            return theme.colors.textSecondary.opacity(0.4)
        }
        switch tab.connectionState {
        case .connected:
            return tab.status.isRunning ? theme.colors.accent : theme.colors.textSecondary.opacity(0.4)
        case .connecting, .reconnecting:
            return theme.colors.accent
        case .disconnected:
            return theme.colors.error
        }
    }

    private var statusLabel: String {
        guard let tab else { return "空闲" }
        switch tab.connectionState {
        case .connected:
            return tab.status.displayName
        case .connecting:
            return "连接中"
        case .reconnecting:
            return "重连中"
        case .disconnected:
            return "已断开"
        }
    }
}

struct SessionStatusPill: View {
    let label: String
    let color: Color

    @Environment(\.appTheme) private var theme

    var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(color)
                .frame(width: 7, height: 7)
            Text(label)
                .font(theme.typography.captionFont)
                .foregroundStyle(theme.colors.textSecondary)
        }
        .padding(.horizontal, theme.spacing.sm)
        .padding(.vertical, 4)
        .background(theme.colors.surface.opacity(0.55))
        .clipShape(RoundedRectangle(cornerRadius: theme.radius.sm))
        .overlay(
            RoundedRectangle(cornerRadius: theme.radius.sm)
                .strokeBorder(theme.colors.border, lineWidth: 0.5)
        )
        .accessibilityElement(children: .combine)
    }
}

struct SessionStopButton: View {
    let onStop: () -> Void

    @Environment(\.appTheme) private var theme

    var body: some View {
        Button(action: onStop) {
            Label("停止", systemImage: "stop.fill")
                .font(theme.typography.captionFont)
                .foregroundStyle(theme.colors.error)
                .padding(.horizontal, theme.spacing.sm)
                .padding(.vertical, 6)
                .background(theme.colors.error.opacity(0.10))
                .clipShape(RoundedRectangle(cornerRadius: theme.radius.sm))
                .overlay(
                    RoundedRectangle(cornerRadius: theme.radius.sm)
                        .strokeBorder(theme.colors.error.opacity(0.28), lineWidth: 0.75)
                )
        }
        .buttonStyle(.plain)
        .help("停止当前 run")
    }
}

struct SessionConnectionBannerView: View {
    let message: String

    @Environment(\.appTheme) private var theme

    var body: some View {
        HStack(spacing: theme.spacing.sm) {
            Image(systemName: "wifi.exclamationmark")
                .foregroundStyle(theme.colors.accent)
                .font(.system(size: 12))
            Text(message)
                .font(theme.typography.captionFont)
                .foregroundStyle(theme.colors.textSecondary)
        }
        .padding(.horizontal, theme.spacing.xl)
        .padding(.vertical, theme.spacing.sm)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(theme.colors.accentSubtle.opacity(0.78))
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
    let onSendPrompt: (String) -> Void

    @Environment(\.appTheme) private var theme

    var body: some View {
        HStack(spacing: theme.spacing.md) {
            TextField("向当前会话发送消息", text: $draft)
                .textFieldStyle(.plain)
                .font(theme.typography.bodyFont)
                .foregroundStyle(theme.colors.textPrimary)
                .disabled(!canSendPrompt)
                .onSubmit(submit)

            Button(action: submit) {
                Image(systemName: "arrow.up")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(canSubmit ? theme.colors.background : theme.colors.textSecondary)
                    .frame(width: 28, height: 28)
                    .background(canSubmit ? theme.colors.accent : theme.colors.surface.opacity(0.8))
                    .clipShape(Circle())
            }
            .buttonStyle(.plain)
            .disabled(!canSubmit)
            .accessibilityLabel("发送消息")
            .help(canSendPrompt ? "发送消息" : "连接恢复后可发送")
        }
        .padding(.horizontal, theme.spacing.md)
        .padding(.vertical, theme.spacing.sm)
        .background(theme.colors.surface.opacity(canSendPrompt ? 0.68 : 0.38))
        .clipShape(RoundedRectangle(cornerRadius: theme.radius.md))
        .overlay(
            RoundedRectangle(cornerRadius: theme.radius.md)
                .strokeBorder(canSendPrompt ? theme.colors.border : theme.colors.border.opacity(0.55), lineWidth: 0.75)
        )
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

private extension SessionRunStatus {
    var displayName: String {
        switch self {
        case .idle:
            return "空闲"
        case .running:
            return "运行中"
        case .failed:
            return "失败"
        case .interrupted:
            return "已停止"
        }
    }
}

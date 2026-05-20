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
                onStop: onStopActiveTab
            )
            SessionTabBarView(
                tabs: tabs,
                activeTabID: activeTabID,
                onActivate: onActivateTab,
                onClose: onCloseTab
            )
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
    }
}

struct SessionStatusHeaderView: View {
    let tab: SessionTabViewModel?
    let onStop: () -> Void

    @Environment(\.appTheme) private var theme

    var body: some View {
        HStack(spacing: theme.spacing.sm) {
            Circle()
                .fill(statusColor)
                .frame(width: 8, height: 8)
            Text(statusLabel)
                .font(theme.typography.captionFont)
                .foregroundStyle(theme.colors.textSecondary)
            Spacer()
            if tab?.status.isRunning == true {
                Button(action: onStop) {
                    Image(systemName: "stop.fill")
                        .font(.system(size: 11))
                        .foregroundStyle(theme.colors.error)
                }
                .buttonStyle(.plain)
                .help("停止当前 run")
            }
        }
        .padding(.horizontal, theme.spacing.xl)
        .padding(.vertical, theme.spacing.md)
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
        guard let tab else { return "idle" }
        switch tab.connectionState {
        case .connected:
            return tab.status.rawValue
        case .connecting:
            return "connecting"
        case .reconnecting:
            return "reconnecting"
        case .disconnected:
            return "disconnected"
        }
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
        .background(theme.colors.accentSubtle)
    }
}

struct SessionEmptyStateView: View {
    @Environment(\.appTheme) private var theme

    var body: some View {
        VStack(spacing: theme.spacing.sm) {
            Text("选择左侧会话继续")
                .font(theme.typography.titleFont)
                .foregroundStyle(theme.colors.textPrimary)
            Text("也可以直接发送消息创建新会话。")
                .font(theme.typography.bodyFont)
                .foregroundStyle(theme.colors.textSecondary)
        }
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
            TextField("继续追问", text: $draft)
                .textFieldStyle(.plain)
                .font(theme.typography.bodyFont)
                .foregroundStyle(theme.colors.textPrimary)
                .disabled(!canSendPrompt)
                .onSubmit(submit)
        }
        .padding(.horizontal, theme.spacing.xl)
        .padding(.vertical, theme.spacing.md)
    }

    private func submit() {
        guard canSendPrompt else { return }
        let currentDraft = draft
        draft = ""
        onSendPrompt(currentDraft)
    }
}

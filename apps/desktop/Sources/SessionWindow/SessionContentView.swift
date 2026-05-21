import SwiftUI

private enum UIConstants {
    static let maxContentWidth: CGFloat = 720
}

struct SessionContentView: View {
    let tab: SessionTabViewModel

    var body: some View {
        VStack(spacing: 0) {
            SessionMessageListView(
                messages: tab.messages,
                onCopyMessage: { tab.copyMessage(messageID: $0) }
            )

            if let error = tab.error {
                SessionErrorBannerView(error: error)
            }

            ForEach(tab.pendingPermissionRequests) { request in
                SessionPermissionBubbleView(request: request, tab: tab)
            }

            if let request = tab.visibleWorkspaceAskRequest {
                SessionWorkspaceAskBubbleView(request: request, tab: tab)
            }
        }
    }
}

struct SessionMessageListView: View {
    let messages: [SessionBubble]
    let onCopyMessage: (String) -> Void

    @Environment(\.appTheme) private var theme

    private var lastAssistantMessageID: String? {
        messages.last(where: { $0.role == "assistant" && !$0.text.isEmpty })?.id
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: theme.spacing.md) {
                ForEach(messages) { message in
                    SessionMessageBubbleView(message: message)
                        .transition(.move(edge: .bottom).combined(with: .opacity))

                    if message.id == lastAssistantMessageID {
                        SessionMessageActionRow(onCopy: { onCopyMessage(message.id) })
                    }
                }
            }
            .padding(.horizontal, theme.spacing.xl)
            .padding(.vertical, theme.spacing.lg)
            .frame(maxWidth: UIConstants.maxContentWidth)
            .frame(maxWidth: .infinity)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(theme.colors.background)
    }
}

struct SessionMessageBubbleView: View {
    let message: SessionBubble

    @Environment(\.appTheme) private var theme

    var body: some View {
        VStack(alignment: message.role == "user" ? .trailing : .leading, spacing: theme.spacing.sm) {
            VStack(alignment: .leading, spacing: theme.spacing.sm) {
                Text(message.text)
                    .textSelection(.enabled)
                    .frame(maxWidth: message.role == "user" ? nil : .infinity, alignment: .leading)

                if let attachmentSummaryText = message.attachmentSummaryText {
                    Text(attachmentSummaryText)
                        .font(theme.typography.captionFont)
                        .foregroundStyle(theme.colors.textSecondary)

                    ForEach(message.attachments) { attachment in
                        SessionAttachmentRowView(attachment: attachment)
                    }
                }
            }
            .messageBubble(role: message.role)
        }
        .frame(maxWidth: message.role == "user" ? UIConstants.maxContentWidth * 0.85 : .infinity,
               alignment: message.role == "user" ? .trailing : .leading)
    }
}

struct SessionMessageActionRow: View {
    let onCopy: () -> Void

    @Environment(\.appTheme) private var theme

    var body: some View {
        HStack(spacing: theme.spacing.sm) {
            SessionMessageCopyButton(isDisabled: false, onCopy: onCopy)
            Spacer()
        }
        .frame(height: theme.spacing.xxl)
    }
}

struct SessionMessageCopyButton: View {
    let isDisabled: Bool
    let onCopy: () -> Void

    @Environment(\.appTheme) private var theme

    var body: some View {
        Button(action: onCopy) {
            Image(systemName: "doc.on.doc")
                .font(theme.typography.captionFont)
                .foregroundStyle(isDisabled ? theme.colors.textSecondary.opacity(0.35) : theme.colors.textSecondary)
                .frame(width: theme.spacing.xxl, height: theme.spacing.xxl)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(isDisabled)
        .help("复制消息")
        .accessibilityLabel("复制消息")
        .accessibilityHint("将这条消息复制到剪贴板")
    }
}

struct SessionAttachmentRowView: View {
    let attachment: SessionAttachmentSummary

    @Environment(\.appTheme) private var theme

    var body: some View {
        HStack(alignment: .top, spacing: theme.spacing.sm) {
            Image(systemName: attachment.kind == "image" ? "photo" : "text.quote")
                .font(theme.typography.captionFont)
                .foregroundStyle(theme.colors.accent)
                .frame(width: theme.spacing.lg)
            VStack(alignment: .leading, spacing: theme.spacing.xs) {
                HStack(spacing: theme.spacing.sm) {
                    Text(attachment.title)
                        .font(theme.typography.captionFont)
                        .foregroundStyle(theme.colors.textPrimary)
                    Text(attachment.kind)
                        .font(theme.typography.captionFont.monospaced())
                        .foregroundStyle(theme.colors.textSecondary)
                }
                if let detail = attachment.detail, !detail.isEmpty {
                    Text(detail)
                        .font(theme.typography.captionFont)
                        .foregroundStyle(theme.colors.textSecondary)
                        .lineLimit(2)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct SessionErrorBannerView: View {
    let error: String

    @Environment(\.appTheme) private var theme

    var body: some View {
        HStack(spacing: theme.spacing.sm) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(theme.colors.error)
                .font(.system(size: 12))
            Text(error)
                .font(theme.typography.captionFont)
                .foregroundStyle(theme.colors.error)
        }
        .padding(.horizontal, theme.spacing.xl)
        .padding(.vertical, theme.spacing.sm)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

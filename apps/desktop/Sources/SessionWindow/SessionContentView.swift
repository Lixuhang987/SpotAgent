import SwiftUI

struct SessionContentView: View {
    let tab: SessionTabViewModel

    var body: some View {
        VStack(spacing: 0) {
            SessionMessageListView(messages: tab.messages)

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

    @Environment(\.appTheme) private var theme

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: theme.spacing.md) {
                ForEach(messages) { message in
                    SessionMessageBubbleView(message: message)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .padding(.horizontal, theme.spacing.xl)
            .padding(.vertical, theme.spacing.lg)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(theme.colors.background)
    }
}

struct SessionMessageBubbleView: View {
    let message: SessionBubble

    @Environment(\.appTheme) private var theme

    var body: some View {
        VStack(alignment: .leading, spacing: theme.spacing.sm) {
            Text(message.text)
                .frame(maxWidth: .infinity, alignment: .leading)

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
        .background(theme.colors.error.opacity(0.09))
        .overlay(alignment: .top) {
            Divider().overlay(theme.colors.error.opacity(0.18))
        }
    }
}

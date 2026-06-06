import SwiftUI

struct MessageBubbleModifier: ViewModifier {
    let role: String
    @Environment(\.appTheme) private var theme

    func body(content: Content) -> some View {
        switch role {
        case "user":
            content
                .font(theme.typography.bodyFont)
                .foregroundStyle(theme.colors.textPrimary)
                .padding(.horizontal, theme.spacing.md)
                .padding(.vertical, 10)
                .background(theme.colors.userBubble)
                .clipShape(RoundedRectangle(cornerRadius: theme.radius.bubble))
                .frame(maxWidth: .infinity, alignment: .trailing)
        case "tool":
            content
                .font(theme.typography.captionFont)
                .foregroundStyle(theme.colors.textSecondary)
                .frame(maxWidth: .infinity, alignment: .leading)
        default:
            content
                .font(theme.typography.bodyFont)
                .foregroundStyle(theme.colors.textPrimary)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

extension View {
    func messageBubble(role: String) -> some View {
        modifier(MessageBubbleModifier(role: role))
    }
}

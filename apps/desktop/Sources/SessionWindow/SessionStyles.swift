import SwiftUI

struct MessageBubbleModifier: ViewModifier {
    let role: String
    @Environment(\.appTheme) private var theme

    func body(content: Content) -> some View {
        content
            .frame(
                maxWidth: .infinity,
                alignment: role == "user" ? .trailing : .leading
            )
            .padding(.horizontal, theme.spacing.md)
            .padding(.vertical, 10)
            .background(bubbleColor)
            .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private var bubbleColor: Color {
        switch role {
        case "user": return theme.colors.userBubble
        case "tool": return theme.colors.toolBubble
        default: return theme.colors.assistantBubble
        }
    }
}

extension View {
    func messageBubble(role: String) -> some View {
        modifier(MessageBubbleModifier(role: role))
    }
}

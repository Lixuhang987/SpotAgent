import SwiftUI

struct StatusBubbleContainerModifier: ViewModifier {
    @Environment(\.appTheme) private var theme
    var isRunning: Bool = false

    func body(content: Content) -> some View {
        content
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, theme.spacing.md)
            .padding(.horizontal, theme.spacing.lg)
            .background(theme.colors.canvas.opacity(0.96))
            .clipShape(RoundedRectangle(cornerRadius: theme.radius.lg))
            .overlay {
                RoundedRectangle(cornerRadius: theme.radius.lg)
                    .strokeBorder(
                        isRunning ? theme.colors.accent.opacity(0.55) : theme.colors.hairline,
                        lineWidth: isRunning ? 1.2 : 0.8
                    )
            }
            .shadow(
                color: isRunning ? theme.colors.accent.opacity(0.18) : theme.colors.ink.opacity(0.12),
                radius: isRunning ? 14 : 10, x: 0, y: 4
            )
    }
}

extension View {
    func statusBubbleContainer(isRunning: Bool = false) -> some View {
        modifier(StatusBubbleContainerModifier(isRunning: isRunning))
    }
}

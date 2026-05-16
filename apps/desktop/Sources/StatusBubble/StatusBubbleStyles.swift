import SwiftUI

struct StatusBubbleContainerModifier: ViewModifier {
    @Environment(\.appTheme) private var theme
    var isRunning: Bool = false

    func body(content: Content) -> some View {
        content
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(.ultraThinMaterial)
            .background(theme.colors.background.opacity(0.9))
            .clipShape(RoundedRectangle(cornerRadius: theme.radius.lg))
            .overlay {
                RoundedRectangle(cornerRadius: theme.radius.lg)
                    .strokeBorder(
                        isRunning ? theme.colors.accent.opacity(0.4) : theme.colors.border,
                        lineWidth: isRunning ? 1.5 : 0.5
                    )
            }
            .shadow(
                color: isRunning ? theme.colors.accent.opacity(0.2) : .clear,
                radius: 8, x: 0, y: 2
            )
    }
}

extension View {
    func statusBubbleContainer(isRunning: Bool = false) -> some View {
        modifier(StatusBubbleContainerModifier(isRunning: isRunning))
    }
}

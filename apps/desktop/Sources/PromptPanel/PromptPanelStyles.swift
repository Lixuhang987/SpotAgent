import SwiftUI

struct PromptPanelContainerModifier: ViewModifier {
    @Environment(\.appTheme) private var theme

    func body(content: Content) -> some View {
        content
            .padding(theme.spacing.xl)
            .frame(minWidth: 640, minHeight: 420)
            .background(.ultraThinMaterial)
            .background(theme.colors.background.opacity(0.85))
            .borderedCard(fill: .clear, border: theme.colors.border, cornerRadius: theme.radius.lg)
    }
}

struct ActionRowModifier: ViewModifier {
    @Environment(\.appTheme) private var theme
    var isHighlighted: Bool = false

    func body(content: Content) -> some View {
        content
            .padding(.vertical, 10)
            .padding(.horizontal, theme.spacing.md)
            .background(
                RoundedRectangle(cornerRadius: theme.radius.md)
                    .fill(isHighlighted ? theme.colors.accentSubtle : Color.clear)
            )
            .contentShape(RoundedRectangle(cornerRadius: theme.radius.md))
    }
}

extension View {
    func promptPanelContainer() -> some View {
        modifier(PromptPanelContainerModifier())
    }

    func actionRow(isHighlighted: Bool = false) -> some View {
        modifier(ActionRowModifier(isHighlighted: isHighlighted))
    }
}

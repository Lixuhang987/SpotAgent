import SwiftUI

struct PromptPanelContainerModifier: ViewModifier {
    @Environment(\.appTheme) private var theme

    func body(content: Content) -> some View {
        content
            .padding(theme.spacing.xl)
            .frame(minWidth: 640, minHeight: 420)
            .background(theme.colors.canvas.opacity(0.97))
            .clipShape(RoundedRectangle(cornerRadius: theme.radius.lg))
            .overlay(
                RoundedRectangle(cornerRadius: theme.radius.lg)
                    .strokeBorder(theme.colors.hairline, lineWidth: 0.8)
            )
            .shadow(color: theme.colors.ink.opacity(0.14), radius: 26, x: 0, y: 18)
    }
}

struct ActionRowModifier: ViewModifier {
    @Environment(\.appTheme) private var theme
    var isHighlighted: Bool = false

    func body(content: Content) -> some View {
        content
            .padding(.vertical, 9)
            .padding(.horizontal, theme.spacing.md)
            .background(
                RoundedRectangle(cornerRadius: theme.radius.md)
                    .fill(isHighlighted ? theme.colors.surfaceHover : Color.clear)
            )
            .overlay(
                RoundedRectangle(cornerRadius: theme.radius.md)
                    .strokeBorder(isHighlighted ? theme.colors.accentRing : Color.clear, lineWidth: 0.8)
            )
            .contentShape(RoundedRectangle(cornerRadius: theme.radius.md))
    }
}

struct PromptPanelIconButtonModifier: ViewModifier {
    @Environment(\.appTheme) private var theme
    let isHovered: Bool

    func body(content: Content) -> some View {
        content
            .frame(width: 32, height: 32)
            .background(
                RoundedRectangle(cornerRadius: theme.radius.md)
                    .fill(isHovered ? theme.colors.surfaceHover : Color.clear)
            )
            .contentShape(RoundedRectangle(cornerRadius: theme.radius.md))
    }
}

struct PromptPanelTriggerPillModifier: ViewModifier {
    @Environment(\.appTheme) private var theme
    let isHighlighted: Bool

    func body(content: Content) -> some View {
        content
            .font(theme.typography.captionFont)
            .foregroundStyle(isHighlighted ? theme.colors.accent : theme.colors.muted)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(
                Capsule()
                    .fill(isHighlighted ? theme.colors.surfaceHover : theme.colors.surfaceSoft)
            )
            .overlay(
                Capsule()
                    .strokeBorder(isHighlighted ? theme.colors.accentRing : theme.colors.hairlineSoft, lineWidth: 0.6)
            )
    }
}

extension View {
    func promptPanelContainer() -> some View {
        modifier(PromptPanelContainerModifier())
    }

    func actionRow(isHighlighted: Bool = false) -> some View {
        modifier(ActionRowModifier(isHighlighted: isHighlighted))
    }

    func promptPanelIconButton(isHovered: Bool) -> some View {
        modifier(PromptPanelIconButtonModifier(isHovered: isHovered))
    }

    func promptPanelTriggerPill(isHighlighted: Bool) -> some View {
        modifier(PromptPanelTriggerPillModifier(isHighlighted: isHighlighted))
    }
}

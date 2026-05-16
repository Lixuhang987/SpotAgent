import SwiftUI

struct PromptPanelContainerModifier: ViewModifier {
    @Environment(\.appTheme) private var theme

    func body(content: Content) -> some View {
        content
            .padding(theme.spacing.xl)
            .frame(minWidth: 640, minHeight: 420)
            .background(theme.colors.background)
    }
}

struct ActionRowModifier: ViewModifier {
    @Environment(\.appTheme) private var theme

    func body(content: Content) -> some View {
        content
            .padding(.vertical, theme.spacing.sm)
            .contentShape(Rectangle())
    }
}

extension View {
    func promptPanelContainer() -> some View {
        modifier(PromptPanelContainerModifier())
    }

    func actionRow() -> some View {
        modifier(ActionRowModifier())
    }
}

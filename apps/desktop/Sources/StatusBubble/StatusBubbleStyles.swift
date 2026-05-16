import SwiftUI

struct StatusBubbleContainerModifier: ViewModifier {
    @Environment(\.appTheme) private var theme

    func body(content: Content) -> some View {
        content
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(theme.colors.background)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .overlay {
                RoundedRectangle(cornerRadius: 16)
                    .stroke(theme.colors.border, lineWidth: 1)
            }
    }
}

extension View {
    func statusBubbleContainer() -> some View {
        modifier(StatusBubbleContainerModifier())
    }
}

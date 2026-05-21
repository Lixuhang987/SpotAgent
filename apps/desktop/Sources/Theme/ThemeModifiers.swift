import SwiftUI

struct BorderedCardModifier: ViewModifier {
    let fill: Color
    let border: Color
    let cornerRadius: CGFloat
    let borderWidth: CGFloat

    func body(content: Content) -> some View {
        content
            .background(fill)
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius))
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius)
                    .strokeBorder(border, lineWidth: borderWidth)
            )
    }
}

extension View {
    func borderedCard(
        fill: Color,
        border: Color,
        cornerRadius: CGFloat,
        borderWidth: CGFloat = 0.5
    ) -> some View {
        modifier(BorderedCardModifier(
            fill: fill,
            border: border,
            cornerRadius: cornerRadius,
            borderWidth: borderWidth
        ))
    }
}

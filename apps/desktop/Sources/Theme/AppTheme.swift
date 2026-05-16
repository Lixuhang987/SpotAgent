import SwiftUI

struct AppTheme: Sendable {
    let colors: ThemeColors
    let typography: ThemeTypography
    let spacing: ThemeSpacing

    static let `default` = AppTheme(
        colors: .default,
        typography: .default,
        spacing: .default
    )
}

struct ThemeColors: Sendable {
    let background: Color
    let surface: Color
    let primary: Color
    let secondary: Color
    let accent: Color
    let error: Color
    let userBubble: Color
    let assistantBubble: Color
    let toolBubble: Color
    let border: Color
    let textPrimary: Color
    let textSecondary: Color

    static let `default` = ThemeColors(
        background: Color(nsColor: .windowBackgroundColor),
        surface: Color(nsColor: .controlBackgroundColor),
        primary: Color.primary,
        secondary: Color.secondary,
        accent: Color.accentColor,
        error: Color.red,
        userBubble: Color(nsColor: .selectedContentBackgroundColor),
        assistantBubble: Color(nsColor: .windowBackgroundColor),
        toolBubble: Color(nsColor: .controlBackgroundColor),
        border: Color.black.opacity(0.08),
        textPrimary: Color.primary,
        textSecondary: Color.secondary
    )
}

struct ThemeTypography: Sendable {
    let titleFont: Font
    let bodyFont: Font
    let captionFont: Font
    let promptInputFont: Font

    static let `default` = ThemeTypography(
        titleFont: .headline,
        bodyFont: .body,
        captionFont: .subheadline,
        promptInputFont: .system(size: 20, weight: .semibold)
    )
}

struct ThemeSpacing: Sendable {
    let xs: CGFloat
    let sm: CGFloat
    let md: CGFloat
    let lg: CGFloat
    let xl: CGFloat
    let xxl: CGFloat

    static let `default` = ThemeSpacing(
        xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24
    )
}

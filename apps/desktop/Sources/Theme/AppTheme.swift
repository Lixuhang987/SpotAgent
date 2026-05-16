import SwiftUI

struct AppTheme: Sendable {
    let colors: ThemeColors
    let typography: ThemeTypography
    let spacing: ThemeSpacing
    let radius: ThemeRadius
    let animation: ThemeAnimation

    static let `default` = AppTheme(
        colors: .default,
        typography: .default,
        spacing: .default,
        radius: .default,
        animation: .default
    )
}

struct ThemeColors: Sendable {
    let background: Color
    let surface: Color
    let primary: Color
    let secondary: Color
    let accent: Color
    let accentHover: Color
    let accentPressed: Color
    let accentSubtle: Color
    let accentRing: Color
    let error: Color
    let userBubble: Color
    let assistantBubble: Color
    let toolBubble: Color
    let border: Color
    let textPrimary: Color
    let textSecondary: Color

    static let `default` = ThemeColors(
        background: Color(red: 0.043, green: 0.043, blue: 0.059),
        surface: Color.white.opacity(0.04),
        primary: Color(red: 0.949, green: 0.949, blue: 0.961),
        secondary: Color(red: 0.604, green: 0.604, blue: 0.659),
        accent: Color(red: 1.0, green: 0.663, blue: 0.278),
        accentHover: Color(red: 1.0, green: 0.580, blue: 0.125),
        accentPressed: Color(red: 0.878, green: 0.498, blue: 0.039),
        accentSubtle: Color(red: 1.0, green: 0.663, blue: 0.278).opacity(0.14),
        accentRing: Color(red: 1.0, green: 0.663, blue: 0.278).opacity(0.40),
        error: Color(red: 1.0, green: 0.369, blue: 0.369),
        userBubble: Color(red: 1.0, green: 0.663, blue: 0.278).opacity(0.12),
        assistantBubble: Color.white.opacity(0.04),
        toolBubble: Color.white.opacity(0.06),
        border: Color.white.opacity(0.08),
        textPrimary: Color(red: 0.949, green: 0.949, blue: 0.961),
        textSecondary: Color(red: 0.604, green: 0.604, blue: 0.659)
    )
}

struct ThemeTypography: Sendable {
    let titleFont: Font
    let bodyFont: Font
    let captionFont: Font
    let promptInputFont: Font

    static let `default` = ThemeTypography(
        titleFont: .system(size: 18, weight: .semibold),
        bodyFont: .system(size: 14),
        captionFont: .system(size: 12),
        promptInputFont: .system(size: 20, weight: .medium)
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

struct ThemeRadius: Sendable {
    let sm: CGFloat
    let md: CGFloat
    let lg: CGFloat

    static let `default` = ThemeRadius(
        sm: 6, md: 8, lg: 12
    )
}

struct ThemeAnimation: Sendable {
    let springDuration: Double
    let springBounce: Double
    let highlightDuration: Double

    static let `default` = ThemeAnimation(
        springDuration: 0.35,
        springBounce: 0.2,
        highlightDuration: 0.15
    )
}

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
    let surfaceHover: Color
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
        background: Color(red: 0.129, green: 0.129, blue: 0.129),
        surface: Color(red: 0.184, green: 0.184, blue: 0.184),
        surfaceHover: Color(red: 0.227, green: 0.227, blue: 0.227),
        primary: Color(red: 0.925, green: 0.925, blue: 0.925),
        secondary: Color(red: 0.627, green: 0.627, blue: 0.627),
        accent: Color(red: 1.0, green: 0.663, blue: 0.278),
        accentHover: Color(red: 1.0, green: 0.580, blue: 0.125),
        accentPressed: Color(red: 0.878, green: 0.498, blue: 0.039),
        accentSubtle: Color(red: 1.0, green: 0.663, blue: 0.278).opacity(0.14),
        accentRing: Color(red: 1.0, green: 0.663, blue: 0.278).opacity(0.40),
        error: Color(red: 1.0, green: 0.369, blue: 0.369),
        userBubble: Color(red: 0.227, green: 0.227, blue: 0.227),
        assistantBubble: Color.clear,
        toolBubble: Color.white.opacity(0.04),
        border: Color.white.opacity(0.06),
        textPrimary: Color(red: 0.925, green: 0.925, blue: 0.925),
        textSecondary: Color(red: 0.627, green: 0.627, blue: 0.627)
    )
}

struct ThemeTypography: Sendable {
    let titleFont: Font
    let bodyFont: Font
    let captionFont: Font
    let promptInputFont: Font

    static let `default` = ThemeTypography(
        titleFont: .system(size: 16, weight: .semibold),
        bodyFont: .system(size: 15),
        captionFont: .system(size: 13),
        promptInputFont: .system(size: 16)
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
    let pill: CGFloat
    let bubble: CGFloat

    static let `default` = ThemeRadius(
        sm: 6, md: 8, lg: 12, pill: 24, bubble: 16
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

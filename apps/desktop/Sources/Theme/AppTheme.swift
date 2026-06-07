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
    let canvas: Color
    let surfaceSoft: Color
    let surfaceCard: Color
    let surfaceCreamStrong: Color
    let surfaceDark: Color
    let surfaceDarkElevated: Color
    let surfaceDarkSoft: Color
    let hairline: Color
    let hairlineSoft: Color
    let ink: Color
    let body: Color
    let bodyStrong: Color
    let muted: Color
    let mutedSoft: Color
    let onPrimary: Color
    let onDark: Color
    let onDarkSoft: Color
    let accentTeal: Color
    let accentAmber: Color
    let success: Color
    let warning: Color
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
        canvas: Color(red: 0.980, green: 0.976, blue: 0.961),
        surfaceSoft: Color(red: 0.961, green: 0.941, blue: 0.910),
        surfaceCard: Color(red: 0.937, green: 0.914, blue: 0.871),
        surfaceCreamStrong: Color(red: 0.910, green: 0.878, blue: 0.824),
        surfaceDark: Color(red: 0.094, green: 0.090, blue: 0.082),
        surfaceDarkElevated: Color(red: 0.145, green: 0.137, blue: 0.125),
        surfaceDarkSoft: Color(red: 0.122, green: 0.118, blue: 0.106),
        hairline: Color(red: 0.902, green: 0.875, blue: 0.847),
        hairlineSoft: Color(red: 0.922, green: 0.902, blue: 0.875),
        ink: Color(red: 0.078, green: 0.078, blue: 0.075),
        body: Color(red: 0.239, green: 0.239, blue: 0.227),
        bodyStrong: Color(red: 0.145, green: 0.145, blue: 0.137),
        muted: Color(red: 0.424, green: 0.416, blue: 0.392),
        mutedSoft: Color(red: 0.557, green: 0.545, blue: 0.510),
        onPrimary: Color.white,
        onDark: Color(red: 0.980, green: 0.976, blue: 0.961),
        onDarkSoft: Color(red: 0.627, green: 0.616, blue: 0.588),
        accentTeal: Color(red: 0.365, green: 0.722, blue: 0.651),
        accentAmber: Color(red: 0.910, green: 0.647, blue: 0.353),
        success: Color(red: 0.365, green: 0.722, blue: 0.447),
        warning: Color(red: 0.831, green: 0.627, blue: 0.090),
        background: Color(red: 0.980, green: 0.976, blue: 0.961),
        surface: Color(red: 0.937, green: 0.914, blue: 0.871),
        surfaceHover: Color(red: 0.910, green: 0.878, blue: 0.824),
        primary: Color(red: 0.078, green: 0.078, blue: 0.075),
        secondary: Color(red: 0.424, green: 0.416, blue: 0.392),
        accent: Color(red: 0.800, green: 0.471, blue: 0.361),
        accentHover: Color(red: 0.663, green: 0.345, blue: 0.243),
        accentPressed: Color(red: 0.553, green: 0.278, blue: 0.188),
        accentSubtle: Color(red: 0.800, green: 0.471, blue: 0.361).opacity(0.16),
        accentRing: Color(red: 0.800, green: 0.471, blue: 0.361).opacity(0.34),
        error: Color(red: 0.776, green: 0.271, blue: 0.271),
        userBubble: Color(red: 0.937, green: 0.914, blue: 0.871),
        assistantBubble: Color.clear,
        toolBubble: Color(red: 0.122, green: 0.118, blue: 0.106),
        border: Color(red: 0.902, green: 0.875, blue: 0.847),
        textPrimary: Color(red: 0.078, green: 0.078, blue: 0.075),
        textSecondary: Color(red: 0.424, green: 0.416, blue: 0.392)
    )
}

struct ThemeTypography: Sendable {
    let titleFont: Font
    let bodyFont: Font
    let captionFont: Font
    let promptInputFont: Font
    let promptInputFontSize: CGFloat

    static let `default` = ThemeTypography(
        titleFont: .system(size: 18, weight: .medium),
        bodyFont: .system(size: 15, weight: .regular),
        captionFont: .system(size: 13),
        promptInputFont: .system(size: 16),
        promptInputFontSize: 16
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
        xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32
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

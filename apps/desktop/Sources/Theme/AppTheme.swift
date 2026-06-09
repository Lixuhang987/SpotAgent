import SwiftUI

struct AppTheme: Sendable {
    let colors: ThemeColors
    let typography: ThemeTypography
    let spacing: ThemeSpacing
    let radius: ThemeRadius
    let animation: ThemeAnimation

    static let `default` = AppTheme.light

    static let light = AppTheme(
        colors: ThemeColors(generated: GeneratedThemeTokens.light),
        typography: .generated,
        spacing: .generated,
        radius: .generated,
        animation: .generated
    )

    static let dark = AppTheme(
        colors: ThemeColors(generated: GeneratedThemeTokens.dark),
        typography: .generated,
        spacing: .generated,
        radius: .generated,
        animation: .generated
    )

    static func resolved(_ resolved: ResolvedAppearanceTheme) -> AppTheme {
        switch resolved {
        case .light: return .light
        case .dark: return .dark
        }
    }
}

struct ThemeColors: Sendable {
    let canvas: Color
    let surfaceSoft: Color
    let surfaceCard: Color
    let surfaceElevated: Color
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

    init(generated: GeneratedThemeTokens.ColorSet) {
        canvas = Self.color(generated.canvas)
        surfaceSoft = Self.color(generated.surfaceSoft)
        surfaceCard = Self.color(generated.surface)
        surfaceElevated = Self.color(generated.surfaceElevated)
        surfaceCreamStrong = Self.color(generated.surfaceMuted)
        surfaceDark = Self.color(generated.canvas)
        surfaceDarkElevated = Self.color(generated.surfaceElevated)
        surfaceDarkSoft = Self.color(generated.surface)
        hairline = Self.color(generated.hairline)
        hairlineSoft = Self.color(generated.hairlineSoft)
        ink = Self.color(generated.textPrimary)
        body = Self.color(generated.textSecondary)
        bodyStrong = Self.color(generated.textPrimary)
        muted = Self.color(generated.textSecondary)
        mutedSoft = Self.color(generated.textMuted)
        onPrimary = Self.color(generated.onAccent)
        onDark = Self.color(generated.textPrimary)
        onDarkSoft = Self.color(generated.textMuted)
        accentTeal = Self.color(generated.teal)
        accentAmber = Self.color(generated.amber)
        success = Self.color(generated.success)
        warning = Self.color(generated.warning)
        background = Self.color(generated.canvas)
        surface = Self.color(generated.surface)
        surfaceHover = Self.color(generated.surfaceMuted)
        primary = Self.color(generated.textPrimary)
        secondary = Self.color(generated.textSecondary)
        accent = Self.color(generated.accent)
        accentHover = Self.color(generated.accentHover)
        accentPressed = Self.color(generated.accentPressed)
        accentSubtle = Self.color(generated.accentSubtle)
        accentRing = Self.color(generated.accentRing)
        error = Self.color(generated.error)
        userBubble = Self.color(generated.userBubble)
        assistantBubble = Self.color(generated.assistantBubble)
        toolBubble = Self.color(generated.toolBubble)
        border = Self.color(generated.hairline)
        textPrimary = Self.color(generated.textPrimary)
        textSecondary = Self.color(generated.textSecondary)
    }

    private static func color(_ value: String) -> Color {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed == "transparent" {
            return .clear
        }
        if trimmed.hasPrefix("#") {
            return hexColor(trimmed)
        }
        if trimmed.hasPrefix("rgba(") {
            return rgbaColor(trimmed)
        }
        return .clear
    }

    private static func hexColor(_ value: String) -> Color {
        let hex = String(value.dropFirst())
        guard hex.count == 6, let raw = Int(hex, radix: 16) else {
            return .clear
        }
        let red = Double((raw >> 16) & 0xFF) / 255.0
        let green = Double((raw >> 8) & 0xFF) / 255.0
        let blue = Double(raw & 0xFF) / 255.0
        return Color(red: red, green: green, blue: blue)
    }

    private static func rgbaColor(_ value: String) -> Color {
        let inner = value
            .replacingOccurrences(of: "rgba(", with: "")
            .replacingOccurrences(of: ")", with: "")
        let parts = inner.split(separator: ",").map {
            Double($0.trimmingCharacters(in: .whitespacesAndNewlines)) ?? 0
        }
        guard parts.count == 4 else {
            return .clear
        }
        return Color(
            red: parts[0] / 255.0,
            green: parts[1] / 255.0,
            blue: parts[2] / 255.0,
            opacity: parts[3]
        )
    }
}

struct ThemeTypography: Sendable {
    let titleFont: Font
    let bodyFont: Font
    let captionFont: Font
    let promptInputFont: Font
    let promptInputFontSize: CGFloat

    static let `default` = ThemeTypography.generated

    static let generated = ThemeTypography(
        titleFont: .system(size: GeneratedThemeTokens.typography.titleSize, weight: .medium),
        bodyFont: .system(size: GeneratedThemeTokens.typography.bodySize, weight: .regular),
        captionFont: .system(size: GeneratedThemeTokens.typography.captionSize),
        promptInputFont: .system(size: GeneratedThemeTokens.typography.promptInputSize),
        promptInputFontSize: GeneratedThemeTokens.typography.promptInputSize
    )
}

struct ThemeSpacing: Sendable {
    let xs: CGFloat
    let sm: CGFloat
    let md: CGFloat
    let lg: CGFloat
    let xl: CGFloat
    let xxl: CGFloat

    static let `default` = ThemeSpacing.generated

    static let generated = ThemeSpacing(
        xs: GeneratedThemeTokens.spacing.xs,
        sm: GeneratedThemeTokens.spacing.sm,
        md: GeneratedThemeTokens.spacing.md,
        lg: GeneratedThemeTokens.spacing.lg,
        xl: GeneratedThemeTokens.spacing.xl,
        xxl: GeneratedThemeTokens.spacing.xxl
    )
}

struct ThemeRadius: Sendable {
    let sm: CGFloat
    let md: CGFloat
    let lg: CGFloat
    let pill: CGFloat
    let bubble: CGFloat

    static let `default` = ThemeRadius.generated

    static let generated = ThemeRadius(
        sm: GeneratedThemeTokens.radius.sm,
        md: GeneratedThemeTokens.radius.md,
        lg: GeneratedThemeTokens.radius.lg,
        pill: GeneratedThemeTokens.radius.pill,
        bubble: GeneratedThemeTokens.radius.bubble
    )
}

struct ThemeAnimation: Sendable {
    let springDuration: Double
    let springBounce: Double
    let highlightDuration: Double

    static let `default` = ThemeAnimation.generated

    static let generated = ThemeAnimation(
        springDuration: GeneratedThemeTokens.animation.springDuration,
        springBounce: GeneratedThemeTokens.animation.springBounce,
        highlightDuration: GeneratedThemeTokens.animation.highlightDuration
    )
}

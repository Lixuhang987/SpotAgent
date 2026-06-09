import XCTest
@testable import HandAgentDesktop

final class AppThemeTests: XCTestCase {
    func testDefaultThemeHasExpectedSpacing() {
        let theme = AppTheme.default
        XCTAssertEqual(theme.spacing.sm, GeneratedThemeTokens.spacing.sm)
        XCTAssertEqual(theme.spacing.lg, GeneratedThemeTokens.spacing.lg)
        XCTAssertEqual(theme.spacing.xl, GeneratedThemeTokens.spacing.xl)
        XCTAssertEqual(theme.spacing.xxl, GeneratedThemeTokens.spacing.xxl)
    }

    func testDefaultThemeHasDesignSemanticColors() {
        let theme = AppTheme.default
        _ = theme.colors.canvas
        _ = theme.colors.surfaceSoft
        _ = theme.colors.surfaceCard
        _ = theme.colors.surfaceElevated
        _ = theme.colors.surfaceDark
        _ = theme.colors.surfaceDarkElevated
        _ = theme.colors.accentTeal
        _ = theme.colors.hairline
    }

    func testDefaultThemeTypographyIsNotNil() {
        let theme = AppTheme.default
        // Font 无法直接比较，验证能访问即可
        _ = theme.typography.promptInputFont
        _ = theme.typography.titleFont
        _ = theme.typography.bodyFont
    }
}

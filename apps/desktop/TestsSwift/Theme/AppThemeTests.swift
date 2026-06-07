import XCTest
@testable import HandAgentDesktop

final class AppThemeTests: XCTestCase {
    func testDefaultThemeHasExpectedSpacing() {
        let theme = AppTheme.default
        XCTAssertEqual(theme.spacing.sm, 8)
        XCTAssertEqual(theme.spacing.lg, 16)
        XCTAssertEqual(theme.spacing.xl, 24)
        XCTAssertEqual(theme.spacing.xxl, 32)
    }

    func testDefaultThemeHasDesignSemanticColors() {
        let theme = AppTheme.default
        _ = theme.colors.canvas
        _ = theme.colors.surfaceSoft
        _ = theme.colors.surfaceCard
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

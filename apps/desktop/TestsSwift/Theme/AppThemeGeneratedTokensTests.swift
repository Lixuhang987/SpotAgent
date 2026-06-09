import XCTest
@testable import HandAgentDesktop

final class AppThemeGeneratedTokensTests: XCTestCase {
    func testLightAndDarkThemesExposeGeneratedColors() {
        _ = AppTheme.light.colors.canvas
        _ = AppTheme.dark.colors.canvas
        _ = AppTheme.light.colors.accent
        _ = AppTheme.dark.colors.accent
    }

    func testResolvedThemeMapsToConcreteTheme() {
        XCTAssertEqual(AppTheme.resolved(.light).spacing.sm, AppTheme.light.spacing.sm)
        XCTAssertEqual(AppTheme.resolved(.dark).spacing.sm, AppTheme.dark.spacing.sm)
    }
}

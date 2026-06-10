import AppKit
import XCTest
@testable import HandAgentDesktop

@MainActor
final class PromptPanelScrollbarStyleTests: XCTestCase {
    func testApplyUsesOverlayScrollerAndTransparentBackground() throws {
        let scrollView = NSScrollView()

        PromptPanelScrollbarStyle.apply(to: scrollView, theme: .light)

        XCTAssertFalse(scrollView.drawsBackground)
        XCTAssertEqual(scrollView.backgroundColor, .clear)
        XCTAssertFalse(scrollView.hasHorizontalScroller)
        XCTAssertTrue(scrollView.autohidesScrollers)
        let scroller = try XCTUnwrap(scrollView.verticalScroller as? PromptPanelOverlayScroller)
        XCTAssertEqual(scroller.controlSize, .small)
    }

    func testPaletteUsesThemeTextColorOpacityForThumbs() {
        let palette = PromptPanelScrollbarPalette.make(theme: .dark)
        let expectedThumb = NSColor(AppTheme.dark.colors.textPrimary).withAlphaComponent(0.28)
        let expectedHover = NSColor(AppTheme.dark.colors.textPrimary).withAlphaComponent(0.42)

        XCTAssertEqual(palette.thumbInset, 3)
        XCTAssertEqual(palette.width, 10)
        XCTAssertTrue(palette.thumbColor.isEqual(expectedThumb))
        XCTAssertTrue(palette.hoverThumbColor.isEqual(expectedHover))
    }
}

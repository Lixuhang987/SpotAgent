import SwiftUI
import XCTest
@testable import HandAgentDesktop

@MainActor
final class SettingsTabBarLayoutTests: XCTestCase {
    func testTabButtonUsesFlexibleMaxWidthInsteadOfFixedWidth() {
        let source = try! String(
            contentsOfFile: "/Users/mu9/proj/handAgent/.worktrees/ui-theme-settings-fix/apps/desktop/Sources/Settings/SettingsStyles.swift",
            encoding: .utf8
        )

        XCTAssertTrue(source.contains(".frame(maxWidth: .infinity, minHeight: 56)"))
        XCTAssertFalse(source.contains(".frame(width: 72, height: 56)"))
    }
}

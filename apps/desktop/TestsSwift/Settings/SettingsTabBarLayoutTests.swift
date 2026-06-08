import SwiftUI
import XCTest
@testable import HandAgentDesktop

@MainActor
final class SettingsTabBarLayoutTests: XCTestCase {
    func testTabButtonUsesFlexibleMaxWidthInsteadOfFixedWidth() {
        let testFileURL = URL(fileURLWithPath: #filePath)
        let desktopRoot = testFileURL
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let settingsStylesURL = desktopRoot
            .appendingPathComponent("Sources")
            .appendingPathComponent("Settings")
            .appendingPathComponent("SettingsStyles.swift")
        let source = try! String(
            contentsOf: settingsStylesURL,
            encoding: .utf8
        )

        XCTAssertTrue(source.contains(".frame(maxWidth: .infinity, minHeight: 56)"))
        XCTAssertFalse(source.contains(".frame(width: 72, height: 56)"))
    }
}

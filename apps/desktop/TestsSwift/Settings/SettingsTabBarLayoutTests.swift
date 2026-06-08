import SwiftUI
import XCTest
@testable import HandAgentDesktop

@MainActor
final class SettingsTabBarLayoutTests: XCTestCase {
    func testTabButtonUsesFlexibleMaxWidthInsteadOfFixedWidth() {
        let settingsStylesURL = settingsStylesURL(
            currentDirectoryURL: URL(
                fileURLWithPath: FileManager.default.currentDirectoryPath,
                isDirectory: true
            ),
            compiledTestFileURL: URL(fileURLWithPath: #filePath)
        )
        let source = try! String(
            contentsOf: settingsStylesURL,
            encoding: .utf8
        )

        XCTAssertTrue(source.contains(".frame(maxWidth: .infinity, minHeight: 56)"))
        XCTAssertFalse(source.contains(".frame(width: 72, height: 56)"))
    }

    func testSettingsStylesURLPrefersRuntimeRepositoryOverStaleCompiledPath() throws {
        let temporaryRoot = URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: temporaryRoot) }

        let repositoryRoot = temporaryRoot.appendingPathComponent("repo", isDirectory: true)
        let stylesURL = repositoryRoot
            .appendingPathComponent("apps/desktop/Sources/Settings", isDirectory: true)
            .appendingPathComponent("SettingsStyles.swift")
        try FileManager.default.createDirectory(
            at: stylesURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        try Data().write(to: repositoryRoot.appendingPathComponent("Package.swift"))
        try Data().write(to: stylesURL)

        let staleCompiledPath = URL(
            fileURLWithPath: "/missing/.worktrees/ui-theme-settings-fix/apps/desktop/TestsSwift/Settings/SettingsTabBarLayoutTests.swift"
        )

        XCTAssertEqual(
            settingsStylesURL(
                currentDirectoryURL: repositoryRoot.appendingPathComponent("apps/desktop", isDirectory: true),
                compiledTestFileURL: staleCompiledPath
            ).standardizedFileURL.path,
            stylesURL.standardizedFileURL.path
        )
    }

    private func settingsStylesURL(
        currentDirectoryURL: URL,
        compiledTestFileURL: URL
    ) -> URL {
        if let repositoryRoot = repositoryRoot(startingAt: currentDirectoryURL) {
            return settingsStylesURL(repositoryRoot: repositoryRoot)
        }

        let testDirectoryURL = compiledTestFileURL.deletingLastPathComponent()
        if let repositoryRoot = repositoryRoot(startingAt: testDirectoryURL) {
            return settingsStylesURL(repositoryRoot: repositoryRoot)
        }

        return compiledTestFileURL
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Sources")
            .appendingPathComponent("Settings")
            .appendingPathComponent("SettingsStyles.swift")
    }

    private func repositoryRoot(startingAt url: URL) -> URL? {
        var candidate = url.standardizedFileURL
        let fileManager = FileManager.default

        while true {
            if fileManager.fileExists(atPath: candidate.appendingPathComponent("Package.swift").path),
               fileManager.fileExists(atPath: settingsStylesURL(repositoryRoot: candidate).path) {
                return candidate
            }

            let parent = candidate.deletingLastPathComponent()
            if parent.path == candidate.path {
                return nil
            }
            candidate = parent
        }
    }

    private func settingsStylesURL(repositoryRoot: URL) -> URL {
        repositoryRoot
            .appendingPathComponent("apps")
            .appendingPathComponent("desktop")
            .appendingPathComponent("Sources")
            .appendingPathComponent("Settings")
            .appendingPathComponent("SettingsStyles.swift")
    }
}

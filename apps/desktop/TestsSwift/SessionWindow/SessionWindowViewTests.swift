import XCTest

final class SessionWindowViewTests: XCTestCase {
    func testSessionWindowViewExtractsMajorSwiftUIComponents() throws {
        let source = try sessionWindowSources()
        let expectedComponents = [
            "SessionHistorySidebarView",
            "SessionHistoryRowView",
            "SessionWorkspaceView",
            "SessionStatusHeaderView",
            "SessionTabBarView",
            "SessionTabItemView",
            "SessionMessageListView",
            "SessionComposerView",
        ]

        for component in expectedComponents {
            XCTAssertTrue(
                source.contains("struct \(component): View"),
                "Expected SessionWindowView.swift to extract \(component) as a dedicated SwiftUI component."
            )
        }
    }

    func testHistoryRowDeclaresFullWidthHitTarget() throws {
        let historyRowSource = try historyRowSource()

        XCTAssertTrue(
            historyRowSource.contains(".contentShape(Rectangle())"),
            "History rows must keep their full visual width clickable, including empty trailing space."
        )
    }

    func testHistoryRowInactiveBackgroundKeepsHitTargetMaterialized() throws {
        let historyRowSource = try historyRowSource()

        XCTAssertFalse(
            historyRowSource.contains(": Color.clear"),
            "Inactive history rows must not use a fully clear background because trailing empty space stops hit-testing."
        )
    }

    private func sessionWindowViewSource() throws -> String {
        let sourceURL = sourceDirectory()
            .appendingPathComponent("SessionWindowView.swift")
        return try String(contentsOf: sourceURL, encoding: .utf8)
    }

    private func sessionWindowSources() throws -> String {
        let sourceDirectory = sourceDirectory()
        let fileURLs = try FileManager.default.contentsOfDirectory(
            at: sourceDirectory,
            includingPropertiesForKeys: nil
        )
            .filter { $0.pathExtension == "swift" }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
        return try fileURLs
            .map { try String(contentsOf: $0, encoding: .utf8) }
            .joined(separator: "\n")
    }

    private func sourceDirectory() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Sources/SessionWindow")
    }

    private func historyRowSource() throws -> String {
        let source = try sessionWindowSources()
        let rowStart = try XCTUnwrap(source.range(of: "struct SessionHistoryRowView"))
        let nextSection = try XCTUnwrap(source[rowStart.lowerBound...].range(of: "struct SessionWorkspaceView"))
        return String(source[rowStart.lowerBound..<nextSection.lowerBound])
    }
}

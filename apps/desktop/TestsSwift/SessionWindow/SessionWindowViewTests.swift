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
            "SessionCloseTabButton",
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

    func testTabItemUsesDedicatedCloseButton() throws {
        let tabItemSource = try tabItemSource()

        XCTAssertTrue(
            tabItemSource.contains("SessionCloseTabButton(onClose: onClose)"),
            "The visible tab close affordance must be a dedicated close button wired to onClose."
        )
        XCTAssertFalse(
            tabItemSource.contains("Image(systemName: \"xmark\")"),
            "A passive xmark inside the activation button looks clickable but only activates the tab."
        )
    }

    func testMessageBubblesEnableTextSelection() throws {
        let messageBubbleSource = try messageBubbleSource()

        XCTAssertTrue(
            messageBubbleSource.contains(".textSelection(.enabled)"),
            "Message bubble text must remain selectable so users can copy arbitrary ranges."
        )
    }

    func testMessageBubblesExposeCopyButtonPerMessage() throws {
        let source = try sessionWindowSources()

        XCTAssertTrue(
            source.contains("struct SessionMessageCopyButton: View"),
            "Each message must expose a dedicated copy button component."
        )
        XCTAssertTrue(
            source.contains("Image(systemName: \"doc.on.doc\")"),
            "The message copy affordance must use a compact copy icon."
        )
        XCTAssertTrue(
            source.contains(".accessibilityLabel(\"复制消息\")"),
            "The copy icon must have an explicit VoiceOver label."
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

    private func tabItemSource() throws -> String {
        let source = try sessionWindowSources()
        let rowStart = try XCTUnwrap(source.range(of: "struct SessionTabItemView"))
        let nextSection = try XCTUnwrap(source[rowStart.lowerBound...].range(of: "struct SessionCloseTabButton"))
        return String(source[rowStart.lowerBound..<nextSection.lowerBound])
    }

    private func messageBubbleSource() throws -> String {
        let source = try sessionWindowSources()
        let bubbleStart = try XCTUnwrap(source.range(of: "struct SessionMessageBubbleView"))
        let nextSection = try XCTUnwrap(source[bubbleStart.lowerBound...].range(of: "struct SessionAttachmentRowView"))
        return String(source[bubbleStart.lowerBound..<nextSection.lowerBound])
    }
}

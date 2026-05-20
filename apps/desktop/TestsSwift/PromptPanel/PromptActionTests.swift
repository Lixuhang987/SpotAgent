import XCTest
import KeyboardShortcuts
@testable import HandAgentDesktop

final class PromptActionTests: XCTestCase {
    func testFiltersActionsByKeyword() {
        let actions = [
            PromptAction(
                id: "open",
                title: "Open File",
                keywords: ["file", "document"],
                defaultShortcut: .init(.o, modifiers: [.command]),
                perform: {}
            ),
            PromptAction(
                id: "new",
                title: "New Session",
                keywords: ["workspace"],
                defaultShortcut: .init(.n, modifiers: [.command]),
                perform: {}
            )
        ]

        let filtered = PromptAction.filter(actions, query: "file")

        XCTAssertEqual(filtered.map(\.id), ["open"])
    }
}

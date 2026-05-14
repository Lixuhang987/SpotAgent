import XCTest
@testable import HandAgentDesktop

final class PromptActionTests: XCTestCase {
    func testFiltersActionsByKeyword() {
        let actions = [
            PromptAction(
                id: "open",
                title: "Open File",
                keywords: ["file", "document"],
                shortcut: "⌘O",
                perform: {}
            ),
            PromptAction(
                id: "new",
                title: "New Session",
                keywords: ["workspace"],
                shortcut: "⌘N",
                perform: {}
            )
        ]

        let filtered = PromptAction.filter(actions, query: "file")

        XCTAssertEqual(filtered.map(\.id), ["open"])
    }
}

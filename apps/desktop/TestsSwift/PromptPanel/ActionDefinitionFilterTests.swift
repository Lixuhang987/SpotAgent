import XCTest
import KeyboardShortcuts
@testable import HandAgentDesktop

final class ActionDefinitionFilterTests: XCTestCase {
    func testFiltersActionsByKeyword() {
        let actions = [
            ActionDefinition.command(
                id: "open",
                trigger: "open",
                title: "Open File",
                description: nil,
                keywords: ["file", "document"],
                defaultShortcut: .init(.o, modifiers: [.command]),
                command: .openSettings
            ),
            ActionDefinition.command(
                id: "new",
                trigger: "new",
                title: "New Session",
                description: nil,
                keywords: ["workspace"],
                defaultShortcut: .init(.n, modifiers: [.command]),
                command: .openHistory
            )
        ]

        let filtered = ActionDefinition.filter(actions, query: "file")

        XCTAssertEqual(filtered.map(\.id), ["open"])
    }
}

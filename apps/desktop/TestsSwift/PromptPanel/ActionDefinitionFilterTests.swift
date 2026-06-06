import XCTest
import KeyboardShortcuts
@testable import HandAgentDesktop

final class ActionDefinitionFilterTests: XCTestCase {
    func testFiltersActionsByDescription() {
        let actions = [
            ActionDefinition.skill(
                id: "open",
                trigger: "open",
                title: "Open File",
                description: "file document",
                template: "Open file",
                arguments: [],
                defaultShortcut: .init(.o, modifiers: [.command])
            ),
            ActionDefinition.skill(
                id: "new",
                trigger: "new",
                title: "New Thread",
                description: "workspace",
                template: "New thread",
                arguments: [],
                defaultShortcut: .init(.n, modifiers: [.command])
            )
        ]

        let filtered = ActionDefinition.filter(actions, query: "file")

        XCTAssertEqual(filtered.map(\.id), ["open"])
    }
}

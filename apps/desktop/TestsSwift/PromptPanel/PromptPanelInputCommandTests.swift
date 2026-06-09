import AppKit
import XCTest
@testable import HandAgentDesktop

final class PromptPanelInputCommandTests: XCTestCase {
    func testReturnSubmitsSelectedActionOrDraftWithoutShiftOrOption() {
        XCTAssertEqual(
            PromptPanelInputCommand.resolve(
                commandSelector: #selector(NSResponder.insertNewline(_:)),
                modifierFlags: []
            ),
            .submitSelectedAction
        )
    }

    func testModifiedReturnInsertsNewline() {
        XCTAssertEqual(
            PromptPanelInputCommand.resolve(
                commandSelector: #selector(NSResponder.insertNewline(_:)),
                modifierFlags: [.shift]
            ),
            .insertNewline
        )
        XCTAssertEqual(
            PromptPanelInputCommand.resolve(
                commandSelector: #selector(NSResponder.insertNewline(_:)),
                modifierFlags: [.option]
            ),
            .insertNewline
        )
    }

    func testTabSubmitsSelectedAction() {
        XCTAssertEqual(
            PromptPanelInputCommand.resolve(
                commandSelector: #selector(NSResponder.insertTab(_:)),
                modifierFlags: []
            ),
            .submitSelectedAction
        )
    }

    func testArrowKeysMoveSelectedAction() {
        XCTAssertEqual(
            PromptPanelInputCommand.resolve(
                commandSelector: #selector(NSResponder.moveDown(_:)),
                modifierFlags: []
            ),
            .selectNextAction
        )
        XCTAssertEqual(
            PromptPanelInputCommand.resolve(
                commandSelector: #selector(NSResponder.moveUp(_:)),
                modifierFlags: []
            ),
            .selectPreviousAction
        )
    }

    func testUnknownCommandFallsThrough() {
        XCTAssertNil(
            PromptPanelInputCommand.resolve(
                commandSelector: #selector(NSResponder.cancelOperation(_:)),
                modifierFlags: []
            )
        )
    }
}

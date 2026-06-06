import XCTest
@testable import HandAgentDesktop

final class PromptPanelInputLayoutTests: XCTestCase {
    func testKeepsDragGapWhenDraftIsEmpty() {
        XCTAssertFalse(PromptPanelInputLayout.shouldExpandInput(for: ""))
        XCTAssertFalse(PromptPanelInputLayout.shouldExpandInput(for: "   \n\t"))
        XCTAssertEqual(PromptPanelInputLayout.inputWidth(for: ""), 180)
    }

    func testExpandsInputWhenDraftHasVisibleContent() {
        XCTAssertTrue(PromptPanelInputLayout.shouldExpandInput(for: "hello"))
        XCTAssertTrue(PromptPanelInputLayout.shouldExpandInput(for: "\nhello"))
        XCTAssertNil(PromptPanelInputLayout.inputWidth(for: "hello"))
    }
}

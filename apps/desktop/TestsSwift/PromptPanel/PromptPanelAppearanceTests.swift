import AppKit
import XCTest
@testable import HandAgentDesktop

@MainActor
final class PromptPanelAppearanceTests: XCTestCase {
    func testShowCreatesAquaAppearancePanel() {
        let controller = PromptPanelController()
        controller.register(actions: [])
        defer { controller.hide() }

        controller.show()

        let panel = Mirror(reflecting: controller).descendant("panel") as? NSPanel
        XCTAssertEqual(
            panel?.appearance?.bestMatch(from: [.aqua, .darkAqua]),
            .aqua
        )
    }
}

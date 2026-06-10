import AppKit
import SwiftUI
import XCTest
@testable import HandAgentDesktop

@MainActor
final class PromptPanelAppearanceTests: XCTestCase {
    func testShowKeepsAquaForAppKitControlStabilization() {
        let controller = makeAppearanceController()
        controller.configure(viewModel: PromptPanelViewModel(actions: []))
        defer { controller.hide() }

        controller.show()

        let panel = Mirror(reflecting: controller).descendant("panel") as? NSPanel
        XCTAssertEqual(
            panel?.appearance?.bestMatch(from: [.aqua, .darkAqua]),
            .aqua
        )
    }

    func testUpdateThemeRefreshesExistingRootViewWithoutReplacingViewModel() {
        let controller = makeAppearanceController()
        let viewModel = PromptPanelViewModel(actions: [])
        viewModel.draft = "keep me"
        controller.configure(viewModel: viewModel)
        defer { controller.hide() }

        controller.show()
        controller.updateTheme(.dark)

        let panel = Mirror(reflecting: controller).descendant("panel") as? NSPanel
        let hosting = panel?.contentView as? NSHostingView<AnyView>
        XCTAssertNotNil(hosting)
        XCTAssertEqual(viewModel.draft, "keep me")
    }
}

@MainActor
private func makeAppearanceController() -> PromptPanelController {
    PromptPanelController(
        focusRestorer: FakePromptPanelAppearanceFocusRestorer(),
        presentationMode: .hiddenForTesting
    )
}

@MainActor
private final class FakePromptPanelAppearanceFocusRestorer: PromptPanelFocusRestoring {
    typealias Token = Int

    func captureCurrentFocusOwner() -> Int? { nil }
    func restoreFocus(to token: Int) {}
}

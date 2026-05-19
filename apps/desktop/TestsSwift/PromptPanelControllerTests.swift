import XCTest
@testable import HandAgentDesktop

@MainActor
final class PromptPanelControllerTests: XCTestCase {
    func testShowDoesNotAppendSelectionAttachment() async throws {
        let controller = PromptPanelController()
        let viewModel = PromptPanelViewModel(actions: [])
        controller.configure(viewModel: viewModel)
        defer { controller.hide() }

        controller.show()
        try await Task.sleep(for: .milliseconds(20))

        XCTAssertEqual(viewModel.attachments, [])
    }

    func testCaptureSelectionCoordinatorStillAppendsSelectionBeforeShowingPanel() async throws {
        let controller = PromptPanelController()
        let viewModel = PromptPanelViewModel(actions: [])
        let provider = FakeSelectionCaptureProvider(result: .selected(text: "active selection"))
        let coordinator = PromptCaptureCoordinator(
            controller: controller,
            selectionProvider: provider,
            regionProvider: FakeRegionCaptureProvider(result: .cancelled)
        )
        controller.configure(viewModel: viewModel)
        defer { controller.hide() }

        await coordinator.captureSelectionAndShow()

        XCTAssertEqual(provider.captureCount, 1)
        XCTAssertEqual(viewModel.attachments.count, 1)
        XCTAssertEqual(viewModel.attachments.first?.displayLabel, "active selection")
    }
}

private final class FakeSelectionCaptureProvider: SelectionCaptureProvider, @unchecked Sendable {
    private let result: SelectionCaptureResult
    private(set) var captureCount = 0

    init(result: SelectionCaptureResult) {
        self.result = result
    }

    func captureSelectedText() async -> SelectionCaptureResult {
        captureCount += 1
        return result
    }
}

private final class FakeRegionCaptureProvider: RegionCaptureProvider, @unchecked Sendable {
    private let result: RegionCaptureResult

    init(result: RegionCaptureResult) {
        self.result = result
    }

    func captureRegion() async -> RegionCaptureResult {
        result
    }
}

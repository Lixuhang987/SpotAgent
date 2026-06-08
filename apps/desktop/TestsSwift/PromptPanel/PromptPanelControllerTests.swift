import XCTest
@testable import HandAgentDesktop

@MainActor
final class PromptPanelControllerTests: XCTestCase {
    func testShowDoesNotAppendSelectionAttachment() async throws {
        let controller = PromptPanelController(focusRestorer: FakePromptPanelFocusRestorer())
        let viewModel = PromptPanelViewModel(actions: [])
        controller.configure(viewModel: viewModel)
        defer { controller.hide() }

        controller.show()
        try await Task.sleep(for: .milliseconds(20))

        XCTAssertEqual(viewModel.attachments, [])
    }

    func testCaptureSelectionCoordinatorStillAppendsSelectionBeforeShowingPanel() async throws {
        let controller = PromptPanelController(focusRestorer: FakePromptPanelFocusRestorer())
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

    func testSelectActionAndShowPrefillsArgumentTemplate() async throws {
        let controller = PromptPanelController(focusRestorer: FakePromptPanelFocusRestorer())
        let action = ActionDefinition.skill(
            id: "review/code",
            trigger: "r",
            title: "Review",
            description: nil,
            template: "{{code}}",
            arguments: [
                ActionArgumentDefinition(name: "code", description: nil, required: true)
            ],
            defaultShortcut: nil
        )
        let viewModel = PromptPanelViewModel(actions: [action])
        controller.configure(viewModel: viewModel)
        defer { controller.hide() }

        controller.selectActionAndShow(action)
        try await Task.sleep(for: .milliseconds(20))

        XCTAssertEqual(viewModel.draft, "r [code: ]")
    }

    func testHideRestoresFocusToAppCapturedBeforeShow() async throws {
        let focusRestorer = FakePromptPanelFocusRestorer()
        let controller = PromptPanelController(focusRestorer: focusRestorer)
        let viewModel = PromptPanelViewModel(actions: [])
        controller.configure(viewModel: viewModel)

        controller.show()
        controller.hide()

        XCTAssertEqual(focusRestorer.captureCount, 1)
        XCTAssertEqual(focusRestorer.restoreCount, 1)
        XCTAssertEqual(focusRestorer.restoredTokens, [1])
    }

    func testRepeatedHideRestoresFocusOnlyOnce() async throws {
        let focusRestorer = FakePromptPanelFocusRestorer()
        let controller = PromptPanelController(focusRestorer: focusRestorer)
        let viewModel = PromptPanelViewModel(actions: [])
        controller.configure(viewModel: viewModel)

        controller.show()
        controller.hide()
        controller.hide()

        XCTAssertEqual(focusRestorer.restoreCount, 1)
        XCTAssertEqual(focusRestorer.restoredTokens, [1])
    }

    func testInputFocusRetrierWaitsForTextViewWindowBeforeFocusing() {
        var scheduled: [@MainActor () -> Void] = []
        let retrier = PromptPanelInputFocusRetrier(maxAttempts: 2) { work in
            scheduled.append(work)
        }
        let textView = NSTextView()

        retrier.focus(textView, isDisabled: { false })

        XCTAssertEqual(scheduled.count, 1)

        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 120, height: 80),
                              styleMask: [.titled],
                              backing: .buffered,
                              defer: false)
        let contentView = NSView(frame: window.contentView?.bounds ?? .zero)
        window.contentView = contentView
        contentView.addSubview(textView)

        scheduled.removeFirst()()

        XCTAssertTrue(window.initialFirstResponder === textView)
        XCTAssertTrue(window.firstResponder === textView)
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

@MainActor
private final class FakePromptPanelFocusRestorer: PromptPanelFocusRestoring {
    typealias Token = Int

    private(set) var captureCount = 0
    private(set) var restoreCount = 0
    private(set) var restoredTokens: [Int] = []

    func captureCurrentFocusOwner() -> Int? {
        captureCount += 1
        return captureCount
    }

    func restoreFocus(to token: Int) {
        restoreCount += 1
        restoredTokens.append(token)
    }
}

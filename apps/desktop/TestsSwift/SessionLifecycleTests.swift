import AppKit
import XCTest
@testable import HandAgentDesktop

@MainActor
final class SpySessionWindowPresenter: SessionWindowPresenting {
    var presentCallCount = 0
    var lastSessionID: String?
    var lastOnClose: (() -> Void)?

    func present(
        sessionID: String,
        viewModel: SessionViewModel,
        onClose: @escaping () -> Void
    ) -> NSWindow? {
        presentCallCount += 1
        lastSessionID = sessionID
        lastOnClose = onClose
        return NSWindow()
    }
}

final class SessionLifecycleTests: XCTestCase {
    @MainActor
    func testOpenCreatesViewModelAndPresentsWindowAndUpdatesPolicy() {
        let registry = SessionRegistry()
        let presenter = SpySessionWindowPresenter()
        var policies: [NSApplication.ActivationPolicy] = []
        let lifecycle = SessionLifecycle(
            registry: registry,
            windowPresenter: presenter,
            agentServerURL: URL(string: "ws://127.0.0.1:0/noop")!,
            activationPolicy: AppActivationPolicyCoordinator(),
            setActivationPolicy: { policies.append($0) }
        )

        let prompt = PromptSubmission.compose(draft: "hello", attachments: [])!
        var closedID: String?
        let id = lifecycle.open(prompt: prompt, startupError: nil) { closedID = $0 }

        XCTAssertEqual(lifecycle.viewModels.count, 1)
        XCTAssertNotNil(lifecycle.viewModels[id])
        XCTAssertEqual(presenter.presentCallCount, 1)
        XCTAssertEqual(presenter.lastSessionID, id)
        XCTAssertNotNil(registry.summaries[id])
        XCTAssertTrue(registry.summaries[id]?.windowIsOpen == true)
        // init 时一次（0 个），open 后一次（1 个）= 2 次推送
        XCTAssertEqual(policies.count, 2)
        XCTAssertEqual(policies.last, .regular)
        XCTAssertNil(closedID)  // onSessionClosed 还没被触发
    }
}

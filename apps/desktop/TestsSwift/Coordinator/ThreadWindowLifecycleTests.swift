import XCTest
@testable import HandAgentDesktop

@MainActor
final class ThreadWindowLifecycleTests: XCTestCase {
    func testInitialPromptCreatesWebHostAndQueuesPrompt() throws {
        let presenter = RecordingThreadWindowPresenter()
        let lifecycle = ThreadWindowLifecycle(
            threadWebSocketURL: URL(string: "ws://127.0.0.1:4317/api/thread")!,
            webAppURL: URL(fileURLWithPath: "/tmp/index.html"),
            windowPresenter: presenter,
            activationPolicy: AppActivationPolicyCoordinator(),
            setActivationPolicy: { _ in }
        )
        let prompt = try XCTUnwrap(PromptSubmission.compose(draft: "hello", attachments: []))

        lifecycle.createTabWithInitialPrompt(
            prompt,
            onOpened: {},
            onFailed: { _ in },
            onClosed: {}
        )

        let host = try XCTUnwrap(lifecycle.webHost)
        XCTAssertTrue(presenter.presentedHost === host)
        XCTAssertEqual(host.threadWebSocketURL.absoluteString, "ws://127.0.0.1:4317/api/thread")
        XCTAssertEqual(host.webAppURL.path, "/tmp/index.html")
        XCTAssertEqual(host.pendingInitialPromptCount, 1)
        XCTAssertEqual(host.drainInitialPrompts().map(\.text), ["hello"])
    }

    func testOpenHistoryOnlyEnsuresWindowWithoutQueuingPrompt() {
        let presenter = RecordingThreadWindowPresenter()
        let lifecycle = ThreadWindowLifecycle(
            threadWebSocketURL: URL(string: "ws://127.0.0.1:4317/api/thread")!,
            webAppURL: URL(fileURLWithPath: "/tmp/index.html"),
            windowPresenter: presenter,
            activationPolicy: AppActivationPolicyCoordinator(),
            setActivationPolicy: { _ in }
        )

        lifecycle.openOrFocusHistory(
            onOpened: {},
            onFailed: { _ in },
            onClosed: {}
        )

        XCTAssertNotNil(lifecycle.webHost)
        XCTAssertEqual(lifecycle.webHost?.pendingInitialPromptCount, 0)
        XCTAssertEqual(presenter.presentCount, 1)
    }

    func testMultiplePromptsReuseHost() throws {
        let presenter = RecordingThreadWindowPresenter()
        let lifecycle = ThreadWindowLifecycle(
            threadWebSocketURL: URL(string: "ws://127.0.0.1:4317/api/thread")!,
            webAppURL: URL(fileURLWithPath: "/tmp/index.html"),
            windowPresenter: presenter,
            activationPolicy: AppActivationPolicyCoordinator(),
            setActivationPolicy: { _ in }
        )
        let first = try XCTUnwrap(PromptSubmission.compose(draft: "first", attachments: []))
        let second = try XCTUnwrap(PromptSubmission.compose(draft: "second", attachments: []))

        lifecycle.createTabWithInitialPrompt(
            first,
            onOpened: {},
            onFailed: { _ in },
            onClosed: {}
        )
        let firstHost = lifecycle.webHost
        lifecycle.createTabWithInitialPrompt(
            second,
            onOpened: {},
            onFailed: { _ in },
            onClosed: {}
        )

        XCTAssertTrue(lifecycle.webHost === firstHost)
        XCTAssertEqual(presenter.presentCount, 1)
        XCTAssertEqual(lifecycle.webHost?.drainInitialPrompts().map(\.text), ["first", "second"])
    }
}

@MainActor
private final class RecordingThreadWindowPresenter: ThreadWindowPresenting {
    private(set) var presentedHost: ThreadWindowWebHost?
    private(set) var presentCount = 0

    func present(host: ThreadWindowWebHost, onClose: @escaping () -> Void) -> NSWindow? {
        presentedHost = host
        presentCount += 1
        return NSWindow()
    }
}

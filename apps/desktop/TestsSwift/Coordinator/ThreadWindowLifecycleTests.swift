import XCTest
@testable import HandAgentDesktop

@MainActor
final class ThreadWindowLifecycleTests: XCTestCase {
    func testInitialPromptShowsWindowAndQueuesPrompt() throws {
        let presenter = RecordingThreadWindowPresenter()
        var policies: [NSApplication.ActivationPolicy] = []
        let lifecycle = ThreadWindowLifecycle(
            threadWebSocketURL: URL(string: "ws://127.0.0.1:4317/api/thread")!,
            webAppURL: URL(fileURLWithPath: "/tmp/index.html"),
            windowPresenter: presenter,
            activationPolicy: AppActivationPolicyCoordinator(),
            setActivationPolicy: { policies.append($0) }
        )
        let prompt = try XCTUnwrap(PromptSubmission.compose(draft: "hello", attachments: []))

        lifecycle.createTabWithInitialPrompt(
            prompt,
            onOpened: {},
            onFailed: { _ in },
            onClosed: {}
        )

        XCTAssertNotNil(lifecycle.webHost)
        XCTAssertEqual(presenter.makeWindowCount, 1)
        XCTAssertEqual(presenter.showCount, 1)
        XCTAssertEqual(lifecycle.webHost?.drainInitialPrompts().map(\.text), ["hello"])
        XCTAssertEqual(policies.last, .regular)
    }

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
        XCTAssertEqual(presenter.makeWindowCount, 1)
        XCTAssertEqual(presenter.showCount, 1)
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
        XCTAssertEqual(presenter.makeWindowCount, 1)
        XCTAssertEqual(lifecycle.webHost?.drainInitialPrompts().map(\.text), ["first", "second"])
    }
}

@MainActor
private final class RecordingThreadWindowPresenter: ThreadWindowPresenting {
    private(set) var presentedHost: ThreadWindowWebHost?
    private(set) var makeWindowCount = 0
    private(set) var showCount = 0

    func makeWindow(host: ThreadWindowWebHost, onClose: @escaping () -> Void) -> NSWindow? {
        presentedHost = host
        makeWindowCount += 1
        return NSWindow()
    }

    func show(window: NSWindow) {
        showCount += 1
    }
}

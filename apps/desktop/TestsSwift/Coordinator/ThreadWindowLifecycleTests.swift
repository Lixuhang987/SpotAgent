import XCTest
@testable import HandAgentDesktop

@MainActor
final class ThreadWindowLifecycleTests: XCTestCase {
    func testInitialPromptUsesAppServerThreadTurnSemantics() throws {
        let appServer = RecordingLifecycleAppServer()
        let lifecycle = ThreadWindowLifecycle(
            registry: ThreadRegistry(),
            windowPresenter: NopThreadWindowPresenter(),
            appServer: appServer,
            activationPolicy: AppActivationPolicyCoordinator(),
            setActivationPolicy: { _ in }
        )
        let prompt = try XCTUnwrap(PromptSubmission.compose(draft: "hello", attachments: []))

        lifecycle.createTabWithInitialPrompt(prompt, onClosed: {})

        XCTAssertEqual(appServer.connectionCount, 1)
        XCTAssertTrue(appServer.calls.contains(.listThreads))
        guard case let .startThread(commandId)? = appServer.calls.first(where: {
            if case .startThread = $0 { return true }
            return false
        }) else {
            return XCTFail("expected startThread")
        }

        appServer.onInboundMessage?(.notification(.threadStarted(.init(
            threadId: "thread-1",
            notificationId: "n1",
            commandId: commandId,
            timestamp: "2026-06-06T00:00:00Z",
            preview: "hello"
        ))))

        XCTAssertTrue(appServer.calls.contains(.resumeThread("thread-1")))
        XCTAssertTrue(appServer.calls.contains(.startTurn(threadId: "thread-1", text: "hello")))
    }
}

@MainActor
private final class RecordingLifecycleAppServer: AppServerManaging {
    enum Call: Equatable {
        case listThreads
        case startThread(commandId: String)
        case resumeThread(String)
        case startTurn(threadId: String, text: String)
    }

    var threadConnectionState: AppServerConnectionState = .disconnected
    var isAvailable = true
    var startupErrorMessage: String?
    var onAvailabilityChange: ((Bool) -> Void)?
    var onFatalError: ((String) -> Void)?
    var onThreadConnectionStateChange: ((AppServerConnectionState) -> Void)?
    var onInboundMessage: ((ThreadProtocolClient.InboundMessage) -> Void)?
    private(set) var connectionCount = 0
    private(set) var calls: [Call] = []

    func start() {}
    func stop() {}

    func connectThreadClient() {
        connectionCount += 1
        onThreadConnectionStateChange?(.connected)
    }

    func disconnectThreadClient() {}

    func startThread(
        commandId: String,
        timestamp: String,
        workspaceId: String?,
        actionBinding: ActionBindingPayload?
    ) {
        calls.append(.startThread(commandId: commandId))
    }

    func resumeThread(threadId: String, commandId: String, timestamp: String) {
        calls.append(.resumeThread(threadId))
    }

    func listThreads(commandId: String, timestamp: String) {
        calls.append(.listThreads)
    }

    func startTurn(
        threadId: String,
        commandId: String,
        timestamp: String,
        text: String,
        attachments: [UserMessageAttachmentPayload]
    ) {
        calls.append(.startTurn(threadId: threadId, text: text))
    }
}

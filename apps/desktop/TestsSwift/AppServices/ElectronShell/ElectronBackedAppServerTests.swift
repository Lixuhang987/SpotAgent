import XCTest
@testable import HandAgentDesktop

@MainActor
final class ElectronBackedAppServerTests: XCTestCase {
    func testPrepareThreadWindowSendsPrepareCommand() throws {
        let shell = RecordingElectronShellProcess()
        let appServer = ElectronBackedAppServer(shell: shell, platformClient: nil)

        try appServer.prepareThreadWindow()

        guard case .prepare = shell.sentCommands.first else {
            return XCTFail("expected prepare command")
        }
    }

    func testOpenInitialPromptSendsElectronPayload() throws {
        let shell = RecordingElectronShellProcess()
        let appServer = ElectronBackedAppServer(shell: shell, platformClient: nil)
        let prompt = try XCTUnwrap(PromptSubmission.compose(draft: "hello", attachments: []))

        try appServer.openInitialPrompt(prompt)

        guard case .openInitialPrompt(_, let payload) = shell.sentCommands.first else {
            return XCTFail("expected open initial prompt command")
        }
        XCTAssertEqual(payload.text, "hello")
        XCTAssertEqual(payload.attachments, [])
        XCTAssertNil(payload.actionBinding)
    }

    func testOpenHistorySendsOpenHistoryCommand() throws {
        let shell = RecordingElectronShellProcess()
        let appServer = ElectronBackedAppServer(shell: shell, platformClient: nil)

        try appServer.openHistory()

        guard case .openHistory = shell.sentCommands.first else {
            return XCTFail("expected open history command")
        }
    }

    func testFocusSendsFocusCommand() throws {
        let shell = RecordingElectronShellProcess()
        let appServer = ElectronBackedAppServer(shell: shell, platformClient: nil)

        try appServer.focus(threadId: "thread-1")

        guard case .focus(_, let threadId) = shell.sentCommands.first else {
            return XCTFail("expected focus command")
        }
        XCTAssertEqual(threadId, "thread-1")
    }

    func testVisibleThreadWindowClosedInvokesWindowClosedCallback() {
        let shell = RecordingElectronShellProcess()
        let appServer = ElectronBackedAppServer(shell: shell, platformClient: nil)
        var closeCount = 0
        appServer.onThreadWindowClosed = { closeCount += 1 }

        appServer.start()
        shell.emit(.agentServerHealth(available: true, message: nil))
        shell.emit(.threadWindowPrepared(timestamp: "2026-06-08T00:00:01.000Z"))
        shell.emit(.threadWindowClosed(timestamp: "2026-06-08T00:00:02.000Z", wasVisible: true))

        XCTAssertEqual(closeCount, 1)
        XCTAssertFalse(appServer.isAvailable)
        XCTAssertEqual(appServer.startupErrorMessage, "Electron ThreadWindow 已关闭，正在重新预热…")
    }

    func testHiddenThreadWindowClosedDoesNotInvokeWindowClosedCallback() {
        let shell = RecordingElectronShellProcess()
        let appServer = ElectronBackedAppServer(shell: shell, platformClient: nil)
        var closeCount = 0
        appServer.onThreadWindowClosed = { closeCount += 1 }

        appServer.start()
        shell.emit(.threadWindowClosed(timestamp: "2026-06-08T00:00:02.000Z", wasVisible: false))

        XCTAssertEqual(closeCount, 0)
    }

    func testAvailableOnlyAfterServerHealthAndThreadPrepared() {
        let shell = RecordingElectronShellProcess()
        let appServer = ElectronBackedAppServer(shell: shell, platformClient: nil)
        var availability: [Bool] = []
        appServer.onAvailabilityChange = { availability.append($0) }

        appServer.start()
        shell.emit(.electronReady(timestamp: "2026-06-08T00:00:00.000Z"))
        shell.emit(.agentServerHealth(available: true, message: nil))

        XCTAssertFalse(appServer.isAvailable)
        XCTAssertEqual(availability, [])

        shell.emit(.threadWindowPrepared(timestamp: "2026-06-08T00:00:01.000Z"))

        XCTAssertTrue(appServer.isAvailable)
        XCTAssertEqual(availability, [true])
    }

    func testUnavailableWhenAgentServerReportsFailure() {
        let shell = RecordingElectronShellProcess()
        let appServer = ElectronBackedAppServer(shell: shell, platformClient: nil)
        var availability: [Bool] = []
        appServer.onAvailabilityChange = { availability.append($0) }

        appServer.start()
        shell.emit(.threadWindowPrepared(timestamp: "2026-06-08T00:00:00.000Z"))
        shell.emit(.agentServerHealth(available: false, message: "port 4317 unavailable"))

        XCTAssertFalse(appServer.isAvailable)
        XCTAssertEqual(appServer.startupErrorMessage, "port 4317 unavailable")
        XCTAssertEqual(availability, [false])
    }

    func testThreadWindowPrepareFailureKeepsServerUnavailable() {
        let shell = RecordingElectronShellProcess()
        let appServer = ElectronBackedAppServer(shell: shell, platformClient: nil)
        var availability: [Bool] = []
        appServer.onAvailabilityChange = { availability.append($0) }

        appServer.start()
        shell.emit(.agentServerHealth(available: true, message: nil))
        shell.emit(.threadWindowPrepareFailed(message: "prewarm failed"))

        XCTAssertFalse(appServer.isAvailable)
        XCTAssertEqual(appServer.startupErrorMessage, "prewarm failed")
        XCTAssertEqual(availability, [false])
    }

    func testThreadWindowPreparedDoesNotClearAgentServerFailure() {
        let shell = RecordingElectronShellProcess()
        let appServer = ElectronBackedAppServer(shell: shell, platformClient: nil)

        appServer.start()
        shell.emit(.agentServerHealth(available: false, message: "port unavailable"))
        shell.emit(.threadWindowPrepared(timestamp: "2026-06-08T00:00:01.000Z"))

        XCTAssertFalse(appServer.isAvailable)
        XCTAssertEqual(appServer.startupErrorMessage, "port unavailable")
    }

    func testThreadWindowClosedReportsSpecificPrewarmError() {
        let shell = RecordingElectronShellProcess()
        let appServer = ElectronBackedAppServer(shell: shell, platformClient: nil)
        var availability: [Bool] = []
        appServer.onAvailabilityChange = { availability.append($0) }

        appServer.start()
        shell.emit(.agentServerHealth(available: true, message: nil))
        shell.emit(.threadWindowPrepared(timestamp: "2026-06-08T00:00:01.000Z"))
        shell.emit(.threadWindowClosed(timestamp: "2026-06-08T00:00:02.000Z", wasVisible: false))

        XCTAssertFalse(appServer.isAvailable)
        XCTAssertEqual(appServer.startupErrorMessage, "Electron ThreadWindow 已关闭，正在重新预热…")
        XCTAssertEqual(availability, [true, false])
    }

    func testStopSendsShutdownDisconnectsPlatformClientAndStopsShell() {
        let shell = RecordingElectronShellProcess()
        let transport = RecordingElectronBackedConnectionTransport()
        let platformClient = PlatformBridgeConnectionClient(
            connection: AppServerConnection(
                serverURL: URL(string: "ws://127.0.0.1:4317/api/platform")!,
                transport: transport,
                reconnectDelay: 0
            ),
            platformBridge: PlatformBridgeService(provider: RecordingElectronBackedPlatformProvider())
        )
        let appServer = ElectronBackedAppServer(shell: shell, platformClient: platformClient)

        appServer.start()
        shell.emit(.threadWindowPrepared(timestamp: "2026-06-08T00:00:00.000Z"))
        shell.emit(.agentServerHealth(available: true, message: nil))
        appServer.stop()

        XCTAssertEqual(shell.sentCommands.count, 1)
        guard case .shutdown = shell.sentCommands[0] else {
            return XCTFail("expected shutdown command")
        }
        XCTAssertEqual(transport.tasks.first?.cancelCount, 1)
        XCTAssertEqual(shell.stopCount, 1)
        XCTAssertFalse(appServer.isAvailable)
    }

    func testStopPublishesUnavailableAndIgnoresLaterShellEvents() {
        let shell = RecordingElectronShellProcess()
        let appServer = ElectronBackedAppServer(shell: shell, platformClient: nil)
        var availability: [Bool] = []
        appServer.onAvailabilityChange = { availability.append($0) }

        appServer.start()
        shell.emit(.threadWindowPrepared(timestamp: "2026-06-08T00:00:00.000Z"))
        shell.emit(.agentServerHealth(available: true, message: nil))
        appServer.stop()
        shell.emit(.agentServerHealth(available: true, message: nil))
        shell.emit(.threadWindowPrepared(timestamp: "2026-06-08T00:00:01.000Z"))

        XCTAssertFalse(appServer.isAvailable)
        XCTAssertEqual(availability, [true, false])
    }

    func testUnexpectedShellTerminationReportsFatalErrorAndMarksUnavailable() {
        let shell = RecordingElectronShellProcess()
        let appServer = ElectronBackedAppServer(shell: shell, platformClient: nil)
        var fatalMessages: [String] = []
        var availability: [Bool] = []
        appServer.onFatalError = { fatalMessages.append($0) }
        appServer.onAvailabilityChange = { availability.append($0) }

        appServer.start()
        shell.emit(.threadWindowPrepared(timestamp: "2026-06-08T00:00:00.000Z"))
        shell.emit(.agentServerHealth(available: true, message: nil))
        shell.terminate(message: "Electron shell exited with status 9")

        XCTAssertFalse(appServer.isAvailable)
        XCTAssertEqual(appServer.startupErrorMessage, "Electron shell exited with status 9")
        XCTAssertEqual(fatalMessages, ["Electron shell exited with status 9"])
        XCTAssertEqual(availability, [true, false])
    }

    func testRendererCrashReportsFatalErrorAndMarksUnavailable() {
        let shell = RecordingElectronShellProcess()
        let appServer = ElectronBackedAppServer(shell: shell, platformClient: nil)
        var fatalMessages: [String] = []
        var availability: [Bool] = []
        appServer.onFatalError = { fatalMessages.append($0) }
        appServer.onAvailabilityChange = { availability.append($0) }

        appServer.start()
        shell.emit(.threadWindowPrepared(timestamp: "2026-06-08T00:00:00.000Z"))
        shell.emit(.agentServerHealth(available: true, message: nil))
        shell.emit(.rendererCrashed(window: .thread, reason: "renderer gone"))

        XCTAssertFalse(appServer.isAvailable)
        XCTAssertEqual(appServer.startupErrorMessage, "renderer gone")
        XCTAssertEqual(fatalMessages, ["renderer gone"])
        XCTAssertEqual(availability, [true, false])
    }
}

@MainActor
private final class RecordingElectronShellProcess: ElectronShellProcessing {
    var onEvent: ((ElectronShellEvent) -> Void)?
    var onTermination: ((String) -> Void)?
    private(set) var startCount = 0
    private(set) var stopCount = 0
    private(set) var sentCommands: [ElectronShellCommand] = []

    func start() throws {
        startCount += 1
    }

    func send(_ command: ElectronShellCommand) throws {
        sentCommands.append(command)
    }

    func stop() {
        stopCount += 1
    }

    func emit(_ event: ElectronShellEvent) {
        onEvent?(event)
    }

    func terminate(message: String) {
        onTermination?(message)
    }
}

private final class RecordingElectronBackedConnectionTransport: AppServerConnectionTransport {
    private(set) var tasks: [RecordingElectronBackedConnectionTask] = []

    func makeWebSocketTask(with url: URL) -> any AppServerWebSocketTask {
        let task = RecordingElectronBackedConnectionTask()
        tasks.append(task)
        return task
    }
}

private final class RecordingElectronBackedConnectionTask: AppServerWebSocketTask {
    private(set) var cancelCount = 0

    func resume() {}

    func cancel(with closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
        cancelCount += 1
    }

    func send(
        _ message: URLSessionWebSocketTask.Message,
        completionHandler: @escaping @Sendable (Error?) -> Void
    ) {
        completionHandler(nil)
    }

    func receive(
        completionHandler: @escaping @Sendable (Result<URLSessionWebSocketTask.Message, Error>) -> Void
    ) {}
}

@MainActor
private final class RecordingElectronBackedPlatformProvider: PlatformProvider {
    func handle(method: String, args: Any?) async throws -> Any? {
        nil
    }
}

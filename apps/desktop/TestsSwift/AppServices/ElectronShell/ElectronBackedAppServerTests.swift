import XCTest
@testable import HandAgentDesktop

@MainActor
final class ElectronBackedAppServerTests: XCTestCase {
    func testOpenInitialPromptSendsElectronPayload() throws {
        let shell = RecordingElectronShellProcess()
        let appServer = ElectronBackedAppServer(shell: shell, platformClient: nil)
        let prompt = try XCTUnwrap(PromptSubmission.compose(draft: "hello", attachments: []))

        let commandId = try appServer.openInitialPrompt(prompt)

        guard case .openInitialPrompt(let sentCommandId, let payload) = shell.sentCommands.first else {
            return XCTFail("expected open initial prompt command")
        }
        XCTAssertEqual(sentCommandId, commandId)
        XCTAssertEqual(payload.text, "hello")
        XCTAssertEqual(payload.attachments, [])
        XCTAssertNil(payload.actionBinding)
    }

    func testOpenHistorySendsOpenHistoryCommand() throws {
        let shell = RecordingElectronShellProcess()
        let appServer = ElectronBackedAppServer(shell: shell, platformClient: nil)

        let commandId = try appServer.openHistory()

        guard case .openHistory(let sentCommandId) = shell.sentCommands.first else {
            return XCTFail("expected open history command")
        }
        XCTAssertEqual(sentCommandId, commandId)
    }

    func testFocusSendsFocusCommand() throws {
        let shell = RecordingElectronShellProcess()
        let appServer = ElectronBackedAppServer(shell: shell, platformClient: nil)

        let commandId = try appServer.focus(threadId: "thread-1")

        guard case .focus(let sentCommandId, let threadId) = shell.sentCommands.first else {
            return XCTFail("expected focus command")
        }
        XCTAssertEqual(sentCommandId, commandId)
        XCTAssertEqual(threadId, "thread-1")
    }

    func testShowActivityWindowSendsCommand() throws {
        let shell = RecordingElectronShellProcess()
        let appServer = ElectronBackedAppServer(shell: shell, platformClient: nil)

        let commandId = try appServer.showActivityWindow()

        guard case .showActivityWindow(let sentCommandId) = shell.sentCommands.first else {
            return XCTFail("expected show activity window command")
        }
        XCTAssertEqual(sentCommandId, commandId)
    }

    func testCommandAckPublishesThreadWindowCommandResult() throws {
        let shell = RecordingElectronShellProcess()
        let appServer = ElectronBackedAppServer(shell: shell, platformClient: nil)
        var results: [ThreadWindowCommandResult] = []
        appServer.onCommandResult = { results.append($0) }

        appServer.start()
        let commandId = try appServer.focus(threadId: "thread-1")
        shell.emit(.commandAck(
            commandId: commandId,
            ok: false,
            error: "thread window is not visible"
        ))

        XCTAssertEqual(results, [
            ThreadWindowCommandResult(
                commandId: commandId,
                kind: .focus,
                ok: false,
                error: "thread window is not visible"
            ),
        ])
    }

    func testActivityWindowCommandAckPublishesActivityCommandResult() throws {
        let shell = RecordingElectronShellProcess()
        let appServer = ElectronBackedAppServer(shell: shell, platformClient: nil)
        var results: [ActivityWindowCommandResult] = []
        appServer.onActivityWindowCommandResult = { results.append($0) }

        appServer.start()
        let commandId = try appServer.showActivityWindow()
        shell.emit(.commandAck(
            commandId: commandId,
            ok: false,
            error: "activity window is not visible"
        ))

        XCTAssertEqual(results, [
            ActivityWindowCommandResult(
                commandId: commandId,
                kind: .show,
                ok: false,
                error: "activity window is not visible"
            ),
        ])
    }

    func testUnknownCommandAckIsIgnored() {
        let shell = RecordingElectronShellProcess()
        let appServer = ElectronBackedAppServer(shell: shell, platformClient: nil)
        var results: [ThreadWindowCommandResult] = []
        appServer.onCommandResult = { results.append($0) }

        appServer.start()
        shell.emit(.commandAck(commandId: "missing", ok: false, error: "ignored"))

        XCTAssertTrue(results.isEmpty)
    }

    func testPromptPanelShowRequestInvokesCallback() {
        let shell = RecordingElectronShellProcess()
        let appServer = ElectronBackedAppServer(shell: shell, platformClient: nil)
        var showRequestCount = 0
        appServer.onPromptPanelShowRequested = { showRequestCount += 1 }

        appServer.start()
        shell.emit(.promptPanelShowRequested(reason: .activityWindowClickedWithoutThread))

        XCTAssertEqual(showRequestCount, 1)
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

    func testStopClearsActivityWindowCallbacksAndPendingCommands() throws {
        let shell = RecordingElectronShellProcess()
        let appServer = ElectronBackedAppServer(shell: shell, platformClient: nil)
        var results: [ActivityWindowCommandResult] = []
        var showRequestCount = 0
        appServer.onActivityWindowCommandResult = { results.append($0) }
        appServer.onPromptPanelShowRequested = { showRequestCount += 1 }

        appServer.start()
        let commandId = try appServer.showActivityWindow()
        appServer.stop()
        shell.emit(.commandAck(commandId: commandId, ok: true, error: nil))
        shell.emit(.promptPanelShowRequested(reason: .activityWindowClickedWithoutThread))

        XCTAssertNil(appServer.onActivityWindowCommandResult)
        XCTAssertNil(appServer.onPromptPanelShowRequested)
        XCTAssertTrue(results.isEmpty)
        XCTAssertEqual(showRequestCount, 0)
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

    func testActivityRendererCrashDoesNotMarkServerUnavailable() {
        let shell = RecordingElectronShellProcess()
        let appServer = ElectronBackedAppServer(shell: shell, platformClient: nil)
        var fatalMessages: [String] = []
        var availability: [Bool] = []
        appServer.onFatalError = { fatalMessages.append($0) }
        appServer.onAvailabilityChange = { availability.append($0) }

        appServer.start()
        shell.emit(.threadWindowPrepared(timestamp: "2026-06-08T00:00:00.000Z"))
        shell.emit(.agentServerHealth(available: true, message: nil))
        shell.emit(.rendererCrashed(window: .activity, reason: "activity renderer gone"))

        XCTAssertTrue(appServer.isAvailable)
        XCTAssertNil(appServer.startupErrorMessage)
        XCTAssertTrue(fatalMessages.isEmpty)
        XCTAssertEqual(availability, [true])
    }
}

@MainActor
private final class RecordingElectronShellProcess: ElectronShellProcessing {
    var onEvent: ((ElectronShellEvent) -> Void)?
    var onTermination: ((String) -> Void)?
    private(set) var startCount = 0
    private(set) var stopCount = 0
    private(set) var sentCommands: [ElectronShellCommand] = []
    var sendError: Error?

    func start() throws {
        startCount += 1
    }

    func send(_ command: ElectronShellCommand) throws {
        if let sendError {
            throw sendError
        }
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

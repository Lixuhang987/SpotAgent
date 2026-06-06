import XCTest
@testable import HandAgentDesktop

final class ThreadTabViewModelTests: XCTestCase {
    @MainActor
    private func makeTab(
        threadID: String = "thread-1",
        sentCommands: UnsafeMutablePointer<[ThreadWindowCommand]>? = nil,
        sentResponses: UnsafeMutablePointer<[ThreadWindowResponse]>? = nil,
        copyMessageText: @escaping @MainActor (String) -> Void = { _ in },
        onStateChanged: @escaping @MainActor (ThreadTabViewModel) -> Void = { _ in }
    ) -> ThreadTabViewModel {
        let bus = ThreadEventBus<ThreadEvent>()
        var state = ThreadFeature.State(threadID: threadID)
        return ThreadTabViewModel(
            tabID: "tab-1",
            threadID: threadID,
            readState: { state },
            sendAction: { action in
                ThreadFeature.apply(action, to: &state)
            },
            subscribeToEvents: { id, handler in
                bus.subscribe(threadID: id, handler: handler)
            },
            sendCommand: { command in
                sentCommands?.pointee.append(command)
            },
            sendResponse: { response in
                sentResponses?.pointee.append(response)
            },
            copyMessageText: copyMessageText,
            onStateChanged: onStateChanged
        )
    }

    func testThreadRunStatusNormalizesProtocolValues() {
        XCTAssertEqual(ThreadRunStatus.fromProtocolStatus("running"), .running)
        XCTAssertEqual(ThreadRunStatus.fromProtocolStatus("completed"), .idle)
        XCTAssertEqual(ThreadRunStatus.fromProtocolStatus("failed"), .failed)
        XCTAssertEqual(ThreadRunStatus.fromProtocolStatus("unknown"), .idle)
    }

    @MainActor
    func testSnapshotFillsMessages() {
        let tab = makeTab()

        tab.handle(.threadSnapshot(
            messages: [ThreadBubble(id: "m1", role: "user", text: "hello")],
            status: "idle"
        ))

        XCTAssertEqual(tab.messages.map(\.text), ["hello"])
        XCTAssertEqual(tab.status, .idle)
    }

    @MainActor
    func testBackgroundTabKeepsRunningState() {
        let tab = makeTab()

        tab.handle(.assistantMessageStart(
            messageID: "a1",
            timestamp: "2026-05-20T00:00:00.000Z"
        ))
        tab.handle(.assistantMessageDelta(
            messageID: "a1",
            text: "hello",
            timestamp: "2026-05-20T00:00:00.100Z"
        ))

        XCTAssertEqual(tab.status, .running)
        XCTAssertEqual(tab.messages.last?.text, "hello")
    }

    @MainActor
    func testOpenThreadSnapshotDoesNotClearInFlightLocalPrompt() {
        let tab = makeTab()

        tab.sendPrompt("hello from panel")
        tab.handle(.threadSnapshot(messages: [], status: "idle"))

        XCTAssertEqual(tab.messages.map(\.text), ["hello from panel"])
        XCTAssertEqual(tab.status, .running)
    }

    @MainActor
    func testOpenThreadSnapshotDoesNotClearStreamingAssistantBubble() {
        let tab = makeTab()

        tab.sendPrompt("hello from panel")
        tab.handle(.assistantMessageStart(messageID: "assistant-1", timestamp: "2026-05-20T00:00:00.000Z"))
        tab.handle(.assistantMessageDelta(
            messageID: "assistant-1",
            text: "hi",
            timestamp: "2026-05-20T00:00:00.100Z"
        ))
        tab.handle(.threadSnapshot(
            messages: [ThreadBubble(id: "msg-0", role: "user", text: "hello from panel")],
            status: "idle"
        ))

        XCTAssertEqual(tab.messages.map(\.text), ["hello from panel", "hi"])
        XCTAssertEqual(tab.status, .running)
    }

    @MainActor
    func testOpenThreadSnapshotWithPersistedPromptKeepsLocalTurnRunning() {
        let tab = makeTab()

        tab.sendPrompt("hello from panel")
        tab.handle(.threadSnapshot(
            messages: [ThreadBubble(id: "msg-0", role: "user", text: "hello from panel")],
            status: "idle"
        ))

        XCTAssertEqual(tab.messages.map(\.text), ["hello from panel"])
        XCTAssertEqual(tab.status, .running)
    }

    @MainActor
    func testLateStaleSnapshotDoesNotClearCompletedLocalAssistantBubble() {
        let tab = makeTab()

        tab.sendPrompt("hello from panel")
        tab.handle(.assistantMessageStart(messageID: "assistant-1", timestamp: "2026-05-20T00:00:00.000Z"))
        tab.handle(.assistantMessageDelta(
            messageID: "assistant-1",
            text: "hi",
            timestamp: "2026-05-20T00:00:00.100Z"
        ))
        tab.handle(.assistantMessageEnd(
            messageID: "assistant-1",
            status: "completed",
            timestamp: "2026-05-20T00:00:00.200Z"
        ))
        tab.handle(.threadSnapshot(
            messages: [ThreadBubble(id: "msg-0", role: "user", text: "hello from panel")],
            status: "idle"
        ))

        XCTAssertEqual(tab.messages.map(\.text), ["hello from panel", "hi"])
        XCTAssertEqual(tab.status, .idle)
    }

    @MainActor
    func testStaleSnapshotWithRepeatedPromptTextKeepsNewLocalTurnRunning() {
        let tab = makeTab()

        tab.handle(.threadSnapshot(
            messages: [
                ThreadBubble(id: "msg-0", role: "user", text: "repeat"),
                ThreadBubble(id: "msg-1", role: "assistant", text: "old reply"),
            ],
            status: "idle"
        ))
        tab.sendPrompt("repeat")
        tab.handle(.threadSnapshot(
            messages: [
                ThreadBubble(id: "msg-0", role: "user", text: "repeat"),
                ThreadBubble(id: "msg-1", role: "assistant", text: "old reply"),
            ],
            status: "idle"
        ))

        XCTAssertEqual(tab.messages.map(\.text), ["repeat", "old reply", "repeat"])
        XCTAssertEqual(tab.status, .running)
    }

    @MainActor
    func testOpenFailedMarksTabInvalid() {
        let tab = makeTab()

        tab.handle(.threadOpenFailed(reason: "not_found", message: "Thread not found: thread-1"))

        XCTAssertTrue(tab.isInvalid)
        XCTAssertEqual(tab.invalidReason, "Thread not found: thread-1")
    }

    @MainActor
    func testCopyMessageCopiesOneMessageTextByID() {
        var copiedTexts: [String] = []
        let tab = makeTab(copyMessageText: { copiedTexts.append($0) })

        tab.handle(.threadSnapshot(
            messages: [
                ThreadBubble(id: "m1", role: "user", text: "first"),
                ThreadBubble(id: "m2", role: "assistant", text: "second\nmessage"),
            ],
            status: "idle"
        ))

        tab.copyMessage(messageID: "m2")

        XCTAssertEqual(copiedTexts, ["second\nmessage"])
    }

    @MainActor
    func testFailedSnapshotUsesLastAssistantMessageAsErrorBanner() {
        let tab = makeTab()

        tab.handle(.threadSnapshot(
            messages: [
                ThreadBubble(id: "msg-0", role: "user", text: "slow prompt"),
                ThreadBubble(
                    id: "msg-1",
                    role: "assistant",
                    text: "本轮运行因 agent-server 重启而中断，请重新发送请求。"
                ),
            ],
            status: "failed"
        ))

        XCTAssertEqual(tab.status, .failed)
        XCTAssertEqual(tab.error, "本轮运行因 agent-server 重启而中断，请重新发送请求。")
    }

    @MainActor
    func testTerminalToolMessageClearsMatchingPendingPermissionRequest() {
        let tab = makeTab()

        tab.handle(.permissionRequest(
            requestId: "thread-1:req-1",
            toolName: "clipboard.read",
            toolCallId: "tool-1",
            argumentsJSON: "{}"
        ))
        tab.handle(.toolMessage(
            messageID: "thread-1-tool-1",
            name: "clipboard.read",
            text: "{}",
            status: "running",
            timestamp: "2026-05-21T00:00:00.000Z"
        ))

        XCTAssertEqual(tab.pendingPermissionRequests.map(\.id), ["thread-1:req-1"])

        tab.handle(.toolMessage(
            messageID: "thread-1-tool-1",
            name: "clipboard.read",
            text: "用户拒绝执行该 tool",
            status: "failed",
            timestamp: "2026-05-21T00:01:00.000Z"
        ))

        XCTAssertTrue(tab.pendingPermissionRequests.isEmpty)
        XCTAssertEqual(tab.messages.last?.text, "clipboard.read: 用户拒绝执行该 tool")
    }

    @MainActor
    func testPermissionRequestKeepsTabRunningAfterAssistantEndCompleted() {
        var stateChangeStatuses: [ThreadRunStatus] = []
        let tab = makeTab(onStateChanged: { stateChangeStatuses.append($0.status) })

        tab.handle(.assistantMessageStart(
            messageID: "assistant-1",
            timestamp: "2026-05-22T00:00:00.000Z"
        ))
        tab.handle(.assistantMessageEnd(
            messageID: "assistant-1",
            status: "completed",
            timestamp: "2026-05-22T00:00:00.100Z"
        ))
        tab.handle(.permissionRequest(
            requestId: "thread-1:req-1",
            toolName: "workspace.askUser",
            toolCallId: "tool-1",
            argumentsJSON: "{}"
        ))

        XCTAssertEqual(tab.status, .running)
        XCTAssertEqual(tab.pendingPermissionRequests.map(\.id), ["thread-1:req-1"])
        XCTAssertEqual(stateChangeStatuses.last, .running)

        tab.resolvePermission(requestId: "thread-1:req-1", decision: "allow", scope: "once")

        XCTAssertEqual(tab.status, .running)
    }

    @MainActor
    func testWorkspaceAskRequestKeepsTabRunningAfterAssistantEndCompleted() {
        var stateChangeStatuses: [ThreadRunStatus] = []
        let tab = makeTab(onStateChanged: { stateChangeStatuses.append($0.status) })

        tab.handle(.assistantMessageStart(
            messageID: "assistant-1",
            timestamp: "2026-05-22T00:00:00.000Z"
        ))
        tab.handle(.assistantMessageEnd(
            messageID: "assistant-1",
            status: "completed",
            timestamp: "2026-05-22T00:00:00.100Z"
        ))
        tab.handle(.workspaceAskRequest(
            requestId: "ask-1",
            prompt: "选择工作区",
            candidates: [
                WorkspaceAskCandidate(id: "docs", name: "文档", description: "产品文档", isDefault: false),
            ]
        ))

        XCTAssertEqual(tab.status, .running)
        XCTAssertEqual(tab.pendingWorkspaceAskRequests.map(\.id), ["ask-1"])
        XCTAssertEqual(stateChangeStatuses.last, .running)

        tab.resolveWorkspaceAsk(requestId: "ask-1", workspaceId: "docs")

        XCTAssertEqual(tab.status, .running)
    }

    @MainActor
    func testRunningToolMessageKeepsTabRunningAfterAssistantEndCompleted() {
        var stateChangeStatuses: [ThreadRunStatus] = []
        let tab = makeTab(onStateChanged: { stateChangeStatuses.append($0.status) })

        tab.handle(.assistantMessageStart(
            messageID: "assistant-1",
            timestamp: "2026-05-22T00:00:00.000Z"
        ))
        tab.handle(.assistantMessageEnd(
            messageID: "assistant-1",
            status: "completed",
            timestamp: "2026-05-22T00:00:00.100Z"
        ))
        tab.handle(.toolMessage(
            messageID: "thread-1-tool-1",
            name: "workspace.list",
            text: "{}",
            status: "running",
            timestamp: "2026-05-22T00:00:00.200Z"
        ))

        XCTAssertEqual(tab.status, .running)
        XCTAssertEqual(tab.messages.last?.text, "workspace.list: {}")
        XCTAssertEqual(stateChangeStatuses.last, .running)
    }

    @MainActor
    func testSendPromptUsesSharedCommandPath() {
        var commands: [ThreadWindowCommand] = []
        let tab = withUnsafeMutablePointer(to: &commands) { pointer in
            makeTab(sentCommands: pointer)
        }

        tab.sendPrompt("hello", attachments: [.textSelection(id: "sel-1", text: "let value = 1")])

        XCTAssertEqual(tab.messages.map(\.text), ["hello"])
        guard case let .turnStart(threadId, commandId, _, text, attachments)? = commands.last else {
            return XCTFail("expected turnStart command")
        }
        XCTAssertEqual(threadId, "thread-1")
        XCTAssertEqual(commandId, tab.messages.first?.id)
        XCTAssertEqual(text, "hello")
        XCTAssertEqual(attachments.count, 1)
    }
}

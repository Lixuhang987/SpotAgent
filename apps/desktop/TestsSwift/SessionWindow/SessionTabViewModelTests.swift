import XCTest
@testable import HandAgentDesktop

final class SessionTabViewModelTests: XCTestCase {
    func testSessionRunStatusNormalizesProtocolValues() {
        XCTAssertEqual(SessionRunStatus.fromProtocolStatus("running"), .running)
        XCTAssertEqual(SessionRunStatus.fromProtocolStatus("completed"), .idle)
        XCTAssertEqual(SessionRunStatus.fromProtocolStatus("failed"), .failed)
        XCTAssertEqual(SessionRunStatus.fromProtocolStatus("unknown"), .idle)
    }

    @MainActor
    func testSnapshotFillsMessages() {
        let tab = SessionTabViewModel(
            tabID: "tab-1",
            sessionID: "session-1",
            socketClient: .noop
        )

        tab.handle(.sessionSnapshot(
            messages: [SessionBubble(id: "m1", role: "user", text: "hello")],
            status: "idle"
        ))

        XCTAssertEqual(tab.messages.map(\.text), ["hello"])
        XCTAssertEqual(tab.status, .idle)
    }

    @MainActor
    func testBackgroundTabKeepsRunningState() {
        let tab = SessionTabViewModel(
            tabID: "tab-1",
            sessionID: "session-1",
            socketClient: .noop
        )

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
    func testOpenSessionSnapshotDoesNotClearInFlightLocalPrompt() {
        let tab = SessionTabViewModel(
            tabID: "tab-1",
            sessionID: "session-1",
            socketClient: .noop
        )

        tab.sendPrompt("hello from panel")
        tab.handle(.sessionSnapshot(messages: [], status: "idle"))

        XCTAssertEqual(tab.messages.map(\.text), ["hello from panel"])
        XCTAssertEqual(tab.status, .running)
    }

    @MainActor
    func testOpenSessionSnapshotDoesNotClearStreamingAssistantBubble() {
        let tab = SessionTabViewModel(
            tabID: "tab-1",
            sessionID: "session-1",
            socketClient: .noop
        )

        tab.sendPrompt("hello from panel")
        tab.handle(.assistantMessageStart(messageID: "assistant-1", timestamp: "2026-05-20T00:00:00.000Z"))
        tab.handle(.assistantMessageDelta(
            messageID: "assistant-1",
            text: "hi",
            timestamp: "2026-05-20T00:00:00.100Z"
        ))
        tab.handle(.sessionSnapshot(
            messages: [SessionBubble(id: "msg-0", role: "user", text: "hello from panel")],
            status: "idle"
        ))

        XCTAssertEqual(tab.messages.map(\.text), ["hello from panel", "hi"])
        XCTAssertEqual(tab.status, .running)
    }

    @MainActor
    func testOpenSessionSnapshotWithPersistedPromptKeepsLocalTurnRunning() {
        let tab = SessionTabViewModel(
            tabID: "tab-1",
            sessionID: "session-1",
            socketClient: .noop
        )

        tab.sendPrompt("hello from panel")
        tab.handle(.sessionSnapshot(
            messages: [SessionBubble(id: "msg-0", role: "user", text: "hello from panel")],
            status: "idle"
        ))

        XCTAssertEqual(tab.messages.map(\.text), ["hello from panel"])
        XCTAssertEqual(tab.status, .running)
    }

    @MainActor
    func testLateStaleSnapshotDoesNotClearCompletedLocalAssistantBubble() {
        let tab = SessionTabViewModel(
            tabID: "tab-1",
            sessionID: "session-1",
            socketClient: .noop
        )

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
        tab.handle(.sessionSnapshot(
            messages: [SessionBubble(id: "msg-0", role: "user", text: "hello from panel")],
            status: "idle"
        ))

        XCTAssertEqual(tab.messages.map(\.text), ["hello from panel", "hi"])
        XCTAssertEqual(tab.status, .idle)
    }

    @MainActor
    func testStaleSnapshotWithRepeatedPromptTextKeepsNewLocalTurnRunning() {
        let tab = SessionTabViewModel(
            tabID: "tab-1",
            sessionID: "session-1",
            socketClient: .noop
        )

        tab.handle(.sessionSnapshot(
            messages: [
                SessionBubble(id: "msg-0", role: "user", text: "repeat"),
                SessionBubble(id: "msg-1", role: "assistant", text: "old reply"),
            ],
            status: "idle"
        ))
        tab.sendPrompt("repeat")
        tab.handle(.sessionSnapshot(
            messages: [
                SessionBubble(id: "msg-0", role: "user", text: "repeat"),
                SessionBubble(id: "msg-1", role: "assistant", text: "old reply"),
            ],
            status: "idle"
        ))

        XCTAssertEqual(tab.messages.map(\.text), ["repeat", "old reply", "repeat"])
        XCTAssertEqual(tab.status, .running)
    }

    @MainActor
    func testOpenFailedMarksTabInvalid() {
        let tab = SessionTabViewModel(
            tabID: "tab-1",
            sessionID: "session-1",
            socketClient: .noop
        )

        tab.handle(.sessionOpenFailed(reason: "not_found", message: "Session not found: session-1"))

        XCTAssertTrue(tab.isInvalid)
        XCTAssertEqual(tab.invalidReason, "Session not found: session-1")
    }

    @MainActor
    func testCopyMessageCopiesOneMessageTextByID() {
        var copiedTexts: [String] = []
        let tab = SessionTabViewModel(
            tabID: "tab-1",
            sessionID: "session-1",
            socketClient: .noop,
            copyMessageText: { copiedTexts.append($0) }
        )

        tab.handle(.sessionSnapshot(
            messages: [
                SessionBubble(id: "m1", role: "user", text: "first"),
                SessionBubble(id: "m2", role: "assistant", text: "second\nmessage"),
            ],
            status: "idle"
        ))

        tab.copyMessage(messageID: "m2")

        XCTAssertEqual(copiedTexts, ["second\nmessage"])
    }

    @MainActor
    func testFailedSnapshotUsesLastAssistantMessageAsErrorBanner() {
        let tab = SessionTabViewModel(
            tabID: "tab-1",
            sessionID: "session-1",
            socketClient: .noop
        )

        tab.handle(.sessionSnapshot(
            messages: [
                SessionBubble(id: "msg-0", role: "user", text: "slow prompt"),
                SessionBubble(
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
        let tab = SessionTabViewModel(
            tabID: "tab-1",
            sessionID: "session-1",
            socketClient: .noop
        )

        tab.handle(.permissionRequest(
            requestId: "session-1:req-1",
            toolName: "clipboard.read",
            toolCallId: "tool-1",
            argumentsJSON: "{}"
        ))
        tab.handle(.toolMessage(
            messageID: "session-1-tool-1",
            name: "clipboard.read",
            text: "{}",
            status: "running",
            timestamp: "2026-05-21T00:00:00.000Z"
        ))

        XCTAssertEqual(tab.pendingPermissionRequests.map(\.id), ["session-1:req-1"])

        tab.handle(.toolMessage(
            messageID: "session-1-tool-1",
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
        var stateChangeStatuses: [SessionRunStatus] = []
        let tab = SessionTabViewModel(
            tabID: "tab-1",
            sessionID: "session-1",
            socketClient: .noop,
            onStateChanged: { stateChangeStatuses.append($0.status) }
        )

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
            requestId: "session-1:req-1",
            toolName: "workspace.askUser",
            toolCallId: "tool-1",
            argumentsJSON: "{}"
        ))

        XCTAssertEqual(tab.status, .running)
        XCTAssertEqual(tab.pendingPermissionRequests.map(\.id), ["session-1:req-1"])
        XCTAssertEqual(stateChangeStatuses.last, .running)

        tab.resolvePermission(requestId: "session-1:req-1", decision: "allow", scope: "once")

        XCTAssertEqual(tab.status, .running)
    }

    @MainActor
    func testWorkspaceAskRequestKeepsTabRunningAfterAssistantEndCompleted() {
        var stateChangeStatuses: [SessionRunStatus] = []
        let tab = SessionTabViewModel(
            tabID: "tab-1",
            sessionID: "session-1",
            socketClient: .noop,
            onStateChanged: { stateChangeStatuses.append($0.status) }
        )

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
}

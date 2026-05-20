import XCTest
@testable import HandAgentDesktop

final class SessionViewModelTests: XCTestCase {
    @MainActor
    func testAppendsAssistantDeltaIntoStreamingMessage() {
        let model = SessionViewModel(sessionID: "session-1", socketClient: .noop)

        model.handle(.assistantMessageStart(messageID: "m1", timestamp: "2026-05-14T00:00:00.000Z"))
        model.handle(
            .assistantMessageDelta(
                messageID: "m1",
                text: "hello",
                timestamp: "2026-05-14T00:00:00.100Z"
            )
        )

        XCTAssertEqual(model.messages.last?.text, "hello")
    }

    @MainActor
    func testAppendsMultipleAssistantDeltasInOrder() {
        let model = SessionViewModel(sessionID: "session-1", socketClient: .noop)

        model.handle(.assistantMessageStart(messageID: "m1", timestamp: "2026-05-14T00:00:00.000Z"))
        for (index, text) in ["这", "是", "真", "流", "式"].enumerated() {
            model.handle(
                .assistantMessageDelta(
                    messageID: "m1",
                    text: text,
                    timestamp: "2026-05-14T00:00:00.\(index + 1)00Z"
                )
            )
        }

        XCTAssertEqual(model.messages.last?.text, "这是真流式")
    }

    @MainActor
    func testStartShowsStartupErrorWithoutSendingPrompt() {
        let model = SessionViewModel(sessionID: "session-1", socketClient: .noop)

        model.start(initialPrompt: "hello", startupError: "Node.js not found.")

        XCTAssertEqual(model.status, .failed)
        XCTAssertEqual(model.error, "Node.js not found.")
        XCTAssertEqual(model.messages.map(\.text), ["Node.js not found."])
    }

    @MainActor
    func testIgnoresDuplicateConsecutiveErrorsWithSameMessage() {
        let model = SessionViewModel(sessionID: "session-1", socketClient: .noop)

        model.handle(
            .error(
                messageID: "e1",
                message: "Could not connect to the server.",
                timestamp: "2026-05-14T00:00:00.000Z"
            )
        )
        model.handle(
            .error(
                messageID: "e2",
                message: "Could not connect to the server.",
                timestamp: "2026-05-14T00:00:00.100Z"
            )
        )

        XCTAssertEqual(model.messages.map(\.text), ["Could not connect to the server."])
        XCTAssertEqual(model.error, "Could not connect to the server.")
        XCTAssertEqual(model.status, .failed)
    }

    @MainActor
    func testDisconnectedConnectionStateShowsReconnectMessageWithoutAddingAssistantBubble() {
        let model = SessionViewModel(sessionID: "session-1", socketClient: .noop)

        model.handle(.connectionState(.reconnecting))

        XCTAssertEqual(model.connectionState, .reconnecting)
        XCTAssertEqual(model.connectionMessage, "连接已断开，正在自动重连…")
        XCTAssertTrue(model.messages.isEmpty)
        XCTAssertNil(model.error)
    }

    @MainActor
    func testConnectedStateClearsConnectionMessage() {
        let model = SessionViewModel(sessionID: "session-1", socketClient: .noop)

        model.handle(.connectionState(.reconnecting))
        model.handle(.connectionState(.connected))

        XCTAssertEqual(model.connectionState, .connected)
        XCTAssertNil(model.connectionMessage)
    }

    @MainActor
    func testStopSendsInterruptAndKeepsSocketConnected() {
        let transport = RecordingSessionSocketTransportForViewModel()
        let client = SessionSocketClient(
            serverURL: URL(string: "ws://127.0.0.1:4317/api/session")!,
            transport: transport,
            reconnectDelay: 0
        )
        let model = SessionViewModel(sessionID: "session-1", socketClient: client)

        model.start(initialPrompt: "hello")
        model.stop()

        XCTAssertEqual(model.status, .interrupted)
        XCTAssertEqual(transport.tasks[0].sentTypes, ["open_session", "user_message", "interrupt"])
        XCTAssertFalse(transport.tasks[0].didCancel)
    }

    @MainActor
    func testSendPromptWithAttachmentsAddsUserBubbleAttachmentDisplayState() throws {
        let model = SessionViewModel(sessionID: "session-1", socketClient: .noop)

        model.sendPrompt(
            "解释附件",
            attachments: [
                .textSelection(id: "selection-1", text: "let x = 1\nlet y = 2"),
                .image(id: "image-1", mimeType: "image/png", base64: "ZmFrZS1wbmc="),
            ]
        )

        let bubble = try XCTUnwrap(model.messages.last)
        XCTAssertEqual(bubble.role, "user")
        XCTAssertEqual(bubble.text, "解释附件")
        XCTAssertEqual(bubble.attachmentSummaryText, "附件 ×2 · text_selection / image")
        XCTAssertEqual(
            bubble.attachments,
            [
                SessionAttachmentSummary(
                    id: "selection-1",
                    kind: "text_selection",
                    title: "文本选区",
                    detail: "let x = 1"
                ),
                SessionAttachmentSummary(
                    id: "image-1",
                    kind: "image",
                    title: "图片",
                    detail: "image/png"
                ),
            ]
        )
    }

    @MainActor
    func testHistoricalUserMessagesNormalizeAttachmentDisplayState() throws {
        let persistedUserText = """
        解释附件

        [选区]
        let x = 1

        [STUB id=blob-1 kind=image size=9 path="/tmp/blob-1.png"]
        [/STUB]
        """
        let persistedBubble = SessionBubble(id: "u1", role: "user", text: persistedUserText)
        let model = SessionViewModel(sessionID: "session-1", socketClient: .noop)

        model.handle(.sessionSnapshot(messages: [persistedBubble], status: "idle"))

        var bubble = try XCTUnwrap(model.messages.last)
        XCTAssertEqual(bubble.text, "解释附件")
        XCTAssertEqual(bubble.attachmentSummaryText, "附件 ×2 · text_selection / image")
        XCTAssertEqual(bubble.attachments.map(\.kind), ["text_selection", "image"])
        XCTAssertEqual(bubble.attachments[0].detail, "let x = 1")

        model.handle(.sessionLoaded(targetSessionId: "session-1", title: nil, messages: [persistedBubble]))

        bubble = try XCTUnwrap(model.messages.last)
        XCTAssertEqual(bubble.text, "解释附件")
        XCTAssertEqual(bubble.attachmentSummaryText, "附件 ×2 · text_selection / image")
        XCTAssertEqual(bubble.attachments.map(\.kind), ["text_selection", "image"])
        XCTAssertEqual(bubble.attachments[0].detail, "let x = 1")
    }

    @MainActor
    func testTerminalToolMessageReplacesRunningArgumentsBubble() {
        let model = SessionViewModel(sessionID: "session-1", socketClient: .noop)

        model.handle(
            .toolMessage(
                messageID: "session-1-workspace-list",
                name: "workspace.list",
                text: "{}",
                status: "running",
                timestamp: "2026-05-20T00:00:00.000Z"
            )
        )
        model.handle(
            .toolMessage(
                messageID: "session-1-workspace-list",
                name: "workspace.list",
                text: #" [{"id":"qa-workspace","name":"QA","description":"QA workspace","isDefault":false}] "#,
                status: "completed",
                timestamp: "2026-05-20T00:00:00.100Z"
            )
        )
        model.handle(
            .toolMessage(
                messageID: "session-1-path-escape",
                name: "file.write",
                text: #"{"workspaceId":"qa-workspace","relativePath":"../../etc/passwd","content":"should be rejected"}"#,
                status: "running",
                timestamp: "2026-05-20T00:00:01.000Z"
            )
        )
        model.handle(
            .toolMessage(
                messageID: "session-1-path-escape",
                name: "file.write",
                text: "Path escapes workspace root: ../../etc/passwd",
                status: "failed",
                timestamp: "2026-05-20T00:00:01.100Z"
            )
        )

        XCTAssertEqual(
            model.messages.map(\.text),
            [
                #"workspace.list:  [{"id":"qa-workspace","name":"QA","description":"QA workspace","isDefault":false}] "#,
                "file.write: Path escapes workspace root: ../../etc/passwd",
            ]
        )
        XCTAssertEqual(model.messages.map(\.id), ["session-1-workspace-list", "session-1-path-escape"])
    }

    @MainActor
    func testWorkspaceAskRequestsAreQueuedAndResolvedInOrder() {
        let model = SessionViewModel(sessionID: "session-1", socketClient: .noop)

        model.handle(
            .workspaceAskRequest(
                requestId: "ask-1",
                prompt: "第一次",
                candidates: [
                    WorkspaceAskCandidate(id: "docs", name: "文档", description: "产品文档", isDefault: false),
                    WorkspaceAskCandidate(id: "code", name: "代码", description: "源码", isDefault: true),
                ]
            )
        )
        model.handle(
            .workspaceAskRequest(
                requestId: "ask-2",
                prompt: "第二次",
                candidates: [
                    WorkspaceAskCandidate(id: "docs", name: "文档", description: "产品文档", isDefault: false),
                    WorkspaceAskCandidate(id: "code", name: "代码", description: "源码", isDefault: true),
                ]
            )
        )

        XCTAssertEqual(model.pendingWorkspaceAskRequests.map(\.id), ["ask-1", "ask-2"])
        XCTAssertEqual(model.visibleWorkspaceAskRequest?.id, "ask-1")

        model.resolveWorkspaceAsk(requestId: "ask-1", workspaceId: "docs")

        XCTAssertEqual(model.pendingWorkspaceAskRequests.map(\.id), ["ask-2"])
        XCTAssertEqual(model.visibleWorkspaceAskRequest?.id, "ask-2")
    }

    @MainActor
    func testHistoryDeleteRequiresConfirmation() {
        let model = SessionViewModel(sessionID: "session-1", socketClient: .noop)
        model.handle(
            .sessionList(
                sessions: [
                    SessionListItem(
                        id: "history-1",
                        title: "历史会话",
                        updatedAt: "2026-05-19T00:00:00.000Z",
                        messageCount: 2
                    )
                ]
            )
        )

        model.requestDeleteSession("history-1")

        XCTAssertEqual(model.pendingHistoryDeletionID, "history-1")
        XCTAssertEqual(model.historyList.map(\.id), ["history-1"])

        model.confirmDeleteSession()

        XCTAssertNil(model.pendingHistoryDeletionID)
        XCTAssertTrue(model.historyList.isEmpty)
    }
}

private final class RecordingSessionSocketTransportForViewModel: SessionSocketTransport {
    private(set) var tasks: [RecordingSessionWebSocketTaskForViewModel] = []

    func makeWebSocketTask(with url: URL) -> any SessionWebSocketTask {
        let task = RecordingSessionWebSocketTaskForViewModel()
        tasks.append(task)
        return task
    }
}

private final class RecordingSessionWebSocketTaskForViewModel: SessionWebSocketTask {
    private(set) var sentTypes: [String] = []
    private(set) var didCancel = false

    func resume() {}

    func cancel(with closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
        didCancel = true
    }

    func send(
        _ message: URLSessionWebSocketTask.Message,
        completionHandler: @escaping @Sendable (Error?) -> Void
    ) {
        guard case .string(let text) = message,
              let data = text.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = object["type"] as? String else {
            completionHandler(nil)
            return
        }
        sentTypes.append(type)
        completionHandler(nil)
    }

    func receive(
        completionHandler: @escaping @Sendable (Result<URLSessionWebSocketTask.Message, Error>) -> Void
    ) {}
}

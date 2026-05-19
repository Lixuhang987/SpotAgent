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
    func testStartShowsStartupErrorWithoutSendingPrompt() {
        let model = SessionViewModel(sessionID: "session-1", socketClient: .noop)

        model.start(initialPrompt: "hello", startupError: "Node.js not found.")

        XCTAssertEqual(model.status, "failed")
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
        XCTAssertEqual(model.status, "failed")
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
}

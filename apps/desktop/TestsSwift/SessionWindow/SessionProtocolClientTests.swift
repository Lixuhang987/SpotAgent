import XCTest
@testable import HandAgentDesktop

final class SessionProtocolClientTests: XCTestCase {
    func testEncodeSessionCreateCommandIncludesExpectedFields() throws {
        let json = try SessionProtocolClient.encode(
            command: .sessionCreate(
                commandId: "cmd-1",
                timestamp: "2026-06-04T10:00:00.000Z",
                initialText: "hello",
                attachments: [
                    .textSelection(id: "sel-1", text: "selected text"),
                    .image(id: "img-1", mimeType: "image/png", base64: "abc123"),
                ],
                workspaceId: "ws-1",
                actionBinding: ActionBindingPayload(pluginId: "review", promptName: "code_review")
            )
        )

        let object = try XCTUnwrap(jsonObject(json))
        XCTAssertEqual(object["type"] as? String, "session_create")
        XCTAssertEqual(object["commandId"] as? String, "cmd-1")
        XCTAssertNil(object["sessionId"])

        let payload = try XCTUnwrap(object["payload"] as? [String: Any])
        XCTAssertEqual(payload["initialText"] as? String, "hello")
        XCTAssertEqual(payload["workspaceId"] as? String, "ws-1")

        let actionBinding = try XCTUnwrap(payload["actionBinding"] as? [String: Any])
        XCTAssertEqual(actionBinding["pluginId"] as? String, "review")
        XCTAssertEqual(actionBinding["promptName"] as? String, "code_review")

        let attachments = try XCTUnwrap(payload["attachments"] as? [[String: Any]])
        XCTAssertEqual(attachments.count, 2)
        XCTAssertEqual(attachments[0]["kind"] as? String, "text_selection")
        XCTAssertEqual(attachments[0]["text"] as? String, "selected text")
        XCTAssertEqual(attachments[1]["kind"] as? String, "image")
        XCTAssertEqual(attachments[1]["mimeType"] as? String, "image/png")
        XCTAssertEqual(attachments[1]["base64"] as? String, "abc123")
    }

    func testEncodePermissionAndWorkspaceResponsesIncludeExpectedFields() throws {
        let permissionJSON = try SessionProtocolClient.encode(
            response: .permissionAnswer(
                requestId: "req-1",
                timestamp: "2026-06-04T10:00:00.000Z",
                decision: .allow,
                scope: .session,
                reason: "approved"
            )
        )
        let workspaceJSON = try SessionProtocolClient.encode(
            response: .workspaceAnswer(
                requestId: "req-2",
                timestamp: "2026-06-04T10:00:01.000Z",
                workspaceId: nil,
                cancelled: true
            )
        )

        let permissionObject = try XCTUnwrap(jsonObject(permissionJSON))
        XCTAssertEqual(permissionObject["type"] as? String, "permission_answer")
        XCTAssertNil(permissionObject["sessionId"])
        let permissionPayload = try XCTUnwrap(permissionObject["payload"] as? [String: Any])
        XCTAssertEqual(permissionPayload["decision"] as? String, "allow")
        XCTAssertEqual(permissionPayload["scope"] as? String, "session")
        XCTAssertEqual(permissionPayload["reason"] as? String, "approved")

        let workspaceObject = try XCTUnwrap(jsonObject(workspaceJSON))
        XCTAssertEqual(workspaceObject["type"] as? String, "workspace_answer")
        let workspacePayload = try XCTUnwrap(workspaceObject["payload"] as? [String: Any])
        XCTAssertEqual(workspacePayload["cancelled"] as? Bool, true)
        XCTAssertNil(workspacePayload["workspaceId"])
    }

    func testDecodeAssistantDeltaProducesStreamingMessage() throws {
        let message = try SessionProtocolClient.decodeInboundMessage(
            from: """
            {
              "type": "assistant_delta",
              "sessionId": "session-1",
              "eventId": "evt-1",
              "turnId": "turn-1",
              "itemId": "item-1",
              "timestamp": "2026-06-04T10:00:00.000Z",
              "payload": {
                "text": "partial answer"
              }
            }
            """
        )

        XCTAssertEqual(
            message,
            .event(
                .assistantDelta(
                    .init(
                        sessionId: "session-1",
                        eventId: "evt-1",
                        turnId: "turn-1",
                        itemId: "item-1",
                        timestamp: "2026-06-04T10:00:00.000Z",
                        text: "partial answer"
                    )
                )
            )
        )
    }

    func testDecodeToolFinishedProducesTerminalToolState() throws {
        let message = try SessionProtocolClient.decodeInboundMessage(
            from: """
            {
              "type": "tool_finished",
              "sessionId": "session-1",
              "eventId": "evt-2",
              "turnId": "turn-1",
              "itemId": "tool-1",
              "timestamp": "2026-06-04T10:00:01.000Z",
              "payload": {
                "name": "file.write",
                "status": "completed",
                "output": "saved",
                "durationMs": 42
              }
            }
            """
        )

        XCTAssertEqual(
            message,
            .event(
                .toolFinished(
                    .init(
                        sessionId: "session-1",
                        eventId: "evt-2",
                        turnId: "turn-1",
                        itemId: "tool-1",
                        timestamp: "2026-06-04T10:00:01.000Z",
                        name: "file.write",
                        status: .completed,
                        output: "saved",
                        durationMs: 42
                    )
                )
            )
        )
    }

    func testDecodeSessionSnapshotMapsConversationMessagesToSessionBubbles() throws {
        let message = try SessionProtocolClient.decodeInboundMessage(
            from: """
            {
              "type": "session_snapshot",
              "sessionId": "session-1",
              "eventId": "evt-3",
              "timestamp": "2026-06-04T10:00:02.000Z",
              "payload": {
                "status": "running",
                "messages": [
                  {
                    "id": "user-1",
                    "role": "user",
                    "text": "Look at this\\n\\n[选区]\\nfunc test() {}",
                    "status": "completed",
                    "createdAt": "2026-06-04T09:59:59.000Z",
                    "updatedAt": "2026-06-04T09:59:59.000Z"
                  },
                  {
                    "id": "assistant-1",
                    "role": "assistant",
                    "text": "working",
                    "status": "streaming",
                    "createdAt": "2026-06-04T10:00:00.000Z",
                    "updatedAt": "2026-06-04T10:00:02.000Z"
                  }
                ]
              }
            }
            """
        )

        XCTAssertEqual(
            message,
            .event(
                .sessionSnapshot(
                    .init(
                        sessionId: "session-1",
                        eventId: "evt-3",
                        commandId: nil,
                        timestamp: "2026-06-04T10:00:02.000Z",
                        messages: [
                            SessionBubble(
                                id: "user-1",
                                role: "user",
                                text: "Look at this",
                                attachments: [
                                    SessionAttachmentSummary(
                                        id: "persisted-text-selection-0",
                                        kind: "text_selection",
                                        title: "文本选区",
                                        detail: "func test() {}"
                                    ),
                                ]
                            ),
                            SessionBubble(id: "assistant-1", role: "assistant", text: "working"),
                        ],
                        status: .running
                    )
                )
            )
        )
    }

    func testDecodeSessionsListedMapsHistoryItems() throws {
        let message = try SessionProtocolClient.decodeInboundMessage(
            from: """
            {
              "type": "sessions_listed",
              "eventId": "evt-4",
              "commandId": "cmd-4",
              "timestamp": "2026-06-04T10:00:03.000Z",
              "payload": {
                "sessions": [
                  {
                    "id": "s1",
                    "title": "first",
                    "createdAt": "2026-06-04T09:00:00.000Z",
                    "updatedAt": "2026-06-04T10:00:00.000Z",
                    "messageCount": 2,
                    "workspaceId": "ws-1"
                  },
                  {
                    "id": "s2",
                    "title": null,
                    "createdAt": "2026-06-04T09:30:00.000Z",
                    "updatedAt": "2026-06-04T10:00:01.000Z",
                    "messageCount": 0,
                    "workspaceId": null
                  }
                ]
              }
            }
            """
        )

        XCTAssertEqual(
            message,
            .event(
                .sessionsListed(
                    .init(
                        eventId: "evt-4",
                        commandId: "cmd-4",
                        timestamp: "2026-06-04T10:00:03.000Z",
                        sessions: [
                            SessionListItem(
                                id: "s1",
                                title: "first",
                                updatedAt: "2026-06-04T10:00:00.000Z",
                                messageCount: 2,
                                workspaceId: "ws-1"
                            ),
                            SessionListItem(
                                id: "s2",
                                title: nil,
                                updatedAt: "2026-06-04T10:00:01.000Z",
                                messageCount: 0,
                                workspaceId: nil
                            ),
                        ]
                    )
                )
            )
        )
    }

    func testDecodePermissionAskPrettyPrintsArgumentsJSON() throws {
        let message = try SessionProtocolClient.decodeInboundMessage(
            from: """
            {
              "type": "permission_ask",
              "requestId": "req-1",
              "sessionId": "session-1",
              "timestamp": "2026-06-04T10:00:04.000Z",
              "payload": {
                "toolName": "file.write",
                "toolCallId": "tool-99",
                "arguments": {
                  "workspaceId": "default",
                  "relativePath": "notes.md"
                },
                "timeoutMs": 60000
              }
            }
            """
        )

        XCTAssertEqual(
            message,
            .request(
                .permissionAsk(
                    .init(
                        requestId: "req-1",
                        sessionId: "session-1",
                        timestamp: "2026-06-04T10:00:04.000Z",
                        toolName: "file.write",
                        toolCallId: "tool-99",
                        argumentsJSON: """
                        {
                          "relativePath" : "notes.md",
                          "workspaceId" : "default"
                        }
                        """,
                        timeoutMs: 60000
                    )
                )
            )
        )
    }

    func testDecodeWorkspaceAskMapsCandidates() throws {
        let message = try SessionProtocolClient.decodeInboundMessage(
            from: """
            {
              "type": "workspace_ask",
              "requestId": "req-2",
              "sessionId": "session-1",
              "timestamp": "2026-06-04T10:00:05.000Z",
              "payload": {
                "toolCallId": "tool-100",
                "prompt": "请选择 workspace",
                "candidates": [
                  { "id": "docs", "name": "文档", "description": "产品文档", "isDefault": false },
                  { "id": "code", "name": "代码", "description": "源码", "isDefault": true }
                ],
                "timeoutMs": 120000
              }
            }
            """
        )

        XCTAssertEqual(
            message,
            .request(
                .workspaceAsk(
                    .init(
                        requestId: "req-2",
                        sessionId: "session-1",
                        timestamp: "2026-06-04T10:00:05.000Z",
                        toolCallId: "tool-100",
                        prompt: "请选择 workspace",
                        candidates: [
                            WorkspaceAskCandidate(
                                id: "docs",
                                name: "文档",
                                description: "产品文档",
                                isDefault: false
                            ),
                            WorkspaceAskCandidate(
                                id: "code",
                                name: "代码",
                                description: "源码",
                                isDefault: true
                            ),
                        ],
                        timeoutMs: 120000
                    )
                )
            )
        )
    }

    private func jsonObject(_ json: String) -> [String: Any]? {
        guard let data = json.data(using: .utf8) else { return nil }
        return try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    }
}

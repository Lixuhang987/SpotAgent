import XCTest
@testable import HandAgentDesktop

final class ThreadProtocolClientTests: XCTestCase {
    func testEncodeThreadStartCommandIncludesExpectedFields() throws {
        let json = try ThreadProtocolClient.encode(
            command: .threadStart(
                commandId: "cmd-1",
                timestamp: "2026-06-04T10:00:00.000Z",
                workspaceId: "ws-1",
                actionBinding: ActionBindingPayload(pluginId: "review", promptName: "code_review")
            )
        )

        let object = try XCTUnwrap(jsonObject(json))
        XCTAssertEqual(object["type"] as? String, "thread.start")
        XCTAssertEqual(object["commandId"] as? String, "cmd-1")
        XCTAssertNil(object["threadId"])

        let payload = try XCTUnwrap(object["payload"] as? [String: Any])
        XCTAssertEqual(payload["workspaceId"] as? String, "ws-1")
        XCTAssertNil(payload["initialText"])
        XCTAssertNil(payload["attachments"])

        let actionBinding = try XCTUnwrap(payload["actionBinding"] as? [String: Any])
        XCTAssertEqual(actionBinding["pluginId"] as? String, "review")
        XCTAssertEqual(actionBinding["promptName"] as? String, "code_review")
    }

    func testEncodeTurnStartCommandIncludesThreadAndAttachments() throws {
        let json = try ThreadProtocolClient.encode(
            command: .turnStart(
                threadId: "thread-1",
                commandId: "turn-cmd-1",
                timestamp: "2026-06-04T10:00:01.000Z",
                text: "hello",
                attachments: [
                    .textSelection(id: "sel-1", text: "selected text"),
                    .image(id: "img-1", mimeType: "image/png", base64: "abc123"),
                ]
            )
        )

        let object = try XCTUnwrap(jsonObject(json))
        XCTAssertEqual(object["type"] as? String, "turn.start")
        XCTAssertEqual(object["threadId"] as? String, "thread-1")

        let payload = try XCTUnwrap(object["payload"] as? [String: Any])
        XCTAssertEqual(payload["text"] as? String, "hello")
        let attachments = try XCTUnwrap(payload["attachments"] as? [[String: Any]])
        XCTAssertEqual(attachments.count, 2)
        XCTAssertEqual(attachments[0]["kind"] as? String, "text_selection")
        XCTAssertEqual(attachments[0]["text"] as? String, "selected text")
        XCTAssertEqual(attachments[1]["kind"] as? String, "image")
        XCTAssertEqual(attachments[1]["mimeType"] as? String, "image/png")
        XCTAssertEqual(attachments[1]["base64"] as? String, "abc123")
    }

    func testEncodePermissionAndWorkspaceResponsesIncludeExpectedFields() throws {
        let permissionJSON = try ThreadProtocolClient.encode(
            response: .permissionAnswered(
                requestId: "req-1",
                timestamp: "2026-06-04T10:00:00.000Z",
                decision: .allow,
                scope: .thread,
                reason: "approved"
            )
        )
        let workspaceJSON = try ThreadProtocolClient.encode(
            response: .workspaceAnswered(
                requestId: "req-2",
                timestamp: "2026-06-04T10:00:01.000Z",
                workspaceId: nil,
                cancelled: true
            )
        )

        let permissionObject = try XCTUnwrap(jsonObject(permissionJSON))
        XCTAssertEqual(permissionObject["type"] as? String, "permission.answered")
        XCTAssertNil(permissionObject["threadId"])
        let permissionPayload = try XCTUnwrap(permissionObject["payload"] as? [String: Any])
        XCTAssertEqual(permissionPayload["decision"] as? String, "allow")
        XCTAssertEqual(permissionPayload["scope"] as? String, "thread")
        XCTAssertEqual(permissionPayload["reason"] as? String, "approved")

        let workspaceObject = try XCTUnwrap(jsonObject(workspaceJSON))
        XCTAssertEqual(workspaceObject["type"] as? String, "workspace.answered")
        let workspacePayload = try XCTUnwrap(workspaceObject["payload"] as? [String: Any])
        XCTAssertEqual(workspacePayload["cancelled"] as? Bool, true)
        XCTAssertNil(workspacePayload["workspaceId"])
    }

    func testDecodeAssistantDeltaProducesStreamingNotification() throws {
        let message = try ThreadProtocolClient.decodeInboundMessage(
            from: """
            {
              "type": "assistant.delta",
              "threadId": "thread-1",
              "notificationId": "ntf-1",
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
            .notification(
                .assistantDelta(
                    .init(
                        threadId: "thread-1",
                        notificationId: "ntf-1",
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
        let message = try ThreadProtocolClient.decodeInboundMessage(
            from: """
            {
              "type": "tool.finished",
              "threadId": "thread-1",
              "notificationId": "ntf-2",
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
            .notification(
                .toolFinished(
                    .init(
                        threadId: "thread-1",
                        notificationId: "ntf-2",
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

    func testDecodeThreadSnapshotMapsConversationMessagesToThreadBubbles() throws {
        let message = try ThreadProtocolClient.decodeInboundMessage(
            from: """
            {
              "type": "thread.snapshot",
              "threadId": "thread-1",
              "notificationId": "ntf-3",
              "timestamp": "2026-06-04T10:00:02.000Z",
              "payload": {
                "status": "running",
                "messages": [
                  {
                    "id": "user-1",
                    "role": "user",
                    "text": "Look at this\\n\\n[选区]\\nfunc test() {}"
                  },
                  {
                    "id": "assistant-1",
                    "role": "assistant",
                    "text": "working"
                  }
                ]
              }
            }
            """
        )

        XCTAssertEqual(
            message,
            .notification(
                .threadSnapshot(
                    .init(
                        threadId: "thread-1",
                        notificationId: "ntf-3",
                        commandId: nil,
                        timestamp: "2026-06-04T10:00:02.000Z",
                        messages: [
                            ThreadBubble(
                                id: "user-1",
                                role: "user",
                                text: "Look at this",
                                attachments: [
                                    ThreadAttachmentSummary(
                                        id: "persisted-text-selection-0",
                                        kind: "text_selection",
                                        title: "文本选区",
                                        detail: "func test() {}"
                                    ),
                                ]
                            ),
                            ThreadBubble(id: "assistant-1", role: "assistant", text: "working"),
                        ],
                        status: .running
                    )
                )
            )
        )
    }

    func testDecodeThreadListedMapsHistoryItems() throws {
        let message = try ThreadProtocolClient.decodeInboundMessage(
            from: """
            {
              "type": "thread.listed",
              "notificationId": "ntf-4",
              "commandId": "cmd-4",
              "timestamp": "2026-06-04T10:00:03.000Z",
              "payload": {
                "threads": [
                  {
                    "id": "t1",
                    "preview": "first",
                    "createdAt": "2026-06-04T09:00:00.000Z",
                    "updatedAt": "2026-06-04T10:00:00.000Z",
                    "messageCount": 2,
                    "workspaceId": "ws-1"
                  },
                  {
                    "id": "t2",
                    "preview": null,
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
            .notification(
                .threadListed(
                    .init(
                        notificationId: "ntf-4",
                        commandId: "cmd-4",
                        timestamp: "2026-06-04T10:00:03.000Z",
                        threads: [
                            ThreadListItem(
                                id: "t1",
                                title: "first",
                                updatedAt: "2026-06-04T10:00:00.000Z",
                                messageCount: 2,
                                workspaceId: "ws-1"
                            ),
                            ThreadListItem(
                                id: "t2",
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

    func testDecodePermissionRequestedPrettyPrintsArgumentsJSON() throws {
        let message = try ThreadProtocolClient.decodeInboundMessage(
            from: """
            {
              "type": "permission.requested",
              "requestId": "req-1",
              "threadId": "thread-1",
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
                .permissionRequested(
                    .init(
                        requestId: "req-1",
                        threadId: "thread-1",
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

    func testDecodeWorkspaceRequestedMapsCandidates() throws {
        let message = try ThreadProtocolClient.decodeInboundMessage(
            from: """
            {
              "type": "workspace.requested",
              "requestId": "req-2",
              "threadId": "thread-1",
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
                .workspaceRequested(
                    .init(
                        requestId: "req-2",
                        threadId: "thread-1",
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

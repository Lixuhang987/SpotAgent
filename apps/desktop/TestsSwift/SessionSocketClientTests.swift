import XCTest
@testable import HandAgentDesktop

final class SessionSocketClientTests: XCTestCase {
    func testExtractPermissionArgumentsJSONReturnsPrettyPayload() {
        let raw = """
        {
          "type": "permission_request",
          "sessionId": "s1",
          "messageId": "m1",
          "timestamp": "2026-05-18T00:00:00.000Z",
          "payload": {
            "requestId": "r1",
            "toolName": "file.write",
            "toolCallId": "tc-1",
            "arguments": { "workspaceId": "default", "relativePath": "notes.md" }
          }
        }
        """
        let data = Data(raw.utf8)
        let json = SessionSocketClient.extractPermissionArgumentsJSON(from: data)

        XCTAssertTrue(json.contains("\"workspaceId\""))
        XCTAssertTrue(json.contains("\"default\""))
        XCTAssertTrue(json.contains("\"relativePath\""))
        XCTAssertTrue(json.contains("\"notes.md\""))
    }

    func testExtractPermissionArgumentsJSONFallsBackToEmptyObject() {
        let raw = """
        {"type":"permission_request","sessionId":"s","messageId":"m","timestamp":"t","payload":{}}
        """
        let json = SessionSocketClient.extractPermissionArgumentsJSON(from: Data(raw.utf8))
        XCTAssertEqual(json, "{}")
    }
}

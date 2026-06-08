import XCTest
@testable import HandAgentDesktop

@MainActor
final class ElectronShellProtocolTests: XCTestCase {
    func testEncodesOpenInitialPromptCommand() throws {
        let payload = ElectronInitialPromptPayload(
            clientRequestId: "prompt-1",
            text: "hello",
            attachments: [],
            actionBinding: nil
        )
        let command = ElectronShellCommand.openInitialPrompt(commandId: "cmd-1", payload: payload)

        let data = try JSONEncoder().encode(command)
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])

        XCTAssertEqual(object["channel"] as? String, "electron_shell")
        XCTAssertEqual(object["type"] as? String, "thread_window.open_initial_prompt")
        XCTAssertEqual(object["commandId"] as? String, "cmd-1")
        let encodedPayload = try XCTUnwrap(object["payload"] as? [String: Any])
        XCTAssertEqual(encodedPayload["text"] as? String, "hello")
        XCTAssertTrue(encodedPayload["attachments"] is [Any])
        XCTAssertTrue(encodedPayload["actionBinding"] is NSNull)
    }

    func testDecodesAgentServerHealthEvent() throws {
        let data = """
        {"channel":"electron_shell","type":"agent_server.health","available":true}
        """.data(using: .utf8)!

        let event = try JSONDecoder().decode(ElectronShellEvent.self, from: data)

        guard case .agentServerHealth(let available, let message) = event else {
            return XCTFail("expected agent server health event")
        }
        XCTAssertTrue(available)
        XCTAssertNil(message)
    }

    func testDecodesRendererCrashedWindowEnum() throws {
        let data = """
        {"channel":"electron_shell","type":"renderer.crashed","window":"thread","reason":"gone"}
        """.data(using: .utf8)!

        let event = try JSONDecoder().decode(ElectronShellEvent.self, from: data)

        XCTAssertEqual(event, .rendererCrashed(window: .thread, reason: "gone"))
    }

    func testDecodesThreadWindowPrepareFailedEvent() throws {
        let data = """
        {"channel":"electron_shell","type":"thread_window.prepare_failed","message":"load failed"}
        """.data(using: .utf8)!

        let event = try JSONDecoder().decode(ElectronShellEvent.self, from: data)

        XCTAssertEqual(event, .threadWindowPrepareFailed(message: "load failed"))
    }

    func testRejectsUnknownRendererCrashedWindow() {
        let data = """
        {"channel":"electron_shell","type":"renderer.crashed","window":"settings","reason":"gone"}
        """.data(using: .utf8)!

        XCTAssertThrowsError(try JSONDecoder().decode(ElectronShellEvent.self, from: data))
    }
}

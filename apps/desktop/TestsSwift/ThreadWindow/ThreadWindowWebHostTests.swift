import XCTest
@testable import HandAgentDesktop

@MainActor
final class ThreadWindowWebHostTests: XCTestCase {
    func testConfigurationScriptExposesThreadAndPlatformURLs() throws {
        let host = ThreadWindowWebHost(
            threadWebSocketURL: URL(string: "ws://127.0.0.1:4317/api/thread")!,
            webAppURL: URL(fileURLWithPath: "/tmp/index.html")
        )

        let script = host.configurationScript

        XCTAssertTrue(script.contains("window.__HANDAGENT_CONFIG__"))
        XCTAssertTrue(script.contains(#""threadWebSocketURL":"ws:\/\/127.0.0.1:4317\/api\/thread""#))
    }

    func testInitialPromptsQueueAndDrainInOrder() throws {
        let host = ThreadWindowWebHost(
            threadWebSocketURL: URL(string: "ws://127.0.0.1:4317/api/thread")!,
            webAppURL: URL(fileURLWithPath: "/tmp/index.html")
        )
        let first = try XCTUnwrap(PromptSubmission.compose(draft: "first", attachments: []))
        let second = try XCTUnwrap(PromptSubmission.compose(draft: "second", attachments: []))

        host.enqueue(initialPrompt: first)
        host.enqueue(initialPrompt: second)

        XCTAssertEqual(host.pendingInitialPromptCount, 2)
        XCTAssertEqual(host.drainInitialPrompts().map(\.text), ["first", "second"])
        XCTAssertEqual(host.pendingInitialPromptCount, 0)
        XCTAssertTrue(host.drainInitialPrompts().isEmpty)
    }

    func testInitialPromptPayloadIncludesAttachmentsAndActionBinding() throws {
        let host = ThreadWindowWebHost(
            threadWebSocketURL: URL(string: "ws://127.0.0.1:4317/api/thread")!,
            webAppURL: URL(fileURLWithPath: "/tmp/index.html")
        )
        let prompt = try XCTUnwrap(PromptSubmission.compose(
            draft: "hello",
            attachments: [.textSelection(id: "selection-1", text: "selected")],
            actionBinding: ActionBindingPayload(pluginId: "plugin-a", promptName: "prompt-a")
        ))

        host.enqueue(initialPrompt: prompt)

        let payload = try XCTUnwrap(host.drainInitialPrompts().first)
        XCTAssertEqual(payload.text, "hello")
        XCTAssertEqual(payload.attachments, [.textSelection(id: "selection-1", text: "selected")])
        XCTAssertEqual(payload.actionBinding, ActionBindingPayload(pluginId: "plugin-a", promptName: "prompt-a"))
    }
}

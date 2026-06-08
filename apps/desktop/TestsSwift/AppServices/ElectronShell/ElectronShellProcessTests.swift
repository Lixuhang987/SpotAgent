import XCTest
@testable import HandAgentDesktop

@MainActor
final class ElectronShellProcessTests: XCTestCase {
    func testDecodesSplitElectronOutputLines() throws {
        let decoder = ElectronShellOutputDecoder()
        var events: [ElectronShellEvent] = []
        decoder.onEvent = { events.append($0) }

        decoder.receive(#"{"channel":"electron_shell","type":"electron.ready""#.data(using: .utf8)!)
        decoder.receive(#","timestamp":"2026-06-08T00:00:00.000Z"}"#.data(using: .utf8)!)
        XCTAssertEqual(events, [])

        decoder.receive("\n".data(using: .utf8)!)
        XCTAssertEqual(events, [.electronReady(timestamp: "2026-06-08T00:00:00.000Z")])
    }

    func testDecodesMultipleOutputLinesInOneChunk() throws {
        let decoder = ElectronShellOutputDecoder()
        var events: [ElectronShellEvent] = []
        decoder.onEvent = { events.append($0) }

        decoder.receive(
            """
            {"channel":"electron_shell","type":"thread_window.prepared","timestamp":"2026-06-08T00:00:01.000Z"}
            {"channel":"electron_shell","type":"agent_server.health","available":true}

            """.data(using: .utf8)!
        )

        XCTAssertEqual(
            events,
            [
                .threadWindowPrepared(timestamp: "2026-06-08T00:00:01.000Z"),
                .agentServerHealth(available: true, message: nil)
            ]
        )
    }
}

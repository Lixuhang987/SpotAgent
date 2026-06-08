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

    func testStopClosesStdinBeforeForcingTermination() throws {
        let temporaryDirectory = URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: temporaryDirectory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: temporaryDirectory) }

        let markerURL = temporaryDirectory.appendingPathComponent("stop-marker.txt")
        let shell = ElectronShellProcess(
            launchPath: "/bin/sh",
            arguments: [
                "-c",
                """
                trap 'printf term > "$1"; exit 0' TERM
                while IFS= read -r line; do :; done
                printf eof > "$1"
                """,
                "handagent-electron-shell-stop-test",
                markerURL.path,
            ],
            environment: [:]
        )

        try shell.start()
        shell.stop()

        let deadline = Date().addingTimeInterval(1)
        while Date() < deadline && !FileManager.default.fileExists(atPath: markerURL.path) {
            Thread.sleep(forTimeInterval: 0.01)
        }

        let marker = try String(contentsOf: markerURL, encoding: .utf8)
        XCTAssertEqual(marker, "eof")
    }
}

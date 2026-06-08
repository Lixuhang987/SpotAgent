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

    func testStartDoesNotKeepChildStdinPipeOpen() throws {
        let temporaryDirectory = URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: temporaryDirectory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: temporaryDirectory) }

        let markerURL = temporaryDirectory.appendingPathComponent("stdin-marker.txt")
        let shell = ElectronShellProcess(
            launchPath: "/bin/sh",
            arguments: [
                "-c",
                """
                if IFS= read -r line; then
                  printf blocked > "$1"
                else
                  printf eof > "$1"
                fi
                sleep 5
                """,
                "handagent-electron-shell-stdin-test",
                markerURL.path,
            ],
            environment: [:]
        )

        try shell.start()
        defer { shell.stop() }

        let deadline = Date().addingTimeInterval(1)
        while Date() < deadline && !FileManager.default.fileExists(atPath: markerURL.path) {
            Thread.sleep(forTimeInterval: 0.01)
        }

        let marker = try String(contentsOf: markerURL, encoding: .utf8)
        XCTAssertEqual(marker, "eof")
    }

    func testForwardsChildStderrToHostStderrAndKeepsStdoutEventsDecodable() async throws {
        let temporaryDirectory = URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: temporaryDirectory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: temporaryDirectory) }

        let capturedStderrURL = temporaryDirectory.appendingPathComponent("captured-stderr.log")
        let capturedStderrDescriptor = open(capturedStderrURL.path, O_WRONLY | O_CREAT | O_TRUNC, 0o600)
        XCTAssertGreaterThanOrEqual(capturedStderrDescriptor, 0)
        let originalStderrDescriptor = dup(STDERR_FILENO)
        XCTAssertGreaterThanOrEqual(originalStderrDescriptor, 0)
        fflush(stderr)
        XCTAssertEqual(dup2(capturedStderrDescriptor, STDERR_FILENO), STDERR_FILENO)
        close(capturedStderrDescriptor)
        defer {
            fflush(stderr)
            dup2(originalStderrDescriptor, STDERR_FILENO)
            close(originalStderrDescriptor)
        }

        let shell = ElectronShellProcess(
            launchPath: "/bin/sh",
            arguments: [
                "-c",
                """
                printf '[electron-shell] agent-server supervisor: {"mode":"node_child","coreRuntimeHost":"agent-server","utilityProcessBlocker":"missing built JS entry"}\\n' >&2
                printf '{"channel":"electron_shell","type":"electron.ready","timestamp":"2026-06-09T00:00:00.000Z"}\\n'
                sleep 0.1
                """,
            ],
            environment: [:]
        )

        let eventExpectation = expectation(description: "electron ready event decoded from stdout")
        var events: [ElectronShellEvent] = []
        shell.onEvent = { event in
            events.append(event)
            eventExpectation.fulfill()
        }

        try shell.start()
        defer { shell.stop() }

        await fulfillment(of: [eventExpectation], timeout: 2)
        XCTAssertEqual(events, [.electronReady(timestamp: "2026-06-09T00:00:00.000Z")])

        let stderrDeadline = Date().addingTimeInterval(1)
        var capturedStderr = ""
        while Date() < stderrDeadline {
            fflush(stderr)
            capturedStderr = (try? String(contentsOf: capturedStderrURL, encoding: .utf8)) ?? ""
            if capturedStderr.contains("agent-server supervisor") {
                break
            }
            try await Task.sleep(nanoseconds: 10_000_000)
        }

        XCTAssertTrue(capturedStderr.contains("agent-server supervisor"))
        XCTAssertTrue(capturedStderr.contains(#""coreRuntimeHost":"agent-server""#))
        XCTAssertTrue(capturedStderr.contains(#""utilityProcessBlocker":"missing built JS entry""#))
        XCTAssertFalse(capturedStderr.contains(#""type":"electron.ready""#))
    }

    func testSendWritesCommandsToElectronCommandSocket() throws {
        let temporaryDirectory = URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: temporaryDirectory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: temporaryDirectory) }

        let markerURL = temporaryDirectory.appendingPathComponent("command-marker.txt")
        let scriptURL = temporaryDirectory.appendingPathComponent("command-server.js")
        let script = """
        const fs = require('node:fs');
        const net = require('node:net');
        const marker = process.argv[2];
        const socketPath = process.env.HANDAGENT_ELECTRON_COMMAND_SOCKET;
        if (!socketPath) {
          fs.writeFileSync(marker, 'missing-socket-env');
          process.exit(1);
        }
        try { fs.unlinkSync(socketPath); } catch {}
        const server = net.createServer((socket) => {
          socket.on('data', (chunk) => fs.writeFileSync(marker, chunk.toString('utf8')));
        });
        server.listen(socketPath, () => fs.writeFileSync(marker + '.ready', 'ready'));
        setTimeout(() => {}, 5000);
        """
        try script.write(to: scriptURL, atomically: true, encoding: .utf8)
        let shell = ElectronShellProcess(
            launchPath: "/usr/bin/env",
            arguments: ["node", scriptURL.path, markerURL.path],
            environment: ProcessInfo.processInfo.environment
        )

        try shell.start()
        defer { shell.stop() }

        let readyURL = URL(fileURLWithPath: markerURL.path + ".ready")
        let readyDeadline = Date().addingTimeInterval(2)
        while Date() < readyDeadline && !FileManager.default.fileExists(atPath: readyURL.path) {
            Thread.sleep(forTimeInterval: 0.01)
        }
        XCTAssertTrue(FileManager.default.fileExists(atPath: readyURL.path))

        try shell.send(.shutdown(commandId: "cmd-shutdown"))

        let commandDeadline = Date().addingTimeInterval(1)
        while Date() < commandDeadline {
            if
                let command = try? String(contentsOf: markerURL, encoding: .utf8),
                command.contains(#""type":"shutdown""#)
            {
                XCTAssertTrue(command.hasSuffix("\n"))
                return
            }
            Thread.sleep(forTimeInterval: 0.01)
        }

        XCTFail("ElectronShellProcess did not write the command to the command socket")
    }
}

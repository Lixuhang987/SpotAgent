import Foundation

@MainActor
protocol ElectronShellProcessing: AnyObject {
    var onEvent: ((ElectronShellEvent) -> Void)? { get set }
    var onTermination: ((String) -> Void)? { get set }

    func start() throws
    func send(_ command: ElectronShellCommand) throws
    func stop()
}

@MainActor
final class ElectronShellProcess: ElectronShellProcessing {
    var onEvent: ((ElectronShellEvent) -> Void)?
    var onTermination: ((String) -> Void)?

    private let launchPath: String
    private let arguments: [String]
    private let environment: [String: String]
    private let encoder = JSONEncoder()
    private let outputDecoder = ElectronShellOutputDecoder()
    private var process: Process?
    private var stdinPipe: Pipe?
    private var stdoutPipe: Pipe?
    private var stderrPipe: Pipe?

    init(
        launchPath: String,
        arguments: [String],
        environment: [String: String]
    ) {
        self.launchPath = launchPath
        self.arguments = arguments
        self.environment = environment
    }

    func start() throws {
        guard process == nil else { return }

        let process = Process()
        let input = Pipe()
        let output = Pipe()
        let errorOutput = Pipe()

        process.executableURL = URL(fileURLWithPath: launchPath)
        process.arguments = arguments
        process.environment = environment
        process.standardInput = input
        process.standardOutput = output
        process.standardError = errorOutput
        process.terminationHandler = { [weak self] process in
            Task { @MainActor in
                self?.handleTermination(process)
            }
        }

        output.fileHandleForReading.readabilityHandler = { [weak self, weak process] handle in
            let data = handle.availableData
            guard !data.isEmpty else {
                Task { @MainActor in
                    self?.clearStdoutHandlerIfCurrent(process)
                }
                return
            }
            Task { @MainActor in
                guard let process else { return }
                self?.handleOutput(data, from: process)
            }
        }
        errorOutput.fileHandleForReading.readabilityHandler = { [weak self, weak process] handle in
            let data = handle.availableData
            guard !data.isEmpty else {
                Task { @MainActor in
                    self?.clearStderrHandlerIfCurrent(process)
                }
                return
            }
        }

        try process.run()
        self.process = process
        stdinPipe = input
        stdoutPipe = output
        stderrPipe = errorOutput
    }

    func send(_ command: ElectronShellCommand) throws {
        guard process?.isRunning == true, let stdinPipe else {
            throw ElectronShellProcessError.notRunning
        }
        var data = try encoder.encode(command)
        data.append(0x0A)
        stdinPipe.fileHandleForWriting.write(data)
    }

    func stop() {
        stdoutPipe?.fileHandleForReading.readabilityHandler = nil
        stderrPipe?.fileHandleForReading.readabilityHandler = nil
        process?.terminationHandler = nil
        if process?.isRunning == true {
            process?.terminate()
        }
        process = nil
        stdinPipe = nil
        stdoutPipe = nil
        stderrPipe = nil
    }

    private func handleOutput(_ data: Data, from sourceProcess: Process) {
        guard process === sourceProcess else { return }
        outputDecoder.onEvent = onEvent
        outputDecoder.receive(data)
    }

    private func handleTermination(_ terminatedProcess: Process) {
        guard process === terminatedProcess else { return }
        stdoutPipe?.fileHandleForReading.readabilityHandler = nil
        stderrPipe?.fileHandleForReading.readabilityHandler = nil
        let status = terminatedProcess.terminationStatus
        process = nil
        stdinPipe = nil
        stdoutPipe = nil
        stderrPipe = nil
        onTermination?("Electron shell exited with status \(status)")
    }

    private func clearStdoutHandlerIfCurrent(_ sourceProcess: Process?) {
        guard let sourceProcess, process === sourceProcess else { return }
        stdoutPipe?.fileHandleForReading.readabilityHandler = nil
    }

    private func clearStderrHandlerIfCurrent(_ sourceProcess: Process?) {
        guard let sourceProcess, process === sourceProcess else { return }
        stderrPipe?.fileHandleForReading.readabilityHandler = nil
    }
}

enum ElectronShellProcessError: Error {
    case notRunning
}

@MainActor
final class ElectronShellOutputDecoder {
    var onEvent: ((ElectronShellEvent) -> Void)?

    private let decoder = JSONDecoder()
    private var buffer = ""

    func receive(_ data: Data) {
        guard let chunk = String(data: data, encoding: .utf8) else { return }
        buffer += chunk

        while let newlineIndex = buffer.firstIndex(of: "\n") {
            let line = String(buffer[..<newlineIndex])
                .trimmingCharacters(in: .whitespacesAndNewlines)
            buffer = String(buffer[buffer.index(after: newlineIndex)...])

            guard
                !line.isEmpty,
                let lineData = line.data(using: .utf8),
                let event = try? decoder.decode(ElectronShellEvent.self, from: lineData)
            else {
                continue
            }
            onEvent?(event)
        }
    }
}

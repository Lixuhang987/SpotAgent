import Darwin
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
    private let currentDirectoryURL: URL?
    private let encoder = JSONEncoder()
    private let outputDecoder = ElectronShellOutputDecoder()
    private var process: Process?
    private var stdinNullDevice: FileHandle?
    private var stdoutPipe: Pipe?
    private var stderrPipe: Pipe?
    private var commandSocketPath: String?
    private var isStopping = false
    private var forcedTerminationTask: Task<Void, Never>?

    init(
        launchPath: String,
        arguments: [String],
        environment: [String: String],
        currentDirectoryURL: URL? = nil
    ) {
        self.launchPath = launchPath
        self.arguments = arguments
        self.environment = environment
        self.currentDirectoryURL = currentDirectoryURL
    }

    func start() throws {
        guard process == nil else { return }

        forcedTerminationTask?.cancel()
        forcedTerminationTask = nil
        isStopping = false

        let process = Process()
        let output = Pipe()
        let errorOutput = Pipe()
        let nullInput = FileHandle(forReadingAtPath: "/dev/null")
        let commandSocketPath = makeCommandSocketPath()
        var launchEnvironment = environment
        launchEnvironment["HANDAGENT_ELECTRON_COMMAND_SOCKET"] = commandSocketPath

        process.executableURL = URL(fileURLWithPath: launchPath)
        process.arguments = arguments
        process.environment = launchEnvironment
        process.currentDirectoryURL = currentDirectoryURL
        process.standardInput = nullInput
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
        stdinNullDevice = nullInput
        stdoutPipe = output
        stderrPipe = errorOutput
        self.commandSocketPath = commandSocketPath
    }

    func send(_ command: ElectronShellCommand) throws {
        guard process?.isRunning == true, let commandSocketPath else {
            throw ElectronShellProcessError.notRunning
        }
        var data = try encoder.encode(command)
        data.append(0x0A)
        try ElectronCommandSocketWriter(socketPath: commandSocketPath).send(data)
    }

    func stop() {
        guard let process else {
            cleanupCommandSocket()
            try? stdinNullDevice?.close()
            stdinNullDevice = nil
            stdoutPipe = nil
            stderrPipe = nil
            return
        }

        isStopping = true
        stdoutPipe?.fileHandleForReading.readabilityHandler = nil
        stderrPipe?.fileHandleForReading.readabilityHandler = nil
        try? stdinNullDevice?.close()
        stdinNullDevice = nil
        forcedTerminationTask?.cancel()
        forcedTerminationTask = Task { @MainActor [weak self, weak process] in
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            guard
                let self,
                let process,
                self.process === process,
                process.isRunning
            else { return }
            process.terminate()
        }
    }

    private func handleOutput(_ data: Data, from sourceProcess: Process) {
        guard process === sourceProcess else { return }
        outputDecoder.onEvent = onEvent
        outputDecoder.receive(data)
    }

    private func handleTermination(_ terminatedProcess: Process) {
        guard process === terminatedProcess else { return }
        let wasStopping = isStopping
        isStopping = false
        forcedTerminationTask?.cancel()
        forcedTerminationTask = nil
        stdoutPipe?.fileHandleForReading.readabilityHandler = nil
        stderrPipe?.fileHandleForReading.readabilityHandler = nil
        try? stdinNullDevice?.close()
        let status = terminatedProcess.terminationStatus
        process = nil
        stdinNullDevice = nil
        stdoutPipe = nil
        stderrPipe = nil
        cleanupCommandSocket()
        guard !wasStopping else { return }
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

    private func makeCommandSocketPath() -> String {
        URL(fileURLWithPath: "/tmp", isDirectory: true)
            .appendingPathComponent("hae-\(UUID().uuidString).sock")
            .path
    }

    private func cleanupCommandSocket() {
        guard let commandSocketPath else { return }
        try? FileManager.default.removeItem(atPath: commandSocketPath)
        self.commandSocketPath = nil
    }
}

enum ElectronShellProcessError: Error {
    case notRunning
    case commandSocketPathTooLong
    case commandSocketConnectFailed(Int32)
    case commandSocketWriteFailed(Int32)
}

private struct ElectronCommandSocketWriter {
    let socketPath: String

    func send(_ data: Data) throws {
        let descriptor = socket(AF_UNIX, SOCK_STREAM, 0)
        guard descriptor >= 0 else {
            throw ElectronShellProcessError.commandSocketConnectFailed(errno)
        }
        defer { close(descriptor) }

        var address = sockaddr_un()
        address.sun_len = UInt8(MemoryLayout<sockaddr_un>.size)
        address.sun_family = sa_family_t(AF_UNIX)
        let pathBytes = Array(socketPath.utf8CString)
        let maxPathLength = MemoryLayout.size(ofValue: address.sun_path)
        guard pathBytes.count <= maxPathLength else {
            throw ElectronShellProcessError.commandSocketPathTooLong
        }
        withUnsafeMutablePointer(to: &address.sun_path) { pointer in
            pointer.withMemoryRebound(to: CChar.self, capacity: maxPathLength) { destination in
                for index in 0..<pathBytes.count {
                    destination[index] = pathBytes[index]
                }
            }
        }

        let connected = withUnsafePointer(to: &address) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                connect(descriptor, $0, socklen_t(MemoryLayout<sockaddr_un>.size))
            }
        }
        guard connected == 0 else {
            throw ElectronShellProcessError.commandSocketConnectFailed(errno)
        }

        try data.withUnsafeBytes { buffer in
            guard let baseAddress = buffer.baseAddress else { return }
            var writtenByteCount = 0
            while writtenByteCount < buffer.count {
                let written = write(
                    descriptor,
                    baseAddress.advanced(by: writtenByteCount),
                    buffer.count - writtenByteCount
                )
                guard written > 0 else {
                    throw ElectronShellProcessError.commandSocketWriteFailed(errno)
                }
                writtenByteCount += written
            }
        }
    }
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

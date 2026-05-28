import Foundation

enum AgentServerServiceError: LocalizedError {
    case repositoryRootNotFound
    case serverEntryNotFound(path: String)
    case nodeExecutableNotFound

    var errorDescription: String? {
        switch self {
        case .repositoryRootNotFound:
            return "无法定位仓库根目录，agent-server 未启动。"
        case .serverEntryNotFound(let path):
            return "找不到 agent-server 入口文件：\(path)"
        case .nodeExecutableNotFound:
            return "未找到 Node.js 可执行文件，agent-server 未启动。"
        }
    }
}

@MainActor
protocol AgentServerStarting: AnyObject {
    var lastStartupError: String? { get }
    var fatalErrorMessage: String? { get }
    var isAvailable: Bool { get }
    var onAvailabilityChange: ((Bool) -> Void)? { get set }
    var onFatalError: ((String) -> Void)? { get set }
    func start() throws
    func stop()
}

final class AgentServerService: AgentServerStarting, @unchecked Sendable {
    private let agentServerRelativePath = "apps/agent-server/src/server/server.ts"
    private let maxRestartAttempts = 5

    private(set) var process: Process?
    private(set) var lastStartupError: String?
    private(set) var fatalErrorMessage: String?
    private(set) var isAvailable = false
    private(set) var restartAttempts = 0

    var onAvailabilityChange: ((Bool) -> Void)?
    var onFatalError: ((String) -> Void)?

    private var outputPipe: Pipe?
    private var stdinPipe: Pipe?
    private var userRequestedStop = false
    private var pendingRestart: DispatchWorkItem?

    func start() throws {
        userRequestedStop = false
        restartAttempts = 0
        fatalErrorMessage = nil
        try launchProcess()
    }

    func stop() {
        userRequestedStop = true
        pendingRestart?.cancel()
        pendingRestart = nil
        outputPipe?.fileHandleForReading.readabilityHandler = nil
        outputPipe = nil
        stdinPipe = nil
        process?.terminationHandler = nil
        process?.terminate()
        process = nil
        lastStartupError = nil
        updateAvailability(false)
    }

    private func launchProcess() throws {
        guard process == nil else { return }
        lastStartupError = nil

        guard let repoRoot = locateRepositoryRoot() else {
            throw AgentServerServiceError.repositoryRootNotFound
        }

        let serverURL = repoRoot.appendingPathComponent(agentServerRelativePath)
        guard FileManager.default.fileExists(atPath: serverURL.path) else {
            throw AgentServerServiceError.serverEntryNotFound(path: serverURL.path)
        }

        let process = Process()
        process.currentDirectoryURL = repoRoot
        process.environment = makeEnvironment(repoRoot: repoRoot)

        let nodeArguments = [
            "--experimental-transform-types",
            "--experimental-specifier-resolution=node",
            serverURL.path
        ]

        guard let nodeExecutable = locateNodeExecutable() else {
            throw AgentServerServiceError.nodeExecutableNotFound
        }
        process.executableURL = URL(fileURLWithPath: nodeExecutable)
        process.arguments = nodeArguments

        let pipe = Pipe()
        pipe.fileHandleForReading.readabilityHandler = { handle in
            if handle.availableData.isEmpty {
                handle.readabilityHandler = nil
            }
        }
        process.standardOutput = pipe
        process.standardError = pipe

        let stdinPipe = Pipe()
        process.standardInput = stdinPipe

        process.terminationHandler = { terminated in
            let exitCode = terminated.terminationStatus
            DispatchQueue.main.async { [weak self] in
                self?.handleTermination(exitCode: exitCode)
            }
        }

        do {
            try process.run()
            self.process = process
            self.stdinPipe = stdinPipe
            outputPipe = pipe
            updateAvailability(true)
        } catch {
            pipe.fileHandleForReading.readabilityHandler = nil
            lastStartupError = error.localizedDescription
            throw error
        }
    }

    private func handleTermination(exitCode: Int32) {
        outputPipe?.fileHandleForReading.readabilityHandler = nil
        outputPipe = nil
        stdinPipe = nil
        process = nil
        updateAvailability(false)

        if userRequestedStop || exitCode == 0 {
            return
        }

        restartAttempts += 1
        if restartAttempts > maxRestartAttempts {
            let message = "agent-server 多次崩溃（退出码 \(exitCode)）已停止重启。可在「检查日志」中排查。"
            fatalErrorMessage = message
            onFatalError?(message)
            return
        }

        let delaySeconds = min(pow(2.0, Double(restartAttempts - 1)), 30.0)
        let work = DispatchWorkItem { [weak self] in
            guard let self else { return }
            do {
                try self.launchProcess()
            } catch {
                self.lastStartupError = error.localizedDescription
                self.handleTermination(exitCode: -1)
            }
        }
        pendingRestart = work
        DispatchQueue.main.asyncAfter(deadline: .now() + delaySeconds, execute: work)
    }

    private func updateAvailability(_ available: Bool) {
        guard isAvailable != available else { return }
        isAvailable = available
        onAvailabilityChange?(available)
    }

    private func makeEnvironment(repoRoot: URL) -> [String: String] {
        var environment = ProcessInfo.processInfo.environment
        let separator = ":"
        let extraNodePaths = [
            repoRoot.appendingPathComponent("node_modules").path,
            repoRoot.appendingPathComponent("apps/agent-server/node_modules").path,
        ]
        let existingNodePath = environment["NODE_PATH"].flatMap { $0.isEmpty ? nil : $0 }
        environment["NODE_PATH"] = (extraNodePaths + [existingNodePath].compactMap { $0 })
            .joined(separator: separator)
        AgentServerRuntimeMode.apply(to: &environment, resourcesURL: Bundle.main.resourceURL)
        return environment
    }

    private func locateRepositoryRoot() -> URL? {
        AgentServerRepositoryRootLocator(agentServerRelativePath: agentServerRelativePath)
            .locate(
                bundleExecutableURL: Bundle.main.executableURL,
                bundleResourceURL: Bundle.main.resourceURL,
                bundleURL: Bundle.main.bundleURL,
                currentDirectoryURL: URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
            )
    }

    private func locateNodeExecutable() -> String? {
        let fileManager = FileManager.default
        let searchDirectories = (
            ProcessInfo.processInfo.environment["PATH"]?
                .split(separator: ":")
                .map(String.init) ?? []
        ) + [
            "/opt/homebrew/bin",
            "/usr/local/bin",
            "/usr/bin"
        ]

        for directory in searchDirectories {
            let candidate = URL(fileURLWithPath: directory).appendingPathComponent("node").path
            if fileManager.isExecutableFile(atPath: candidate) {
                return candidate
            }
        }

        return nil
    }
}

struct AgentServerRepositoryRootLocator {
    let agentServerRelativePath: String
    var fileExists: (String) -> Bool = { FileManager.default.fileExists(atPath: $0) }

    func locate(
        bundleExecutableURL: URL?,
        bundleResourceURL: URL?,
        bundleURL: URL?,
        currentDirectoryURL: URL
    ) -> URL? {
        let candidates: [URL] = [
            currentDirectoryURL,
            bundleExecutableURL,
            bundleResourceURL,
            bundleURL,
        ].compactMap { $0 }

        for candidate in candidates {
            if let root = findRepositoryRoot(startingAt: candidate) {
                return root
            }
        }

        return nil
    }

    func findRepositoryRoot(startingAt url: URL) -> URL? {
        var current = url.standardizedFileURL
        var visitedPaths = Set<String>()

        while true {
            let currentPath = current.path
            guard visitedPaths.insert(currentPath).inserted else {
                return nil
            }

            let packageManifest = current.appendingPathComponent("Package.swift")
            let serverPath = current.appendingPathComponent(agentServerRelativePath)

            if fileExists(packageManifest.path),
               fileExists(serverPath.path) {
                return current
            }

            if currentPath == "/" {
                return nil
            }

            let parent = current.deletingLastPathComponent()
            if parent.path == currentPath {
                return nil
            }

            current = parent
        }
    }
}

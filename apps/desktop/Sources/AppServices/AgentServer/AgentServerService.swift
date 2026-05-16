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

final class AgentServerService {
    private let agentServerRelativePath = "apps/agent-server/src/server.ts"

    private(set) var process: Process?
    private(set) var lastStartupError: String?
    private var outputPipe: Pipe?
    private var stdinPipe: Pipe?

    func start() throws {
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

        do {
            try process.run()
            self.process = process
            self.stdinPipe = stdinPipe
            outputPipe = pipe
        } catch {
            pipe.fileHandleForReading.readabilityHandler = nil
            lastStartupError = error.localizedDescription
            throw error
        }
    }

    func stop() {
        outputPipe?.fileHandleForReading.readabilityHandler = nil
        outputPipe = nil
        stdinPipe = nil
        process?.terminate()
        process = nil
        lastStartupError = nil
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
        return environment
    }

    private func locateRepositoryRoot() -> URL? {
        let fileManager = FileManager.default
        let candidates: [URL] = [
            Bundle.main.executableURL,
            Bundle.main.resourceURL,
            Bundle.main.bundleURL,
            URL(fileURLWithPath: fileManager.currentDirectoryPath)
        ].compactMap { $0 }

        for candidate in candidates {
            if let root = findRepositoryRoot(startingAt: candidate) {
                return root
            }
        }

        return nil
    }

    private func findRepositoryRoot(startingAt url: URL) -> URL? {
        let fileManager = FileManager.default
        var current = url.standardizedFileURL

        while true {
            let packageManifest = current.appendingPathComponent("Package.swift")
            let serverPath = current.appendingPathComponent(agentServerRelativePath)

            if fileManager.fileExists(atPath: packageManifest.path),
               fileManager.fileExists(atPath: serverPath.path) {
                return current
            }

            let parent = current.deletingLastPathComponent()
            if parent.path == current.path {
                return nil
            }

            current = parent
        }
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

import Foundation

struct MCPServerEntry: Identifiable, Equatable {
    let id: String
    let title: String
    let transportLabel: String
    let detail: String
}

@Observable
@MainActor
final class MCPSettingsViewModel {
    private(set) var servers: [MCPServerEntry] = []
    private(set) var saveErrorMessage: String?

    @ObservationIgnored private let fileManager: FileManager
    @ObservationIgnored private let fileURL: URL

    init(
        homeDirectoryURL: URL = FileManager.default.homeDirectoryForCurrentUser,
        fileManager: FileManager = .default
    ) {
        self.fileManager = fileManager
        self.fileURL = Self.configFileURL(homeDirectoryURL: homeDirectoryURL)
        reload()
    }

    func reload() {
        servers = loadConfig().servers.map { server in
            MCPServerEntry(
                id: server.id,
                title: server.title,
                transportLabel: server.transport.rawValue,
                detail: server.detail
            )
        }
        saveErrorMessage = nil
    }

    @discardableResult
    func createStdioServer(
        id: String,
        title: String,
        command: String,
        argsText: String,
        cwd: String,
        requestTimeoutMsText: String,
        autoAcceptEmptyForm: Bool
    ) -> Bool {
        let serverId = normalizedIdentifier(id)
        guard !serverId.isEmpty else {
            saveErrorMessage = "MCP server ID 不能为空"
            return false
        }
        let serverTitle = trimmed(title)
        let serverCommand = trimmed(command)
        guard !serverTitle.isEmpty, !serverCommand.isEmpty else {
            saveErrorMessage = "标题和 Command 不能为空"
            return false
        }
        let timeout = parseTimeout(requestTimeoutMsText)
        if timeout == nil, !trimmed(requestTimeoutMsText).isEmpty {
            saveErrorMessage = "Timeout 必须是正整数"
            return false
        }
        var config = loadConfig()
        let server = MCPServerConfigFile.Server(
            id: serverId,
            title: serverTitle,
            transport: .stdio,
            command: serverCommand,
            args: shellWords(argsText),
            cwd: optionalTrimmed(cwd),
            requestTimeoutMs: timeout,
            elicitation: autoAcceptEmptyForm ? .init(autoAcceptEmptyForm: true) : nil,
            url: nil,
            headers: nil
        )
        config.servers.removeAll { $0.id == serverId }
        config.servers.append(server)
        persist(config)
        reload()
        return saveErrorMessage == nil
    }

    @discardableResult
    func createHTTPServer(id: String, title: String, url: String, headersText: String) -> Bool {
        let serverId = normalizedIdentifier(id)
        guard !serverId.isEmpty else {
            saveErrorMessage = "MCP server ID 不能为空"
            return false
        }
        let serverTitle = trimmed(title)
        let serverURL = trimmed(url)
        guard !serverTitle.isEmpty, !serverURL.isEmpty else {
            saveErrorMessage = "标题和 URL 不能为空"
            return false
        }
        var config = loadConfig()
        let server = MCPServerConfigFile.Server(
            id: serverId,
            title: serverTitle,
            transport: .streamableHTTP,
            command: nil,
            args: nil,
            cwd: nil,
            requestTimeoutMs: nil,
            elicitation: nil,
            url: serverURL,
            headers: parseHeaders(headersText)
        )
        config.servers.removeAll { $0.id == serverId }
        config.servers.append(server)
        persist(config)
        reload()
        return saveErrorMessage == nil
    }

    func installExampleServers() {
        let config = MCPServerConfigFile(
            version: 1,
            servers: [
                MCPServerConfigFile.Server(
                    id: "filesystem",
                    title: "Filesystem",
                    transport: .stdio,
                    command: "npx",
                    args: ["--yes", "@modelcontextprotocol/server-filesystem", "/tmp/handagent-mcp-example"],
                    cwd: nil,
                    requestTimeoutMs: 60000,
                    elicitation: nil,
                    url: nil,
                    headers: nil
                ),
                MCPServerConfigFile.Server(
                    id: "computer_use",
                    title: "Computer Use",
                    transport: .stdio,
                    command: "computer-use",
                    args: [],
                    cwd: nil,
                    requestTimeoutMs: 60000,
                    elicitation: MCPServerConfigFile.Elicitation(autoAcceptEmptyForm: true),
                    url: nil,
                    headers: nil
                ),
            ]
        )
        persist(config)
        reload()
    }

    func removeServer(id: String) {
        var config = loadConfig()
        config.servers.removeAll { $0.id == id }
        persist(config)
        reload()
    }

    static func configFileURL(homeDirectoryURL: URL) -> URL {
        homeDirectoryURL
            .appendingPathComponent(".spotAgent", isDirectory: true)
            .appendingPathComponent("mcp.json")
    }

    private func loadConfig() -> MCPServerConfigFile {
        guard let data = try? Data(contentsOf: fileURL),
              let config = try? JSONDecoder().decode(MCPServerConfigFile.self, from: data) else {
            return MCPServerConfigFile(version: 1, servers: [])
        }
        return config
    }

    private func persist(_ config: MCPServerConfigFile) {
        do {
            try fileManager.createDirectory(at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            try encoder.encode(config).write(to: fileURL, options: .atomic)
            saveErrorMessage = nil
        } catch {
            saveErrorMessage = "保存 MCP 配置失败：\(error.localizedDescription)"
        }
    }
}

private struct MCPServerConfigFile: Codable, Equatable {
    var version: Int
    var servers: [Server]

    struct Server: Codable, Equatable {
        var id: String
        var title: String
        var transport: Transport
        var command: String?
        var args: [String]?
        var cwd: String?
        var requestTimeoutMs: Int?
        var elicitation: Elicitation?
        var url: String?
        var headers: [String: String]?

        var detail: String {
            switch transport {
            case .stdio:
                return ([command].compactMap { $0 } + (args ?? [])).joined(separator: " ")
            case .streamableHTTP:
                return url ?? ""
            }
        }
    }

    struct Elicitation: Codable, Equatable {
        var autoAcceptEmptyForm: Bool?
    }

    enum Transport: String, Codable, Equatable {
        case stdio
        case streamableHTTP = "streamableHttp"
    }
}

private func parseHeaders(_ text: String) -> [String: String]? {
    let headers = text
        .split(separator: "\n")
        .reduce(into: [String: String]()) { result, line in
            let parts = line.split(separator: "=", maxSplits: 1).map(String.init)
            guard parts.count == 2 else { return }
            let key = trimmed(parts[0])
            let value = trimmed(parts[1])
            if !key.isEmpty, !value.isEmpty {
                result[key] = value
            }
        }
    return headers.isEmpty ? nil : headers
}

private func shellWords(_ text: String) -> [String]? {
    let words = text
        .split(separator: " ")
        .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
        .filter { !$0.isEmpty }
    return words.isEmpty ? nil : words
}

private func parseTimeout(_ text: String) -> Int? {
    let value = trimmed(text)
    guard !value.isEmpty else { return nil }
    guard let number = Int(value), number > 0 else { return nil }
    return number
}

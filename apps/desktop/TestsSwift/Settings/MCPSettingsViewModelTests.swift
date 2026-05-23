import XCTest
@testable import HandAgentDesktop

final class MCPSettingsViewModelTests: XCTestCase {
    @MainActor
    func testLoadsStdioAndHTTPServersFromMCPConfig() throws {
        let homeURL = TestFiles.makeTemporaryHomeDirectory()
        defer { try? FileManager.default.removeItem(at: homeURL) }
        try TestFiles.writeMCPConfig(
            homeURL,
            """
            {
              "version": 1,
              "servers": [
                {
                  "id": "filesystem",
                  "title": "Filesystem",
                  "transport": "stdio",
                  "command": "npx",
                  "args": ["--yes", "@modelcontextprotocol/server-filesystem", "/tmp"],
                  "requestTimeoutMs": 60000,
                  "elicitation": { "autoAcceptEmptyForm": true }
                },
                {
                  "id": "docs",
                  "title": "Docs",
                  "transport": "streamableHttp",
                  "url": "https://example.com/mcp",
                  "headers": { "Authorization": "Bearer ${DOCS_TOKEN}" }
                }
              ]
            }
            """
        )

        let viewModel = MCPSettingsViewModel(homeDirectoryURL: homeURL)

        XCTAssertEqual(viewModel.servers.map(\.id), ["filesystem", "docs"])
        XCTAssertEqual(viewModel.servers.first?.transportLabel, "stdio")
        XCTAssertEqual(viewModel.servers.first?.detail, "npx --yes @modelcontextprotocol/server-filesystem /tmp")
        XCTAssertEqual(viewModel.servers.last?.transportLabel, "streamableHttp")
        XCTAssertEqual(viewModel.servers.last?.detail, "https://example.com/mcp")
    }

    @MainActor
    func testCreatesStdioServerConfig() throws {
        let homeURL = TestFiles.makeTemporaryHomeDirectory()
        defer { try? FileManager.default.removeItem(at: homeURL) }
        let viewModel = MCPSettingsViewModel(homeDirectoryURL: homeURL)

        viewModel.createStdioServer(
            id: "filesystem",
            title: "Filesystem",
            command: "npx",
            argsText: "--yes @modelcontextprotocol/server-filesystem /tmp",
            cwd: "",
            requestTimeoutMsText: "60000",
            autoAcceptEmptyForm: true
        )

        let json = try TestFiles.readJSON(TestFiles.mcpConfigFileURL(homeURL))
        let servers = try XCTUnwrap(json["servers"] as? [[String: Any]])
        XCTAssertEqual(servers.first?["id"] as? String, "filesystem")
        XCTAssertEqual(servers.first?["transport"] as? String, "stdio")
        XCTAssertEqual(servers.first?["args"] as? [String], ["--yes", "@modelcontextprotocol/server-filesystem", "/tmp"])
        XCTAssertEqual(servers.first?["requestTimeoutMs"] as? Int, 60000)
        XCTAssertEqual((servers.first?["elicitation"] as? [String: Any])?["autoAcceptEmptyForm"] as? Bool, true)
        XCTAssertEqual(viewModel.servers.map(\.id), ["filesystem"])
    }

    @MainActor
    func testCreateStdioServerRejectsMissingCommand() {
        let homeURL = TestFiles.makeTemporaryHomeDirectory()
        defer { try? FileManager.default.removeItem(at: homeURL) }
        let viewModel = MCPSettingsViewModel(homeDirectoryURL: homeURL)

        let didCreate = viewModel.createStdioServer(
            id: "filesystem",
            title: "Filesystem",
            command: "",
            argsText: "/tmp",
            cwd: "",
            requestTimeoutMsText: "60000",
            autoAcceptEmptyForm: false
        )

        XCTAssertFalse(didCreate)
        XCTAssertEqual(viewModel.servers, [])
        XCTAssertNotNil(viewModel.saveErrorMessage)
    }

    @MainActor
    func testCreatesHTTPServerConfigAndRemovesServer() throws {
        let homeURL = TestFiles.makeTemporaryHomeDirectory()
        defer { try? FileManager.default.removeItem(at: homeURL) }
        let viewModel = MCPSettingsViewModel(homeDirectoryURL: homeURL)

        viewModel.createHTTPServer(
            id: "docs",
            title: "Docs",
            url: "https://example.com/mcp",
            headersText: "Authorization=Bearer ${DOCS_TOKEN}\nX-Team=handagent"
        )
        viewModel.removeServer(id: "docs")

        let json = try TestFiles.readJSON(TestFiles.mcpConfigFileURL(homeURL))
        XCTAssertEqual((json["servers"] as? [[String: Any]])?.count, 0)
        XCTAssertEqual(viewModel.servers, [])
    }

    @MainActor
    func testCreateHTTPServerRejectsMissingURL() {
        let homeURL = TestFiles.makeTemporaryHomeDirectory()
        defer { try? FileManager.default.removeItem(at: homeURL) }
        let viewModel = MCPSettingsViewModel(homeDirectoryURL: homeURL)

        let didCreate = viewModel.createHTTPServer(
            id: "docs",
            title: "Docs",
            url: "",
            headersText: ""
        )

        XCTAssertFalse(didCreate)
        XCTAssertEqual(viewModel.servers, [])
        XCTAssertNotNil(viewModel.saveErrorMessage)
    }

    @MainActor
    func testInstallExampleServersCreatesFilesystemAndComputerUseConfigs() throws {
        let homeURL = TestFiles.makeTemporaryHomeDirectory()
        defer { try? FileManager.default.removeItem(at: homeURL) }
        let viewModel = MCPSettingsViewModel(homeDirectoryURL: homeURL)

        viewModel.installExampleServers()

        XCTAssertEqual(viewModel.servers.map(\.id), ["filesystem", "computer_use"])
        let json = try TestFiles.readJSON(TestFiles.mcpConfigFileURL(homeURL))
        let servers = try XCTUnwrap(json["servers"] as? [[String: Any]])
        XCTAssertEqual(servers.map { $0["transport"] as? String }, ["stdio", "stdio"])
    }
}

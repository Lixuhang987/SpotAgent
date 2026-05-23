import XCTest
@testable import HandAgentDesktop

final class PluginSettingsViewModelTests: XCTestCase {
    @MainActor
    func testLoadsPluginManifestsAndSummarizesPromptAndMCPCounts() throws {
        let homeURL = TestFiles.makeTemporaryHomeDirectory()
        defer { try? FileManager.default.removeItem(at: homeURL) }
        try TestFiles.writePlugin(
            homeURL,
            id: "review",
            json: """
            {
              "version": 1,
              "id": "review",
              "title": "Review",
              "description": "Code review helper",
              "enabled": true,
              "mcpServerIds": ["github", "filesystem"],
              "prompts": [
                {
                  "name": "code_review",
                  "kind": "plugin",
                  "trigger": "r",
                  "title": "Review Code",
                  "template": "Review {{code}}",
                  "arguments": [{ "name": "code", "required": true }]
                }
              ]
            }
            """
        )

        let viewModel = PluginSettingsViewModel(homeDirectoryURL: homeURL)

        XCTAssertEqual(viewModel.plugins.map(\.id), ["review"])
        XCTAssertEqual(viewModel.plugins.first?.title, "Review")
        XCTAssertEqual(viewModel.plugins.first?.description, "Code review helper")
        XCTAssertEqual(viewModel.plugins.first?.promptCount, 1)
        XCTAssertEqual(viewModel.plugins.first?.mcpServerIds, ["github", "filesystem"])
        XCTAssertTrue(viewModel.plugins.first?.isEnabled == true)
    }

    @MainActor
    func testDoesNotShowSkillOnlyManifestsAsPlugins() throws {
        let homeURL = TestFiles.makeTemporaryHomeDirectory()
        defer { try? FileManager.default.removeItem(at: homeURL) }
        try TestFiles.writePlugin(
            homeURL,
            id: "append-prompts",
            json: """
            {
              "version": 1,
              "id": "append-prompts",
              "title": "Append Prompts",
              "prompts": [
                {
                  "name": "summarize",
                  "kind": "skill",
                  "trigger": "sum",
                  "title": "Summarize",
                  "template": "Summarize {{text}}",
                  "arguments": [{ "name": "text", "required": true }]
                }
              ]
            }
            """
        )

        let viewModel = PluginSettingsViewModel(homeDirectoryURL: homeURL)

        XCTAssertEqual(viewModel.plugins, [])
    }

    @MainActor
    func testSetEnabledPersistsManifestEnabledFlag() throws {
        let homeURL = TestFiles.makeTemporaryHomeDirectory()
        defer { try? FileManager.default.removeItem(at: homeURL) }
        try TestFiles.writePlugin(
            homeURL,
            id: "review",
            json: """
            {
              "version": 1,
              "id": "review",
              "title": "Review",
              "enabled": true,
              "prompts": [
                {
                  "name": "code_review",
                  "trigger": "r",
                  "title": "Review Code",
                  "template": "Review code"
                }
              ]
            }
            """
        )
        let viewModel = PluginSettingsViewModel(homeDirectoryURL: homeURL)

        viewModel.setEnabled(pluginId: "review", enabled: false)

        let manifest = try PluginManifestDefinition.decode(Data(contentsOf: TestFiles.pluginsDirectoryURL(homeURL).appendingPathComponent("review/plugin.json")))
        XCTAssertEqual(manifest.enabled, false)
        XCTAssertEqual(viewModel.plugins.first?.isEnabled, false)
    }

    @MainActor
    func testCreatesPluginManifestWithOnePluginPrompt() throws {
        let homeURL = TestFiles.makeTemporaryHomeDirectory()
        defer { try? FileManager.default.removeItem(at: homeURL) }
        let viewModel = PluginSettingsViewModel(homeDirectoryURL: homeURL)

        viewModel.createPlugin(
            id: "github-review",
            title: "GitHub Review",
            description: "Review PRs with GitHub MCP",
            trigger: "gh-review",
            promptName: "review",
            promptTitle: "Review PR",
            template: "Review PR {{url}}",
            requiredArgumentName: "url",
            mcpServerIdsText: "github, filesystem"
        )

        let manifest = try PluginManifestDefinition.decode(Data(contentsOf: TestFiles.pluginsDirectoryURL(homeURL).appendingPathComponent("github-review/plugin.json")))
        XCTAssertEqual(manifest.id, "github-review")
        XCTAssertEqual(manifest.prompts.first?.actionKind, .plugin)
        XCTAssertEqual(manifest.prompts.first?.arguments?.first?.name, "url")
        XCTAssertEqual(manifest.prompts.first?.arguments?.first?.isRequired, true)
        XCTAssertEqual(manifest.mcpServerIds, ["github", "filesystem"])
        XCTAssertEqual(viewModel.plugins.map(\.id), ["github-review"])
    }

    @MainActor
    func testCreatePluginRejectsIncompletePromptFields() {
        let homeURL = TestFiles.makeTemporaryHomeDirectory()
        defer { try? FileManager.default.removeItem(at: homeURL) }
        let viewModel = PluginSettingsViewModel(homeDirectoryURL: homeURL)

        let didCreate = viewModel.createPlugin(
            id: "broken",
            title: "Broken",
            description: "",
            trigger: "",
            promptName: "review",
            promptTitle: "Review",
            template: "",
            requiredArgumentName: "path",
            mcpServerIdsText: "filesystem"
        )

        XCTAssertFalse(didCreate)
        XCTAssertEqual(viewModel.plugins, [])
        XCTAssertNotNil(viewModel.saveErrorMessage)
    }

    @MainActor
    func testInstallExamplePluginCreatesReviewPlugin() throws {
        let homeURL = TestFiles.makeTemporaryHomeDirectory()
        defer { try? FileManager.default.removeItem(at: homeURL) }
        let viewModel = PluginSettingsViewModel(homeDirectoryURL: homeURL)

        viewModel.installExamplePlugin()

        let manifest = try PluginManifestDefinition.decode(Data(contentsOf: TestFiles.pluginsDirectoryURL(homeURL).appendingPathComponent("example-review/plugin.json")))
        XCTAssertEqual(manifest.id, "example-review")
        XCTAssertEqual(manifest.prompts.first?.trigger, "review")
        XCTAssertEqual(manifest.prompts.first?.actionKind, .plugin)
        XCTAssertEqual(manifest.mcpServerIds, ["filesystem"])
    }
}

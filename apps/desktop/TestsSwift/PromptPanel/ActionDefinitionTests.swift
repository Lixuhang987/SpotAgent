import XCTest
@testable import HandAgentDesktop

final class ActionDefinitionTests: XCTestCase {
    func testParsesEnabledPluginPromptIntoActionDefinition() throws {
        let data = """
        {
          "version": 1,
          "id": "review",
          "title": "Review",
          "enabled": true,
          "mcpServerIds": ["github"],
          "prompts": [
            {
              "name": "code_review",
              "trigger": "r",
              "title": "Request Code Review",
              "description": "Review code",
              "template": "Review this code:\\n{{code}}",
              "arguments": [
                { "name": "code", "description": "The code", "required": true }
              ]
            }
          ]
        }
        """.data(using: .utf8)!

        let manifest = try PluginManifestDefinition.decode(data)
        let actions = ActionDefinition.buildActions(from: [manifest])

        XCTAssertEqual(actions.enabled.map(\.id), ["review/code_review"])
        XCTAssertEqual(actions.enabled.first?.pluginId, "review")
        XCTAssertEqual(actions.enabled.first?.promptName, "code_review")
        XCTAssertEqual(actions.enabled.first?.trigger, "r")
        XCTAssertEqual(actions.enabled.first?.mcpServerIds, ["github"])
        XCTAssertEqual(actions.enabled.first?.arguments.map(\.name), ["code"])
        XCTAssertEqual(actions.disabled, [])
    }

    func testDisablesPromptWhenTemplateReferencesUnknownArgument() throws {
        let manifest = PluginManifestDefinition(
            version: 1,
            id: "review",
            title: "Review",
            description: nil,
            enabled: true,
            mcpServerIds: [],
            prompts: [
                PluginPromptDefinition(
                    name: "bad",
                    trigger: "b",
                    title: "Bad",
                    description: nil,
                    template: "Hello {{missing}}",
                    arguments: [],
                    icons: nil
                )
            ]
        )

        let actions = ActionDefinition.buildActions(from: [manifest])

        XCTAssertEqual(actions.enabled, [])
        XCTAssertEqual(actions.disabled.map(\.id), ["review/bad"])
        XCTAssertEqual(actions.disabled.first?.reason, "template references undeclared argument: missing")
    }

    func testTriggerConflictKeepsFirstPluginByStableOrder() throws {
        let first = PluginManifestDefinition.testManifest(id: "alpha", trigger: "r")
        let second = PluginManifestDefinition.testManifest(id: "beta", trigger: "R")

        let actions = ActionDefinition.buildActions(from: [second, first])

        XCTAssertEqual(actions.enabled.map(\.pluginId), ["alpha"])
        XCTAssertEqual(actions.disabled.map(\.id), ["beta/code_review"])
        XCTAssertEqual(actions.disabled.first?.reason, "trigger conflicts with alpha/code_review")
    }
}

private extension PluginManifestDefinition {
    static func testManifest(id: String, trigger: String) -> PluginManifestDefinition {
        PluginManifestDefinition(
            version: 1,
            id: id,
            title: id,
            description: nil,
            enabled: true,
            mcpServerIds: [],
            prompts: [
                PluginPromptDefinition(
                    name: "code_review",
                    trigger: trigger,
                    title: "Review",
                    description: nil,
                    template: "{{code}}",
                    arguments: [
                        ActionArgumentDefinition(
                            name: "code",
                            description: nil,
                            required: true
                        )
                    ],
                    icons: nil
                )
            ]
        )
    }
}

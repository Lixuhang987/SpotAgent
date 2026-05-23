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
              "globalShortcut": { "key": "r", "modifiers": ["command", "shift"] },
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
        XCTAssertEqual(actions.enabled.first?.trigger, "r")
        XCTAssertEqual(actions.enabled.first?.arguments.map(\.name), ["code"])
        XCTAssertEqual(actions.enabled.first?.shortcutName.rawValue, "action.review/code_review")
        XCTAssertEqual(actions.enabled.first?.defaultShortcut, .init(.r, modifiers: [.command, .shift]))
        XCTAssertEqual(
            actions.enabled.first?.submission,
            .plugin(
                ActionPluginBinding(
                    pluginId: "review",
                    promptName: "code_review",
                    mcpServerIds: ["github"]
                )
            )
        )
        XCTAssertEqual(actions.disabled, [])
    }

    func testBuildsAppendPromptSubmissionForSkillDefinition() {
        let action = ActionDefinition.skill(
            id: "weather/current",
            trigger: "weather",
            title: "查询当前天气",
            description: "按当前上下文查询天气",
            template: "查询当前天气",
            arguments: [],
            defaultShortcut: .init(.w, modifiers: [.command, .shift])
        )

        XCTAssertEqual(action.id, "weather/current")
        XCTAssertEqual(action.trigger, "weather")
        XCTAssertEqual(action.submission, .appendPrompt)
        XCTAssertEqual(action.defaultShortcut, .init(.w, modifiers: [.command, .shift]))
    }

    func testParsesSkillPromptKindIntoAppendPromptSubmission() throws {
        let data = """
        {
          "version": 1,
          "id": "weather",
          "title": "Weather",
          "enabled": true,
          "prompts": [
            {
              "name": "current",
              "kind": "skill",
              "trigger": "weather",
              "title": "当前天气",
              "template": "查询当前天气"
            }
          ]
        }
        """.data(using: .utf8)!

        let manifest = try PluginManifestDefinition.decode(data)
        let actions = ActionDefinition.buildActions(from: [manifest])

        XCTAssertEqual(actions.enabled.map(\.id), ["weather/current"])
        XCTAssertEqual(actions.enabled.first?.submission, .appendPrompt)
        XCTAssertNil(actions.enabled.first?.pluginBinding)
        XCTAssertEqual(actions.disabled, [])
    }

    func testBuildsCommandActionForPromptPanelItem() {
        let action = ActionDefinition.command(
            id: "open-settings",
            trigger: "settings",
            title: "打开设置",
            description: "Preferences",
            keywords: ["preferences"],
            defaultShortcut: nil,
            command: .openSettings
        )

        XCTAssertEqual(action.submission, .command(.openSettings))
        XCTAssertEqual(action.keywords, ["preferences"])
        XCTAssertEqual(action.shortcutName.rawValue, "action.open-settings")
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
                    kind: nil,
                    trigger: "b",
                    title: "Bad",
                    description: nil,
                    template: "Hello {{missing}}",
                    globalShortcut: nil,
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

        XCTAssertEqual(actions.enabled.map { $0.pluginBinding?.pluginId }, ["alpha"])
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
                    kind: nil,
                    trigger: trigger,
                    title: "Review",
                    description: nil,
                    template: "{{code}}",
                    globalShortcut: nil,
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

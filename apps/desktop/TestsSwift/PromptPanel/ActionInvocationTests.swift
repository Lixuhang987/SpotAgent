import XCTest
@testable import HandAgentDesktop

final class ActionInvocationTests: XCTestCase {
    func testPlainPromptWhenTriggerDoesNotMatch() {
        let action = makeAction(trigger: "r")
        XCTAssertEqual(ActionInvocation.parse(draft: "hello world", actions: [action]), .plain("hello world"))
    }

    func testParsesBracketArgumentsAfterTrigger() throws {
        let action = makeAction(trigger: "r")
        let result = ActionInvocation.parse(
            draft: "r [code: let x = 1] [focus: race conditions]",
            actions: [action]
        )

        guard case .action(let invocation) = result else {
            return XCTFail("expected action")
        }
        XCTAssertEqual(invocation.action.id, action.id)
        XCTAssertEqual(invocation.values["code"], "let x = 1")
        XCTAssertEqual(invocation.values["focus"], "race conditions")
    }

    func testParsesEmptyBracketArgument() throws {
        let action = makeAction(trigger: "r")
        let result = ActionInvocation.parse(
            draft: "r [code: ] [focus: risk]",
            actions: [action]
        )

        guard case .action(let invocation) = result else {
            return XCTFail("expected action")
        }
        XCTAssertEqual(invocation.values["code"], "")
        XCTAssertEqual(invocation.values["focus"], "risk")
    }

    func testIgnoresPositionalArguments() throws {
        let action = makeAction(trigger: "r")
        let result = ActionInvocation.parse(draft: "r foo bar", actions: [action])

        guard case .action(let invocation) = result else {
            return XCTFail("expected action")
        }
        XCTAssertEqual(invocation.values, [:])
    }

    func testTriggerWithoutArgumentsSubmitsActionWithEmptyValues() throws {
        let action = makeWeatherAction()
        let result = ActionInvocation.parse(draft: "weather", actions: [action])

        guard case .action(let invocation) = result else {
            return XCTFail("expected action")
        }
        XCTAssertEqual(invocation.action.id, action.id)
        XCTAssertEqual(invocation.values, [:])
    }

    func testRenderingFailsWhenRequiredArgumentIsEmpty() {
        let action = makeAction(trigger: "r")
        let invocation = ParsedActionInvocation(action: action, values: ["focus": "risk"])

        XCTAssertThrowsError(try invocation.renderedPrompt()) { error in
            XCTAssertEqual(error as? ActionInvocationError, .missingRequiredArgument("code"))
        }
    }

    func testRendersTemplateWithOptionalEmptyString() throws {
        let action = makeAction(trigger: "r")
        let invocation = ParsedActionInvocation(action: action, values: ["code": "let x = 1"])

        XCTAssertEqual(
            try invocation.renderedPrompt(),
            "Review:\\nlet x = 1\\nFocus:\\n"
        )
    }
}

private func makeAction(trigger: String) -> ActionDefinition {
    ActionDefinition.plugin(
        id: "review/code_review",
        trigger: trigger,
        title: "Review",
        description: nil,
        template: "Review:\\n{{code}}\\nFocus:\\n{{focus}}",
        arguments: [
            ActionArgumentDefinition(name: "code", description: nil, required: true),
            ActionArgumentDefinition(name: "focus", description: nil, required: false),
        ],
        icons: [],
        defaultShortcut: nil,
        binding: ActionPluginBinding(
            pluginId: "review",
            promptName: "code_review",
            mcpServerIds: ["github"]
        )
    )
}

private func makeWeatherAction() -> ActionDefinition {
    ActionDefinition.skill(
        id: "weather/current",
        trigger: "weather",
        title: "天气",
        description: nil,
        template: "查询当前天气",
        arguments: [],
        defaultShortcut: nil
    )
}

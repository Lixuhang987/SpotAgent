import XCTest
@testable import HandAgentDesktop

final class ActionInvocationTests: XCTestCase {
    func testPlainPromptWhenTriggerDoesNotMatch() {
        let action = makeAction(trigger: "r")
        XCTAssertEqual(ActionInvocation.parse(draft: "hello world", actions: [action]), .plain("hello world"))
    }

    func testParsesPositionalArgumentsAfterTrigger() throws {
        let action = makeAction(trigger: "r")
        let result = ActionInvocation.parse(draft: "r foo bar", actions: [action])

        guard case .action(let invocation) = result else {
            return XCTFail("expected action")
        }
        XCTAssertEqual(invocation.action.id, action.id)
        XCTAssertEqual(invocation.values["code"], "foo")
        XCTAssertEqual(invocation.values["focus"], "bar")
    }

    func testParsesQuotedArguments() throws {
        let action = makeAction(trigger: "r")
        let result = ActionInvocation.parse(draft: #"r "hello world" "race conditions""#, actions: [action])

        guard case .action(let invocation) = result else {
            return XCTFail("expected action")
        }
        XCTAssertEqual(invocation.values["code"], "hello world")
        XCTAssertEqual(invocation.values["focus"], "race conditions")
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
    ActionDefinition(
        id: "review/code_review",
        pluginId: "review",
        promptName: "code_review",
        trigger: trigger,
        title: "Review",
        description: nil,
        template: "Review:\\n{{code}}\\nFocus:\\n{{focus}}",
        arguments: [
            ActionArgumentDefinition(name: "code", description: nil, required: true),
            ActionArgumentDefinition(name: "focus", description: nil, required: false),
        ],
        mcpServerIds: ["github"],
        icons: []
    )
}

import XCTest
@testable import HandAgentDesktop

final class PromptPanelViewModelTests: XCTestCase {
    @MainActor
    func testFilteredActionsReturnsAllWhenDraftIsEmpty() {
        let actions = makeTestActions()
        let vm = PromptPanelViewModel(actions: actions)

        XCTAssertEqual(vm.filteredActions.map(\.id), ["new-thread", "weather/current"])
    }

    @MainActor
    func testFilteredActionsFiltersByDraft() {
        let actions = makeTestActions()
        let vm = PromptPanelViewModel(actions: actions)

        vm.draft = "weather"

        XCTAssertEqual(vm.filteredActions.map(\.id), ["weather/current"])
    }

    @MainActor
    func testUpdateActionsReplacesFilteredActions() {
        let vm = PromptPanelViewModel(actions: makeTestActions())

        vm.updateActions([
            ActionDefinition.skill(
                id: "recent-thread-1",
                trigger: "history",
                title: "最近Thread：API 设计",
                description: "thread",
                template: "{{query}}",
                arguments: [
                    ActionArgumentDefinition(name: "query", description: nil, required: false)
                ],
                defaultShortcut: nil
            )
        ])

        vm.draft = "history"

        XCTAssertEqual(vm.filteredActions.map(\.id), ["recent-thread-1"])
    }

    @MainActor
    func testSubmitCallsOnSubmitWithTrimmedDraft() {
        let actions = makeTestActions()
        let vm = PromptPanelViewModel(actions: actions)
        var submitted: String?
        vm.onSubmit = { draft, _ in submitted = draft }

        vm.draft = "  hello world  "
        vm.submit()

        XCTAssertEqual(submitted, "hello world")
        XCTAssertEqual(vm.draft, "")
    }

    @MainActor
    func testSubmitIgnoresEmptyDraft() {
        let actions = makeTestActions()
        let vm = PromptPanelViewModel(actions: actions)
        var submitted: String?
        vm.onSubmit = { draft, _ in submitted = draft }

        vm.draft = "   "
        vm.submit()

        XCTAssertNil(submitted)
    }

    @MainActor
    func testSubmitIsBlockedWhenAgentServerUnavailableAndKeepsDraft() {
        let actions = makeTestActions()
        let vm = PromptPanelViewModel(actions: actions)
        var submitted: String?
        vm.onSubmit = { draft, _ in submitted = draft }

        vm.draft = "hello"
        vm.setSubmissionEnabled(false, message: "agent-server 已断开，正在尝试重连…")
        vm.submit()

        XCTAssertNil(submitted)
        XCTAssertEqual(vm.draft, "hello")
        XCTAssertEqual(vm.submissionDisabledMessage, "agent-server 已断开，正在尝试重连…")
    }

    @MainActor
    func testSubmitWorksAfterAgentServerBecomesAvailableAgain() {
        let actions = makeTestActions()
        let vm = PromptPanelViewModel(actions: actions)
        var submitted: String?
        vm.onSubmit = { draft, _ in submitted = draft }

        vm.draft = "hello"
        vm.setSubmissionEnabled(false, message: "agent-server 已断开，正在尝试重连…")
        vm.setSubmissionEnabled(true, message: nil)
        vm.submit()

        XCTAssertEqual(submitted, "hello")
        XCTAssertNil(vm.submissionDisabledMessage)
    }

    @MainActor
    func testSubmitActionInvocationRendersPromptAndForwardsBinding() {
        let action = makeReviewAction()
        let vm = PromptPanelViewModel(actions: [action])
        var submitted: (String, ActionBindingPayload)?
        vm.onSubmitAction = { prompt, binding, _ in submitted = (prompt, binding) }

        vm.draft = "r [code: let x = 1]"
        vm.submit()

        XCTAssertEqual(submitted?.0, "Review:\\nlet x = 1")
        XCTAssertEqual(submitted?.1.pluginId, "review")
        XCTAssertEqual(submitted?.1.promptName, "code_review")
    }

    @MainActor
    func testSubmitActionInvocationKeepsDraftWhenRequiredArgumentMissing() {
        let action = makeReviewAction()
        let vm = PromptPanelViewModel(actions: [action])
        var submitted = false
        vm.onSubmitAction = { _, _, _ in submitted = true }

        vm.draft = "r"
        vm.submit()

        XCTAssertFalse(submitted)
        XCTAssertEqual(vm.draft, "r")
        XCTAssertEqual(vm.submissionDisabledMessage, "缺少必填参数：code")
    }

    @MainActor
    func testSubmitSkillInvocationAppendsRenderedPromptWithoutActionBinding() {
        let action = ActionDefinition.skill(
            id: "skill/weather",
            trigger: "weather",
            title: "天气",
            description: nil,
            template: "查询当前天气",
            arguments: [],
            defaultShortcut: nil
        )
        let vm = PromptPanelViewModel(actions: [action])
        var submitted: String?
        var submittedAction = false
        vm.onSubmit = { prompt, _ in submitted = prompt }
        vm.onSubmitAction = { _, _, _ in submittedAction = true }

        vm.draft = "weather"
        vm.submit()

        XCTAssertEqual(submitted, "查询当前天气")
        XCTAssertFalse(submittedAction)
        XCTAssertEqual(vm.draft, "")
    }

    @MainActor
    func testSelectActionWritesTriggerIntoDraft() {
        let action = makeReviewAction()
        let vm = PromptPanelViewModel(actions: [action])

        vm.selectAction(action)

        XCTAssertEqual(vm.draft, "r [code: ]")
    }

    @MainActor
    func testMoveSelectedActionCyclesThroughFilteredActions() {
        let vm = PromptPanelViewModel(actions: makeTestActions())

        vm.moveSelectedAction(.next)
        XCTAssertEqual(vm.selectedActionId, "new-thread")

        vm.moveSelectedAction(.next)
        XCTAssertEqual(vm.selectedActionId, "weather/current")

        vm.moveSelectedAction(.next)
        XCTAssertEqual(vm.selectedActionId, "new-thread")

        vm.moveSelectedAction(.previous)
        XCTAssertEqual(vm.selectedActionId, "weather/current")
    }

    @MainActor
    func testMoveSelectedActionUsesCurrentFilter() {
        let vm = PromptPanelViewModel(actions: makeTestActions())

        vm.draft = "weather"
        vm.moveSelectedAction(.next)

        XCTAssertEqual(vm.selectedActionId, "weather/current")
    }

    @MainActor
    func testSelectedActionIsNilWhenFilteredOut() {
        let vm = PromptPanelViewModel(actions: makeTestActions())

        vm.moveSelectedAction(.next)
        vm.draft = "weather"

        XCTAssertNil(vm.selectedAction)
    }

    @MainActor
    func testSubmitSelectedActionSubmitsNoArgumentActionWithoutChangingDraftFirst() {
        let vm = PromptPanelViewModel(actions: makeTestActions())
        var submitted: String?
        vm.onSubmit = { prompt, _ in submitted = prompt }

        vm.moveSelectedAction(.next)
        vm.moveSelectedAction(.next)
        vm.submitSelectedAction()

        XCTAssertEqual(submitted, "查询当前天气")
        XCTAssertEqual(vm.draft, "")
    }

    @MainActor
    func testSubmitSelectedActionUsesCurrentDraftArgumentsWhenDraftTargetsSelection() {
        let action = makeReviewAction()
        let vm = PromptPanelViewModel(actions: [action])
        var submitted: (String, ActionBindingPayload)?
        vm.onSubmitAction = { prompt, binding, _ in submitted = (prompt, binding) }

        vm.draft = "r [code: let x = 1]"
        vm.moveSelectedAction(.next)
        vm.submitSelectedAction()

        XCTAssertEqual(submitted?.0, "Review:\\nlet x = 1")
        XCTAssertEqual(submitted?.1.pluginId, "review")
    }

    @MainActor
    func testSubmitSelectedRequiredArgumentActionPromptsForMissingArgument() {
        let action = makeReviewAction()
        let vm = PromptPanelViewModel(actions: [action])
        var submitted = false
        vm.onSubmitAction = { _, _, _ in submitted = true }

        vm.draft = "review"
        vm.moveSelectedAction(.next)
        vm.submitSelectedAction()

        XCTAssertFalse(submitted)
        XCTAssertEqual(vm.draft, "r [code: ]")
        XCTAssertEqual(vm.submissionDisabledMessage, "缺少必填参数：code")
    }

    @MainActor
    func testSubmitSelectedActionFallsBackToPlainSubmitWhenNothingSelected() {
        let vm = PromptPanelViewModel(actions: makeTestActions())
        var submitted: String?
        vm.onSubmit = { prompt, _ in submitted = prompt }

        vm.draft = "hello"
        vm.submitSelectedAction()

        XCTAssertEqual(submitted, "hello")
    }

    @MainActor
    func testAppendAttachmentSkipsNoAttachment() {
        let vm = PromptPanelViewModel(actions: [])
        vm.appendAttachment(.noAttachment)
        XCTAssertEqual(vm.attachments.count, 0)
    }

    @MainActor
    func testAppendAttachmentAddsTextSelection() {
        let vm = PromptPanelViewModel(actions: [])
        vm.appendAttachment(.textSelection(id: "a", text: "hello"))
        XCTAssertEqual(vm.attachments.count, 1)
        XCTAssertEqual(vm.attachments.first?.id, "a")
    }

    @MainActor
    func testRemoveAttachmentByID() {
        let vm = PromptPanelViewModel(actions: [])
        vm.appendAttachment(.textSelection(id: "a", text: "x"))
        vm.appendAttachment(.textSelection(id: "b", text: "y"))
        vm.removeAttachment(id: "a")
        XCTAssertEqual(vm.attachments.map(\.id), ["b"])
    }

    @MainActor
    func testSubmitForwardsAttachmentsAndDropsErrors() {
        let vm = PromptPanelViewModel(actions: [])
        vm.draft = "hello"
        vm.appendAttachment(.textSelection(id: "a", text: "code"))
        vm.appendAttachment(.selectionError(id: "b", message: "boom"))

        var received: [PromptAttachmentResult] = []
        vm.onSubmit = { _, attachments in received = attachments }
        vm.submit()

        XCTAssertEqual(received.count, 1)
        XCTAssertEqual(received.first?.id, "a")
        XCTAssertEqual(vm.attachments, [])
    }

    @MainActor
    func testOpenSettingsCallsOnOpenSettingsAndOnHide() {
        let actions = makeTestActions()
        let vm = PromptPanelViewModel(actions: actions)
        var didOpenSettings = false
        var didHide = false
        vm.onOpenSettings = { didOpenSettings = true }
        vm.onHide = { didHide = true }

        vm.openSettings()

        XCTAssertTrue(didOpenSettings)
        XCTAssertTrue(didHide)
    }

    private func makeTestActions() -> [ActionDefinition] {
        [
            ActionDefinition.skill(
                id: "new-thread",
                trigger: "new",
                title: "新建Thread",
                description: "thread",
                template: "{{query}}",
                arguments: [
                    ActionArgumentDefinition(name: "query", description: nil, required: false)
                ],
                defaultShortcut: nil
            ),
            ActionDefinition.skill(
                id: "weather/current",
                trigger: "weather",
                title: "当前天气",
                description: "weather",
                template: "查询当前天气",
                arguments: [],
                defaultShortcut: nil
            )
        ]
    }

    private func makeReviewAction() -> ActionDefinition {
        ActionDefinition.plugin(
            id: "review/code_review",
            trigger: "r",
            title: "Review",
            description: nil,
            template: "Review:\\n{{code}}",
            arguments: [
                ActionArgumentDefinition(name: "code", description: nil, required: true)
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
}

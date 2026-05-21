import XCTest
@testable import HandAgentDesktop

final class PromptPanelViewModelTests: XCTestCase {
    @MainActor
    func testFilteredActionsReturnsAllWhenDraftIsEmpty() {
        let actions = makeTestActions()
        let vm = PromptPanelViewModel(actions: actions)

        XCTAssertEqual(vm.filteredActions.map(\.id), ["open-settings", "new-session"])
    }

    @MainActor
    func testFilteredActionsFiltersByDraft() {
        let actions = makeTestActions()
        let vm = PromptPanelViewModel(actions: actions)

        vm.draft = "settings"

        XCTAssertEqual(vm.filteredActions.map(\.id), ["open-settings"])
    }

    @MainActor
    func testUpdateActionsReplacesFilteredActions() {
        let vm = PromptPanelViewModel(actions: makeTestActions())

        vm.updateActions([
            ActionDefinition(
                id: "recent-session-1",
                pluginId: "history",
                promptName: "recent",
                trigger: "history",
                title: "最近会话：API 设计",
                description: "session",
                template: "{{query}}",
                arguments: [
                    ActionArgumentDefinition(name: "query", description: nil, required: false)
                ],
                mcpServerIds: [],
                icons: []
            )
        ])

        vm.draft = "history"

        XCTAssertEqual(vm.filteredActions.map(\.id), ["recent-session-1"])
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

        vm.draft = "r \"let x = 1\""
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
    }

    @MainActor
    func testSelectActionWritesTriggerIntoDraft() {
        let action = makeReviewAction()
        let vm = PromptPanelViewModel(actions: [action])

        vm.selectAction(action)

        XCTAssertEqual(vm.draft, "r ")
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
            ActionDefinition(
                id: "open-settings",
                pluginId: "settings",
                promptName: "open",
                trigger: "settings",
                title: "打开设置",
                description: "preferences",
                template: "{{query}}",
                arguments: [
                    ActionArgumentDefinition(name: "query", description: nil, required: false)
                ],
                mcpServerIds: [],
                icons: []
            ),
            ActionDefinition(
                id: "new-session",
                pluginId: "session",
                promptName: "new",
                trigger: "new",
                title: "新建会话",
                description: "session",
                template: "{{query}}",
                arguments: [
                    ActionArgumentDefinition(name: "query", description: nil, required: false)
                ],
                mcpServerIds: [],
                icons: []
            )
        ]
    }

    private func makeReviewAction() -> ActionDefinition {
        ActionDefinition(
            id: "review/code_review",
            pluginId: "review",
            promptName: "code_review",
            trigger: "r",
            title: "Review",
            description: nil,
            template: "Review:\\n{{code}}",
            arguments: [
                ActionArgumentDefinition(name: "code", description: nil, required: true)
            ],
            mcpServerIds: ["github"],
            icons: []
        )
    }
}

import XCTest
import KeyboardShortcuts
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
    func testSubmitActionCallsPerformAndOnHide() {
        let actions = makeTestActions()
        let vm = PromptPanelViewModel(actions: actions)
        var performed = false
        var hidden = false
        vm.onHide = { hidden = true }

        let action = PromptAction(
            id: "test",
            title: "Test",
            keywords: [],
            defaultShortcut: nil,
            perform: { performed = true }
        )
        vm.submitAction(action)

        XCTAssertTrue(performed)
        XCTAssertTrue(hidden)
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

    private func makeTestActions() -> [PromptAction] {
        [
            PromptAction(
                id: "open-settings",
                title: "打开设置",
                keywords: ["settings", "preferences"],
                defaultShortcut: .init(.comma, modifiers: [.command]),
                perform: {}
            ),
            PromptAction(
                id: "new-session",
                title: "新建会话",
                keywords: ["session", "new"],
                defaultShortcut: nil,
                perform: {}
            )
        ]
    }
}

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

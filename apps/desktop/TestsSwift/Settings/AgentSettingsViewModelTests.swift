import XCTest
@testable import HandAgentDesktop

final class AgentSettingsViewModelTests: XCTestCase {
    @MainActor
    func testModelPropertyReadsFromStore() {
        let homeURL = TestFiles.makeTemporaryHomeDirectory()
        defer { try? FileManager.default.removeItem(at: homeURL) }

        let store = AgentSettingsStore(homeDirectoryURL: homeURL)
        let vm = AgentSettingsViewModel(store: store)

        XCTAssertEqual(vm.model, "gpt-5-mini")
    }

    @MainActor
    func testSettingModelPersistsToStore() {
        let homeURL = TestFiles.makeTemporaryHomeDirectory()
        defer { try? FileManager.default.removeItem(at: homeURL) }

        let store = AgentSettingsStore(homeDirectoryURL: homeURL)
        let vm = AgentSettingsViewModel(store: store)

        vm.model = "  gpt-4.1  "

        XCTAssertEqual(store.settings.model, "gpt-4.1")
    }

    @MainActor
    func testSettingProviderPersistsToStore() {
        let homeURL = TestFiles.makeTemporaryHomeDirectory()
        defer { try? FileManager.default.removeItem(at: homeURL) }

        let store = AgentSettingsStore(homeDirectoryURL: homeURL)
        let vm = AgentSettingsViewModel(store: store)

        vm.provider = .anthropic

        XCTAssertEqual(store.settings.provider, .anthropic)
    }

    @MainActor
    func testSettingAPIPersistsToStore() {
        let homeURL = TestFiles.makeTemporaryHomeDirectory()
        defer { try? FileManager.default.removeItem(at: homeURL) }

        let store = AgentSettingsStore(homeDirectoryURL: homeURL)
        let vm = AgentSettingsViewModel(store: store)

        vm.api = .chat

        XCTAssertEqual(store.settings.api, .chat)
    }

}

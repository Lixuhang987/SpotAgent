import XCTest
@testable import HandAgentDesktop

final class AgentSettingsViewModelTests: XCTestCase {
    @MainActor
    func testModelPropertyReadsFromStore() {
        let homeURL = makeTemporaryHomeDirectory()
        defer { try? FileManager.default.removeItem(at: homeURL) }

        let store = AgentSettingsStore(homeDirectoryURL: homeURL)
        let vm = AgentSettingsViewModel(store: store)

        XCTAssertEqual(vm.model, "gpt-5-mini")
    }

    @MainActor
    func testSettingModelPersistsToStore() {
        let homeURL = makeTemporaryHomeDirectory()
        defer { try? FileManager.default.removeItem(at: homeURL) }

        let store = AgentSettingsStore(homeDirectoryURL: homeURL)
        let vm = AgentSettingsViewModel(store: store)

        vm.model = "  gpt-4.1  "

        XCTAssertEqual(store.settings.model, "gpt-4.1")
    }

    @MainActor
    func testSettingAPIPersistsToStore() {
        let homeURL = makeTemporaryHomeDirectory()
        defer { try? FileManager.default.removeItem(at: homeURL) }

        let store = AgentSettingsStore(homeDirectoryURL: homeURL)
        let vm = AgentSettingsViewModel(store: store)

        vm.api = .chat

        XCTAssertEqual(store.settings.api, .chat)
    }

    private func makeTemporaryHomeDirectory() -> URL {
        let root = URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
        let directory = root.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory
    }
}

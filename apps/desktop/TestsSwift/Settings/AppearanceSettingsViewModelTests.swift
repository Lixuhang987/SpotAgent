import XCTest
@testable import HandAgentDesktop

final class AppearanceSettingsViewModelTests: XCTestCase {
    @MainActor
    func testThemePreferenceWritesThroughStore() {
        let homeURL = TestFiles.makeTemporaryHomeDirectory()
        defer { try? FileManager.default.removeItem(at: homeURL) }

        let store = AgentSettingsStore(homeDirectoryURL: homeURL)
        let viewModel = AppearanceSettingsViewModel(store: store)

        viewModel.themePreference = .dark

        XCTAssertEqual(store.appearance.themePreference, .dark)
    }
}

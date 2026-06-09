import XCTest
@testable import HandAgentDesktop

final class AppearanceThemeServiceTests: XCTestCase {
    @MainActor
    func testResolvesExplicitPreferenceWithoutSystemResolver() {
        let homeURL = TestFiles.makeTemporaryHomeDirectory()
        defer { try? FileManager.default.removeItem(at: homeURL) }
        let store = AgentSettingsStore(homeDirectoryURL: homeURL)
        let service = AppearanceThemeService(store: store, systemResolver: { .dark })

        store.updateAppearance { $0.themePreference = .light }

        XCTAssertEqual(service.currentTheme.resolved, .light)
    }

    @MainActor
    func testResolvesSystemPreferenceFromResolver() {
        let homeURL = TestFiles.makeTemporaryHomeDirectory()
        defer { try? FileManager.default.removeItem(at: homeURL) }
        let store = AgentSettingsStore(homeDirectoryURL: homeURL)
        let service = AppearanceThemeService(store: store, systemResolver: { .dark })

        store.updateAppearance { $0.themePreference = .system }

        XCTAssertEqual(service.currentTheme, HostThemePayload(preference: .system, resolved: .dark))
    }
}

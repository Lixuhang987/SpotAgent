import Foundation
import XCTest
@testable import HandAgentDesktop

final class AgentSettingsStoreTests: XCTestCase {
    @MainActor
    func testLoadsDefaultsWhenSettingsFileDoesNotExist() {
        let homeURL = makeTemporaryHomeDirectory()
        defer { try? FileManager.default.removeItem(at: homeURL) }

        let store = AgentSettingsStore(homeDirectoryURL: homeURL)

        XCTAssertEqual(store.settings, .defaultValue)
    }

    @MainActor
    func testPersistsSettingsToDotSpotAgentSettingsJSON() throws {
        let homeURL = makeTemporaryHomeDirectory()
        defer { try? FileManager.default.removeItem(at: homeURL) }

        let store = AgentSettingsStore(homeDirectoryURL: homeURL)
        store.update { settings in
            settings.model = "gpt-4.1"
            settings.apiKey = "test-key"
            settings.baseURL = "https://example.com/v1"
            settings.api = .chat
        }

        let fileURL = homeURL
            .appendingPathComponent(".spotAgent", isDirectory: true)
            .appendingPathComponent("settings.json")
        let data = try Data(contentsOf: fileURL)
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        let llm = json?["llm"] as? [String: Any]

        XCTAssertEqual(llm?["model"] as? String, "gpt-4.1")
        XCTAssertEqual(llm?["apiKey"] as? String, "test-key")
        XCTAssertEqual(llm?["baseUrl"] as? String, "https://example.com/v1")
        XCTAssertEqual(llm?["api"] as? String, "chat")
    }

    private func makeTemporaryHomeDirectory() -> URL {
        let root = URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
        let directory = root.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory
    }
}

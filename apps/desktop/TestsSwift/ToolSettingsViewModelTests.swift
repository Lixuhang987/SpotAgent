import Foundation
import XCTest
@testable import HandAgentDesktop

final class ToolSettingsViewModelTests: XCTestCase {
    @MainActor
    func testLoadsDenylistAsDisabledTool() throws {
        let homeURL = makeTemporaryHomeDirectory()
        defer { try? FileManager.default.removeItem(at: homeURL) }
        try writeSettings(
            homeURL,
            """
            {
              "tools": {
                "denylist": ["screen.capture"]
              }
            }
            """
        )

        let store = AgentSettingsStore(homeDirectoryURL: homeURL)
        let viewModel = ToolSettingsViewModel(store: store)

        XCTAssertFalse(viewModel.isEnabled("screen.capture"))
        XCTAssertTrue(viewModel.isEnabled("clipboard.read"))
    }

    @MainActor
    func testDisablingToolAddsItToDenylist() throws {
        let homeURL = makeTemporaryHomeDirectory()
        defer { try? FileManager.default.removeItem(at: homeURL) }

        let store = AgentSettingsStore(homeDirectoryURL: homeURL)
        let viewModel = ToolSettingsViewModel(store: store)

        viewModel.setEnabled("file.write", enabled: false)

        XCTAssertEqual(store.toolSettings.denylist, ["file.write"])
    }

    @MainActor
    func testEnablingToolRemovesDenylistAndUpdatesAllowlistWhenPresent() throws {
        let homeURL = makeTemporaryHomeDirectory()
        defer { try? FileManager.default.removeItem(at: homeURL) }
        try writeSettings(
            homeURL,
            """
            {
              "tools": {
                "allowlist": ["clipboard.read"],
                "denylist": ["screen.capture"]
              }
            }
            """
        )

        let store = AgentSettingsStore(homeDirectoryURL: homeURL)
        let viewModel = ToolSettingsViewModel(store: store)

        viewModel.setEnabled("screen.capture", enabled: true)
        viewModel.setEnabled("file.read", enabled: true)

        XCTAssertEqual(store.toolSettings.denylist, [])
        XCTAssertEqual(store.toolSettings.allowlist, ["clipboard.read", "file.read", "screen.capture"])
    }

    @MainActor
    func testBuiltinToolCatalogContainsExpectedToolsAndRiskLabels() {
        let store = AgentSettingsStore(homeDirectoryURL: makeTemporaryHomeDirectory())
        let viewModel = ToolSettingsViewModel(store: store)

        XCTAssertEqual(viewModel.tools.map(\.name), [
            "clipboard.read",
            "app.frontmost",
            "window.list",
            "screen.capture",
            "ocr.read",
            "accessibility.snapshot",
            "accessibility.action",
            "workspace.list",
            "file.read",
            "file.write",
        ])
        XCTAssertEqual(viewModel.tools.first(where: { $0.name == "file.write" })?.riskLabel, "高风险")
    }

    private func makeTemporaryHomeDirectory() -> URL {
        let root = URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
        let directory = root.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory
    }

    private func writeSettings(_ homeURL: URL, _ json: String) throws {
        let fileURL = homeURL
            .appendingPathComponent(".spotAgent", isDirectory: true)
            .appendingPathComponent("settings.json")
        try FileManager.default.createDirectory(
            at: fileURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        try Data(json.utf8).write(to: fileURL)
    }
}

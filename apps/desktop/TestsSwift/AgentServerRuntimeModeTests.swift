import Foundation
import XCTest
@testable import HandAgentDesktop

final class AgentServerRuntimeModeTests: XCTestCase {
    func testRuntimeModeDefaultsToSettingsWithoutMarker() throws {
        let resourcesURL = try makeResourcesDirectory()
        defer { try? FileManager.default.removeItem(at: resourcesURL) }

        XCTAssertEqual(
            AgentServerRuntimeMode.resolve(
                resourcesURL: resourcesURL,
                environment: [:]
            ),
            .settings
        )
    }

    func testRuntimeModeUsesMockWhenBundleMarkerRequestsMockLLM() throws {
        let resourcesURL = try makeResourcesDirectory()
        defer { try? FileManager.default.removeItem(at: resourcesURL) }
        try Data(#"{"llmMode":"mock"}"#.utf8)
            .write(to: resourcesURL.appendingPathComponent(AgentServerRuntimeMode.markerFileName))

        XCTAssertEqual(
            AgentServerRuntimeMode.resolve(
                resourcesURL: resourcesURL,
                environment: [:]
            ),
            .mock
        )
    }

    func testRuntimeModeAppliesMockEnvironmentForAgentServerProcess() throws {
        let resourcesURL = try makeResourcesDirectory()
        defer { try? FileManager.default.removeItem(at: resourcesURL) }
        try Data(#"{"llmMode":"mock"}"#.utf8)
            .write(to: resourcesURL.appendingPathComponent(AgentServerRuntimeMode.markerFileName))

        var environment = ["NODE_PATH": "/existing"]
        AgentServerRuntimeMode.apply(
            to: &environment,
            resourcesURL: resourcesURL
        )

        XCTAssertEqual(environment["HANDAGENT_LLM_MODE"], "mock")
    }

    private func makeResourcesDirectory() throws -> URL {
        let root = URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
        let directory = root.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory
    }
}

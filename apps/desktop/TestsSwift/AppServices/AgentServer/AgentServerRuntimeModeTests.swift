import Foundation
import XCTest
@testable import HandAgentDesktop

final class AgentServerRuntimeModeTests: XCTestCase {
    private let agentServerRelativePath = "apps/agent-server/src/server/server.ts"

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

    func testRepositoryRootLocatorPrefersCurrentWorktreeOverBundleRepository() throws {
        let mainRepo = URL(fileURLWithPath: "/repo/main-repo", isDirectory: true)
        let worktreeRepo = URL(fileURLWithPath: "/repo/worktree-repo", isDirectory: true)
        let bundleExecutableURL = mainRepo
            .appendingPathComponent(".build/debug", isDirectory: true)
            .appendingPathComponent("HandAgentDesktop")

        let resolved = AgentServerRepositoryRootLocator(
            agentServerRelativePath: agentServerRelativePath,
            fileExists: { path in
                path == mainRepo.appendingPathComponent("Package.swift").path ||
                    path == mainRepo.appendingPathComponent(self.agentServerRelativePath).path ||
                    path == worktreeRepo.appendingPathComponent("Package.swift").path ||
                    path == worktreeRepo.appendingPathComponent(self.agentServerRelativePath).path
            }
        ).locate(
            bundleExecutableURL: bundleExecutableURL,
            bundleResourceURL: mainRepo.appendingPathComponent(".build/debug", isDirectory: true),
            bundleURL: mainRepo,
            currentDirectoryURL: worktreeRepo
        )

        XCTAssertEqual(resolved?.standardizedFileURL.path, worktreeRepo.standardizedFileURL.path)
    }

    func testRepositoryRootLocatorFallsBackToBundleWhenCurrentDirectoryIsRoot() throws {
        let repo = URL(fileURLWithPath: "/repo/worktree-repo", isDirectory: true)
        let bundleExecutableURL = repo
            .appendingPathComponent("dist/HandAgentDesktop.app/Contents/MacOS", isDirectory: true)
            .appendingPathComponent("HandAgentDesktop")

        let resolved = AgentServerRepositoryRootLocator(
            agentServerRelativePath: agentServerRelativePath,
            fileExists: { path in
                path == repo.appendingPathComponent("Package.swift").path ||
                    path == repo.appendingPathComponent(self.agentServerRelativePath).path
            }
        ).locate(
            bundleExecutableURL: bundleExecutableURL,
            bundleResourceURL: repo.appendingPathComponent("dist/HandAgentDesktop.app/Contents/Resources", isDirectory: true),
            bundleURL: repo.appendingPathComponent("dist/HandAgentDesktop.app", isDirectory: true),
            currentDirectoryURL: URL(fileURLWithPath: "/", isDirectory: true)
        )

        XCTAssertEqual(resolved?.standardizedFileURL.path, repo.standardizedFileURL.path)
    }

    private func makeResourcesDirectory() throws -> URL {
        let root = URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
        let directory = root.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory
    }
}

import Foundation
import XCTest
@testable import HandAgentDesktop

final class PermissionRulesViewModelTests: XCTestCase {
    @MainActor
    func testLoadsPermissionRulesFromDotSpotAgentPermissionsJSON() throws {
        let homeURL = makeTemporaryHomeDirectory()
        defer { try? FileManager.default.removeItem(at: homeURL) }
        let fileURL = permissionsFileURL(homeURL)
        try FileManager.default.createDirectory(
            at: fileURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        try Data(
            """
            {
              "version": 1,
              "rules": [
                {
                  "toolName": "file.write",
                  "argHash": "hash-1",
                  "decision": "allow",
                  "createdAt": "2026-05-19T00:00:00.000Z",
                  "arguments": {
                    "workspaceId": "default",
                    "relativePath": "notes/today.md"
                  }
                }
              ]
            }
            """.utf8
        ).write(to: fileURL)

        let viewModel = PermissionRulesViewModel(homeDirectoryURL: homeURL)

        XCTAssertEqual(viewModel.rules.count, 1)
        XCTAssertEqual(viewModel.rules[0].id, "hash-1")
        XCTAssertEqual(viewModel.rules[0].toolName, "file.write")
        XCTAssertEqual(viewModel.rules[0].decision, "allow")
        XCTAssertEqual(viewModel.rules[0].createdAtText, "2026-05-19 00:00")
        XCTAssertTrue(viewModel.rules[0].argumentsSummary.contains("relativePath: notes/today.md"))
        XCTAssertTrue(viewModel.rules[0].argumentsSummary.contains("workspaceId: default"))
    }

    @MainActor
    func testRevokeRemovesPermissionRuleAndPreservesOtherRules() throws {
        let homeURL = makeTemporaryHomeDirectory()
        defer { try? FileManager.default.removeItem(at: homeURL) }
        let fileURL = permissionsFileURL(homeURL)
        try FileManager.default.createDirectory(
            at: fileURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        try Data(
            """
            {
              "version": 1,
              "rules": [
                {
                  "toolName": "file.write",
                  "argHash": "hash-1",
                  "decision": "allow",
                  "createdAt": "2026-05-19T00:00:00.000Z",
                  "arguments": { "relativePath": "a.md" }
                },
                {
                  "toolName": "file.read",
                  "argHash": "hash-2",
                  "decision": "deny",
                  "createdAt": "2026-05-19T00:01:00.000Z",
                  "arguments": { "relativePath": "b.md" }
                }
              ]
            }
            """.utf8
        ).write(to: fileURL)
        let viewModel = PermissionRulesViewModel(homeDirectoryURL: homeURL)

        viewModel.revoke(ruleId: "hash-1")

        XCTAssertEqual(viewModel.rules.map(\.id), ["hash-2"])
        let data = try Data(contentsOf: fileURL)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        let rules = try XCTUnwrap(json["rules"] as? [[String: Any]])
        XCTAssertEqual(rules.map { $0["argHash"] as? String }, ["hash-2"])
    }

    private func makeTemporaryHomeDirectory() -> URL {
        let root = URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
        let directory = root.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory
    }

    private func permissionsFileURL(_ homeURL: URL) -> URL {
        homeURL
            .appendingPathComponent(".spotAgent", isDirectory: true)
            .appendingPathComponent("permissions.json")
    }
}

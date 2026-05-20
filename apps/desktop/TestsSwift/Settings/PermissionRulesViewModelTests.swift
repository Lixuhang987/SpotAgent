import Foundation
import XCTest
@testable import HandAgentDesktop

final class PermissionRulesViewModelTests: XCTestCase {
    @MainActor
    func testLoadsPermissionRulesFromDotSpotAgentPermissionsJSON() throws {
        let homeURL = TestFiles.makeTemporaryHomeDirectory()
        defer { try? FileManager.default.removeItem(at: homeURL) }
        let fileURL = TestFiles.permissionsFileURL(homeURL)
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
        let homeURL = TestFiles.makeTemporaryHomeDirectory()
        defer { try? FileManager.default.removeItem(at: homeURL) }
        let fileURL = TestFiles.permissionsFileURL(homeURL)
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
        let json = try TestFiles.readJSON(fileURL)
        let rules = try XCTUnwrap(json["rules"] as? [[String: Any]])
        XCTAssertEqual(rules.map { $0["argHash"] as? String }, ["hash-2"])
    }
}

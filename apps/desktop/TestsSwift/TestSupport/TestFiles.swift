import Foundation
import XCTest

enum TestFiles {
    static func makeTemporaryHomeDirectory() -> URL {
        let root = URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
        let directory = root.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory
    }

    static func settingsFileURL(_ homeURL: URL) -> URL {
        homeURL
            .appendingPathComponent(".spotAgent", isDirectory: true)
            .appendingPathComponent("settings.json")
    }

    static func permissionsFileURL(_ homeURL: URL) -> URL {
        homeURL
            .appendingPathComponent(".spotAgent", isDirectory: true)
            .appendingPathComponent("permissions.json")
    }

    static func pluginsDirectoryURL(_ homeURL: URL) -> URL {
        homeURL
            .appendingPathComponent(".spotAgent", isDirectory: true)
            .appendingPathComponent("plugins", isDirectory: true)
    }

    static func mcpConfigFileURL(_ homeURL: URL) -> URL {
        homeURL
            .appendingPathComponent(".spotAgent", isDirectory: true)
            .appendingPathComponent("mcp.json")
    }

    static func writeSettings(_ homeURL: URL, _ json: String) throws {
        let fileURL = settingsFileURL(homeURL)
        try FileManager.default.createDirectory(
            at: fileURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        try Data(json.utf8).write(to: fileURL)
    }

    static func writePlugin(_ homeURL: URL, id: String, json: String) throws {
        let fileURL = pluginsDirectoryURL(homeURL)
            .appendingPathComponent(id, isDirectory: true)
            .appendingPathComponent("plugin.json")
        try FileManager.default.createDirectory(
            at: fileURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        try Data(json.utf8).write(to: fileURL)
    }

    static func writeMCPConfig(_ homeURL: URL, _ json: String) throws {
        let fileURL = mcpConfigFileURL(homeURL)
        try FileManager.default.createDirectory(
            at: fileURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        try Data(json.utf8).write(to: fileURL)
    }

    static func readJSON(_ fileURL: URL) throws -> [String: Any] {
        let data = try Data(contentsOf: fileURL)
        return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }
}

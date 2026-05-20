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

    static func writeSettings(_ homeURL: URL, _ json: String) throws {
        let fileURL = settingsFileURL(homeURL)
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

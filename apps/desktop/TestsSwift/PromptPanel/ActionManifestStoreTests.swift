import XCTest
@testable import HandAgentDesktop

final class ActionManifestStoreTests: XCTestCase {
    func testLoadsPluginManifestsFromStablePluginDirectories() throws {
        let root = try FileManager.default.url(
            for: .itemReplacementDirectory,
            in: .userDomainMask,
            appropriateFor: FileManager.default.temporaryDirectory,
            create: true
        )
        defer { try? FileManager.default.removeItem(at: root) }
        let plugins = root.appendingPathComponent("plugins", isDirectory: true)
        try FileManager.default.createDirectory(at: plugins.appendingPathComponent("beta", isDirectory: true), withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: plugins.appendingPathComponent("alpha", isDirectory: true), withIntermediateDirectories: true)
        try writePlugin(id: "beta", trigger: "b", to: plugins.appendingPathComponent("beta/plugin.json"))
        try writePlugin(id: "alpha", trigger: "a", to: plugins.appendingPathComponent("alpha/plugin.json"))

        let store = ActionManifestStore(pluginsDirectoryURL: plugins)
        let result = store.load()

        XCTAssertEqual(result.actions.map { $0.pluginBinding?.pluginId }, ["alpha", "beta"])
        XCTAssertEqual(result.disabled, [])
    }

    func testDisablesManifestWhenDirectoryNameDoesNotMatchId() throws {
        let root = try FileManager.default.url(
            for: .itemReplacementDirectory,
            in: .userDomainMask,
            appropriateFor: FileManager.default.temporaryDirectory,
            create: true
        )
        defer { try? FileManager.default.removeItem(at: root) }
        let plugins = root.appendingPathComponent("plugins", isDirectory: true)
        let wrong = plugins.appendingPathComponent("wrong", isDirectory: true)
        try FileManager.default.createDirectory(at: wrong, withIntermediateDirectories: true)
        try writePlugin(id: "actual", trigger: "a", to: wrong.appendingPathComponent("plugin.json"))

        let result = ActionManifestStore(pluginsDirectoryURL: plugins).load()

        XCTAssertEqual(result.actions, [])
        XCTAssertEqual(result.disabled.map(\.id), ["plugin:wrong"])
        XCTAssertEqual(result.disabled.first?.reason, "plugin id must match directory name")
    }
}

private func writePlugin(id: String, trigger: String, to url: URL) throws {
    let json = """
    {
      "version": 1,
      "id": "\(id)",
      "title": "\(id)",
      "enabled": true,
      "prompts": [
        {
          "name": "code_review",
          "trigger": "\(trigger)",
          "title": "Review",
          "template": "{{code}}",
          "arguments": [
            { "name": "code", "required": true }
          ]
        }
      ]
    }
    """
    try json.data(using: .utf8)!.write(to: url)
}

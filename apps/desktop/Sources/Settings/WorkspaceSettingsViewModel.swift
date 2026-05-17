import AppKit
import Foundation

struct WorkspaceEntry: Identifiable, Equatable {
    let id: String
    var name: String
    var description: String
    let rootPath: String
    let createdAt: Date?
    let isDefault: Bool
}

@Observable
@MainActor
final class WorkspaceSettingsViewModel {
    private(set) var workspaces: [WorkspaceEntry] = []
    private let filePath: URL

    init(homeDirectoryURL: URL = FileManager.default.homeDirectoryForCurrentUser) {
        self.filePath = homeDirectoryURL
            .appendingPathComponent(".spotAgent")
            .appendingPathComponent("workspaces.json")
        reload()
    }

    func reload() {
        guard let data = try? Data(contentsOf: filePath),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let list = json["workspaces"] as? [[String: Any]] else {
            workspaces = []
            return
        }
        let isoFormatter = ISO8601DateFormatter()
        workspaces = list.compactMap { entry in
            guard let id = entry["id"] as? String,
                  let name = entry["name"] as? String,
                  let rootPath = entry["rootPath"] as? String else { return nil }
            let createdAt = (entry["createdAt"] as? String).flatMap { isoFormatter.date(from: $0) }
            return WorkspaceEntry(
                id: id,
                name: name,
                description: entry["description"] as? String ?? "",
                rootPath: rootPath,
                createdAt: createdAt,
                isDefault: entry["isDefault"] as? Bool ?? false
            )
        }
    }

    func add(name: String, description: String, rootPath: String) {
        let entry: [String: Any] = [
            "id": UUID().uuidString,
            "name": name,
            "description": description,
            "rootPath": rootPath,
            "createdAt": ISO8601DateFormatter().string(from: Date()),
            "isDefault": false,
        ]
        var list = rawList()
        list.append(entry)
        save(list)
        reload()
    }

    func update(id: String, name: String, description: String) {
        var list = rawList()
        guard let idx = list.firstIndex(where: { ($0["id"] as? String) == id }) else { return }
        list[idx]["name"] = name
        list[idx]["description"] = description
        save(list)
        reload()
    }

    func remove(id: String) {
        var list = rawList()
        list.removeAll { ($0["id"] as? String) == id }
        save(list)
        reload()
    }

    private func rawList() -> [[String: Any]] {
        guard let data = try? Data(contentsOf: filePath),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let list = json["workspaces"] as? [[String: Any]] else {
            return []
        }
        return list
    }

    private func save(_ list: [[String: Any]]) {
        let json: [String: Any] = ["version": 1, "workspaces": list]
        guard let data = try? JSONSerialization.data(withJSONObject: json, options: [.prettyPrinted, .sortedKeys]) else { return }
        try? FileManager.default.createDirectory(at: filePath.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? data.write(to: filePath)
    }
}

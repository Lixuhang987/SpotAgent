import Foundation

struct ActionManifestLoadResult: Equatable {
    let actions: [ActionDefinition]
    let disabled: [DisabledActionDefinition]
}

struct ActionManifestStore {
    let pluginsDirectoryURL: URL

    init(
        pluginsDirectoryURL: URL = FileManager.default
            .homeDirectoryForCurrentUser
            .appendingPathComponent(".spotAgent/plugins", isDirectory: true)
    ) {
        self.pluginsDirectoryURL = pluginsDirectoryURL
    }

    func load() -> ActionManifestLoadResult {
        let fileManager = FileManager.default
        guard let directories = try? fileManager.contentsOfDirectory(
            at: pluginsDirectoryURL,
            includingPropertiesForKeys: [.isDirectoryKey],
            options: [.skipsHiddenFiles]
        ) else {
            return ActionManifestLoadResult(actions: [], disabled: [])
        }

        var manifests: [PluginManifestDefinition] = []
        var disabled: [DisabledActionDefinition] = []

        for directory in directories.sorted(by: { $0.lastPathComponent < $1.lastPathComponent }) {
            let values = try? directory.resourceValues(forKeys: [.isDirectoryKey])
            guard values?.isDirectory == true else { continue }

            let pluginId = directory.lastPathComponent
            let manifestURL = directory.appendingPathComponent("plugin.json")
            do {
                let data = try Data(contentsOf: manifestURL)
                let manifest = try PluginManifestDefinition.decode(data)
                guard manifest.id == pluginId else {
                    disabled.append(.init(id: "plugin:\(pluginId)", reason: "plugin id must match directory name"))
                    continue
                }
                manifests.append(manifest)
            } catch {
                disabled.append(.init(id: "plugin:\(pluginId)", reason: "plugin manifest not readable"))
            }
        }

        let built = ActionDefinition.buildActions(from: manifests)
        return ActionManifestLoadResult(actions: built.enabled, disabled: disabled + built.disabled)
    }
}

import Foundation

struct PluginSettingsEntry: Identifiable, Equatable {
    let id: String
    let title: String
    let description: String
    let promptCount: Int
    let mcpServerIds: [String]
    let isEnabled: Bool
}

@Observable
@MainActor
final class PluginSettingsViewModel {
    private(set) var plugins: [PluginSettingsEntry] = []
    private(set) var saveErrorMessage: String?

    @ObservationIgnored private let fileManager: FileManager
    @ObservationIgnored private let pluginsDirectoryURL: URL

    init(
        homeDirectoryURL: URL = FileManager.default.homeDirectoryForCurrentUser,
        fileManager: FileManager = .default
    ) {
        self.fileManager = fileManager
        self.pluginsDirectoryURL = Self.pluginsDirectoryURL(homeDirectoryURL: homeDirectoryURL)
        reload()
    }

    func reload() {
        plugins = loadManifests().compactMap { manifest in
            let promptCount = manifest.prompts.filter { $0.actionKind == .plugin }.count
            guard promptCount > 0 else { return nil }
            return PluginSettingsEntry(
                id: manifest.id,
                title: manifest.title,
                description: manifest.description ?? "",
                promptCount: promptCount,
                mcpServerIds: manifest.mcpServerIds ?? [],
                isEnabled: manifest.enabled ?? true
            )
        }
        saveErrorMessage = nil
    }

    func setEnabled(pluginId: String, enabled: Bool) {
        guard let manifest = loadManifest(pluginId: pluginId) else { return }
        persist(
            PluginManifestDefinition(
                version: manifest.version,
                id: manifest.id,
                title: manifest.title,
                description: manifest.description,
                enabled: enabled,
                mcpServerIds: manifest.mcpServerIds,
                prompts: manifest.prompts
            ),
            pluginId: pluginId
        )
        reload()
    }

    @discardableResult
    func createPlugin(
        id: String,
        title: String,
        description: String,
        trigger: String,
        promptName: String,
        promptTitle: String,
        template: String,
        requiredArgumentName: String,
        mcpServerIdsText: String
    ) -> Bool {
        let pluginID = normalizedIdentifier(id)
        let promptID = normalizedIdentifier(promptName)
        guard !pluginID.isEmpty, !promptID.isEmpty else {
            saveErrorMessage = "Plugin ID 和 Prompt 名称不能为空"
            return false
        }

        let manifestTitle = trimmed(title)
        let actionTrigger = trimmed(trigger)
        let actionTitle = trimmed(promptTitle).isEmpty ? manifestTitle : trimmed(promptTitle)
        let actionTemplate = template.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !manifestTitle.isEmpty, !actionTitle.isEmpty, !actionTrigger.isEmpty, !actionTemplate.isEmpty else {
            saveErrorMessage = "标题、Trigger 和 Template 不能为空"
            return false
        }
        guard !actionTrigger.contains(where: \.isWhitespace) else {
            saveErrorMessage = "Trigger 不能包含空白字符"
            return false
        }

        let argument = normalizedIdentifier(requiredArgumentName)
        let prompts = [
            PluginPromptDefinition(
                name: promptID,
                kind: .plugin,
                trigger: actionTrigger,
                title: actionTitle,
                description: nil,
                template: actionTemplate,
                globalShortcut: nil,
                arguments: argument.isEmpty ? [] : [
                    ActionArgumentDefinition(name: argument, description: nil, required: true)
                ],
                icons: nil
            )
        ]

        persist(
            PluginManifestDefinition(
                version: 1,
                id: pluginID,
                title: manifestTitle,
                description: optionalTrimmed(description),
                enabled: true,
                mcpServerIds: commaSeparated(mcpServerIdsText),
                prompts: prompts
            ),
            pluginId: pluginID
        )
        reload()
        return saveErrorMessage == nil
    }

    func installExamplePlugin() {
        let prompt = PluginPromptDefinition(
            name: "review",
            kind: .plugin,
            trigger: "review",
            title: "Review With Filesystem",
            description: "Use the filesystem MCP server to review a file or folder.",
            template: """
            Review the target with filesystem tools.

            Target: {{path}}

            Focus on correctness, risks, and missing verification.
            """,
            globalShortcut: nil,
            arguments: [
                ActionArgumentDefinition(name: "path", description: "File or folder path", required: true)
            ],
            icons: nil
        )
        persist(
            PluginManifestDefinition(
                version: 1,
                id: "example-review",
                title: "Example Review",
                description: "Example plugin action bound to the filesystem MCP server.",
                enabled: true,
                mcpServerIds: ["filesystem"],
                prompts: [prompt]
            ),
            pluginId: "example-review"
        )
        reload()
    }

    func deletePlugin(id: String) {
        let directoryURL = pluginsDirectoryURL.appendingPathComponent(id, isDirectory: true)
        do {
            if fileManager.fileExists(atPath: directoryURL.path) {
                try fileManager.removeItem(at: directoryURL)
            }
            reload()
        } catch {
            saveErrorMessage = "删除 Plugin 失败：\(error.localizedDescription)"
        }
    }

    static func pluginsDirectoryURL(homeDirectoryURL: URL) -> URL {
        homeDirectoryURL
            .appendingPathComponent(".spotAgent", isDirectory: true)
            .appendingPathComponent("plugins", isDirectory: true)
    }

    private func loadManifests() -> [PluginManifestDefinition] {
        guard let directories = try? fileManager.contentsOfDirectory(
            at: pluginsDirectoryURL,
            includingPropertiesForKeys: [.isDirectoryKey],
            options: [.skipsHiddenFiles]
        ) else {
            return []
        }

        return directories
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
            .compactMap { directory -> PluginManifestDefinition? in
                guard (try? directory.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) == true else {
                    return nil
                }
                return loadManifest(pluginId: directory.lastPathComponent)
            }
    }

    private func loadManifest(pluginId: String) -> PluginManifestDefinition? {
        let fileURL = pluginsDirectoryURL
            .appendingPathComponent(pluginId, isDirectory: true)
            .appendingPathComponent("plugin.json")
        guard let data = try? Data(contentsOf: fileURL),
              let manifest = try? PluginManifestDefinition.decode(data),
              manifest.id == pluginId else {
            return nil
        }
        return manifest
    }

    private func persist(_ manifest: PluginManifestDefinition, pluginId: String) {
        let fileURL = pluginsDirectoryURL
            .appendingPathComponent(pluginId, isDirectory: true)
            .appendingPathComponent("plugin.json")
        do {
            try fileManager.createDirectory(at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            try encoder.encode(manifest).write(to: fileURL, options: .atomic)
            saveErrorMessage = nil
        } catch {
            saveErrorMessage = "保存 Plugin 失败：\(error.localizedDescription)"
        }
    }
}

func trimmed(_ value: String) -> String {
    value.trimmingCharacters(in: .whitespacesAndNewlines)
}

func optionalTrimmed(_ value: String) -> String? {
    let next = trimmed(value)
    return next.isEmpty ? nil : next
}

func normalizedIdentifier(_ value: String) -> String {
    trimmed(value)
        .lowercased()
        .map { character in
            character.isLetter || character.isNumber || character == "-" || character == "_"
                ? character
                : "-"
        }
        .reduce(into: "") { result, character in
            if character == "-", result.last == "-" { return }
            result.append(character)
        }
        .trimmingCharacters(in: CharacterSet(charactersIn: "-_"))
}

func commaSeparated(_ value: String) -> [String] {
    value
        .split { $0 == "," || $0 == "\n" }
        .map { trimmed(String($0)) }
        .filter { !$0.isEmpty }
}

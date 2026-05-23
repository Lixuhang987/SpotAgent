import Foundation

struct AppendPromptEntry: Identifiable, Equatable {
    let id: String
    let pluginId: String
    let name: String
    let trigger: String
    let title: String
    let description: String
    let template: String
    let argumentNames: [String]
}

@Observable
@MainActor
final class AppendPromptSettingsViewModel {
    private(set) var prompts: [AppendPromptEntry] = []
    private(set) var saveErrorMessage: String?

    @ObservationIgnored private let fileManager: FileManager
    @ObservationIgnored private let pluginsDirectoryURL: URL
    @ObservationIgnored private let managedPluginId = "append-prompts"

    init(
        homeDirectoryURL: URL = FileManager.default.homeDirectoryForCurrentUser,
        fileManager: FileManager = .default
    ) {
        self.fileManager = fileManager
        self.pluginsDirectoryURL = PluginSettingsViewModel.pluginsDirectoryURL(homeDirectoryURL: homeDirectoryURL)
        reload()
    }

    func reload() {
        prompts = loadManifests().flatMap { manifest in
            manifest.prompts.compactMap { prompt in
                guard prompt.actionKind == .skill else { return nil }
                return AppendPromptEntry(
                    id: "\(manifest.id)/\(prompt.name)",
                    pluginId: manifest.id,
                    name: prompt.name,
                    trigger: prompt.trigger,
                    title: prompt.title,
                    description: prompt.description ?? "",
                    template: prompt.template,
                    argumentNames: (prompt.arguments ?? []).map(\.name)
                )
            }
        }
        saveErrorMessage = nil
    }

    @discardableResult
    func createPrompt(
        name: String,
        trigger: String,
        title: String,
        description: String,
        template: String,
        requiredArgumentName: String
    ) -> Bool {
        let promptName = normalizedIdentifier(name)
        guard !promptName.isEmpty else {
            saveErrorMessage = "Prompt 名称不能为空"
            return false
        }

        let actionTrigger = trimmed(trigger)
        let actionTitle = trimmed(title)
        let actionTemplate = template.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !actionTrigger.isEmpty, !actionTitle.isEmpty, !actionTemplate.isEmpty else {
            saveErrorMessage = "标题、Trigger 和 Template 不能为空"
            return false
        }
        guard !actionTrigger.contains(where: \.isWhitespace) else {
            saveErrorMessage = "Trigger 不能包含空白字符"
            return false
        }

        var manifest = loadManifest(pluginId: managedPluginId) ?? PluginManifestDefinition(
            version: 1,
            id: managedPluginId,
            title: "Append Prompts",
            description: "User-managed append prompt actions",
            enabled: true,
            mcpServerIds: [],
            prompts: []
        )
        let argument = normalizedIdentifier(requiredArgumentName)
        let prompt = PluginPromptDefinition(
            name: promptName,
            kind: .skill,
            trigger: actionTrigger,
            title: actionTitle,
            description: optionalTrimmed(description),
            template: actionTemplate,
            globalShortcut: nil,
            arguments: argument.isEmpty ? [] : [
                ActionArgumentDefinition(name: argument, description: nil, required: true)
            ],
            icons: nil
        )
        manifest = PluginManifestDefinition(
            version: manifest.version,
            id: manifest.id,
            title: manifest.title,
            description: manifest.description,
            enabled: manifest.enabled,
            mcpServerIds: manifest.mcpServerIds,
            prompts: manifest.prompts.filter { $0.name != promptName } + [prompt]
        )
        persist(manifest, pluginId: managedPluginId)
        reload()
        return saveErrorMessage == nil
    }

    func installExamplePrompts() {
        let prompts = [
            PluginPromptDefinition(
                name: "explain-code",
                kind: .skill,
                trigger: "explain",
                title: "Explain Code",
                description: "Explain a pasted code block.",
                template: """
                Explain this code clearly. Call out inputs, outputs, side effects, and any risks.

                {{code}}
                """,
                globalShortcut: nil,
                arguments: [
                    ActionArgumentDefinition(name: "code", description: "Code to explain", required: true)
                ],
                icons: nil
            ),
            PluginPromptDefinition(
                name: "summarize-text",
                kind: .skill,
                trigger: "sum",
                title: "Summarize Text",
                description: "Summarize pasted text into concise bullets.",
                template: """
                Summarize the text below in Chinese. Keep only the important facts.

                {{text}}
                """,
                globalShortcut: nil,
                arguments: [
                    ActionArgumentDefinition(name: "text", description: "Text to summarize", required: true)
                ],
                icons: nil
            )
        ]
        let manifest = PluginManifestDefinition(
            version: 1,
            id: managedPluginId,
            title: "Append Prompts",
            description: "User-managed append prompt actions",
            enabled: true,
            mcpServerIds: [],
            prompts: prompts
        )
        persist(manifest, pluginId: managedPluginId)
        reload()
    }

    func deletePrompt(id: String) {
        let parts = id.split(separator: "/", maxSplits: 1).map(String.init)
        guard parts.count == 2 else { return }
        let pluginId = parts[0]
        let promptName = parts[1]
        guard var manifest = loadManifest(pluginId: pluginId) else { return }

        let remaining = manifest.prompts.filter { $0.name != promptName }
        if remaining.isEmpty {
            deleteManifest(pluginId: pluginId)
            reload()
            return
        }

        manifest = PluginManifestDefinition(
            version: manifest.version,
            id: manifest.id,
            title: manifest.title,
            description: manifest.description,
            enabled: manifest.enabled,
            mcpServerIds: manifest.mcpServerIds,
            prompts: remaining
        )
        persist(manifest, pluginId: pluginId)
        reload()
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
            saveErrorMessage = "保存 Append Prompt 失败：\(error.localizedDescription)"
        }
    }

    private func deleteManifest(pluginId: String) {
        do {
            let directoryURL = pluginsDirectoryURL.appendingPathComponent(pluginId, isDirectory: true)
            if fileManager.fileExists(atPath: directoryURL.path) {
                try fileManager.removeItem(at: directoryURL)
            }
            saveErrorMessage = nil
        } catch {
            saveErrorMessage = "删除 Append Prompt 失败：\(error.localizedDescription)"
        }
    }
}

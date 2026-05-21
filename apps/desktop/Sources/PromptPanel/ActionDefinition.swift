import Foundation

struct PluginManifestDefinition: Codable, Equatable {
    let version: Int
    let id: String
    let title: String
    let description: String?
    let enabled: Bool?
    let mcpServerIds: [String]?
    let prompts: [PluginPromptDefinition]

    static func decode(_ data: Data) throws -> PluginManifestDefinition {
        try JSONDecoder().decode(PluginManifestDefinition.self, from: data)
    }
}

struct PluginPromptDefinition: Codable, Equatable {
    let name: String
    let trigger: String
    let title: String
    let description: String?
    let template: String
    let arguments: [ActionArgumentDefinition]?
    let icons: [ActionIconDefinition]?
}

struct ActionArgumentDefinition: Codable, Equatable, Identifiable {
    let name: String
    let description: String?
    let required: Bool?

    var id: String { name }
    var isRequired: Bool { required ?? false }
}

struct ActionIconDefinition: Codable, Equatable {
    let src: String
    let mimeType: String?
    let sizes: [String]?
}

struct DisabledActionDefinition: Equatable, Identifiable {
    let id: String
    let reason: String
}

struct ActionDefinitionBuildResult: Equatable {
    let enabled: [ActionDefinition]
    let disabled: [DisabledActionDefinition]
}

struct ActionDefinition: Equatable, Identifiable {
    let id: String
    let pluginId: String
    let promptName: String
    let trigger: String
    let title: String
    let description: String?
    let template: String
    let arguments: [ActionArgumentDefinition]
    let mcpServerIds: [String]
    let icons: [ActionIconDefinition]

    static func buildActions(from manifests: [PluginManifestDefinition]) -> ActionDefinitionBuildResult {
        var enabled: [ActionDefinition] = []
        var disabled: [DisabledActionDefinition] = []
        var triggers: [String: String] = [:]

        for manifest in manifests.sorted(by: { $0.id < $1.id }) {
            guard manifest.version == 1 else {
                disabled.append(.init(id: manifest.id, reason: "unsupported plugin version"))
                continue
            }
            guard manifest.enabled != false else {
                disabled.append(contentsOf: manifest.prompts.map {
                    .init(id: "\(manifest.id)/\($0.name)", reason: "plugin disabled")
                })
                continue
            }
            guard !manifest.prompts.isEmpty else {
                disabled.append(.init(id: manifest.id, reason: "plugin prompts must not be empty"))
                continue
            }

            for prompt in manifest.prompts {
                let promptId = "\(manifest.id)/\(prompt.name)"
                let validationError = validate(manifest: manifest, prompt: prompt)
                if let validationError {
                    disabled.append(.init(id: promptId, reason: validationError))
                    continue
                }

                let normalizedTrigger = prompt.trigger.lowercased()
                if let existing = triggers[normalizedTrigger] {
                    disabled.append(.init(id: promptId, reason: "trigger conflicts with \(existing)"))
                    continue
                }

                let action = ActionDefinition(
                    id: promptId,
                    pluginId: manifest.id,
                    promptName: prompt.name,
                    trigger: prompt.trigger,
                    title: prompt.title,
                    description: prompt.description,
                    template: prompt.template,
                    arguments: prompt.arguments ?? [],
                    mcpServerIds: manifest.mcpServerIds ?? [],
                    icons: prompt.icons ?? []
                )
                triggers[normalizedTrigger] = promptId
                enabled.append(action)
            }
        }

        return ActionDefinitionBuildResult(enabled: enabled, disabled: disabled)
    }

    private static func validate(
        manifest: PluginManifestDefinition,
        prompt: PluginPromptDefinition
    ) -> String? {
        if manifest.id.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return "plugin id must not be empty"
        }
        if prompt.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return "prompt name must not be empty"
        }
        if prompt.trigger.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return "trigger must not be empty"
        }
        if prompt.trigger.contains(where: { $0.isWhitespace }) {
            return "trigger must not contain whitespace"
        }
        if prompt.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return "title must not be empty"
        }
        if prompt.template.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return "template must not be empty"
        }

        let declared = Set((prompt.arguments ?? []).map(\.name))
        for placeholder in placeholders(in: prompt.template) where !declared.contains(placeholder) {
            return "template references undeclared argument: \(placeholder)"
        }
        return nil
    }

    static func placeholders(in template: String) -> [String] {
        let pattern = #"\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}"#
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return [] }
        let nsRange = NSRange(template.startIndex..<template.endIndex, in: template)
        return regex.matches(in: template, range: nsRange).compactMap { match in
            guard let range = Range(match.range(at: 1), in: template) else { return nil }
            return String(template[range])
        }
    }
}

import AppKit
import Foundation
import KeyboardShortcuts

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
    let kind: PluginPromptKind?
    let trigger: String
    let title: String
    let description: String?
    let template: String
    let globalShortcut: ActionShortcutDefinition?
    let arguments: [ActionArgumentDefinition]?
    let icons: [ActionIconDefinition]?

    var actionKind: PluginPromptKind { kind ?? .plugin }
}

enum PluginPromptKind: String, Codable, Equatable {
    case plugin
    case skill
}

struct ActionShortcutDefinition: Codable, Equatable {
    let key: String
    let modifiers: [String]?

    var shortcut: KeyboardShortcuts.Shortcut? {
        guard let key = Self.key(named: key) else { return nil }
        return KeyboardShortcuts.Shortcut(key, modifiers: Self.modifierFlags(from: modifiers ?? []))
    }

    private static func key(named name: String) -> KeyboardShortcuts.Key? {
        switch name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "a": return .a
        case "b": return .b
        case "c": return .c
        case "d": return .d
        case "e": return .e
        case "f": return .f
        case "g": return .g
        case "h": return .h
        case "i": return .i
        case "j": return .j
        case "k": return .k
        case "l": return .l
        case "m": return .m
        case "n": return .n
        case "o": return .o
        case "p": return .p
        case "q": return .q
        case "r": return .r
        case "s": return .s
        case "t": return .t
        case "u": return .u
        case "v": return .v
        case "w": return .w
        case "x": return .x
        case "y": return .y
        case "z": return .z
        case "0", "zero": return .zero
        case "1", "one": return .one
        case "2", "two": return .two
        case "3", "three": return .three
        case "4", "four": return .four
        case "5", "five": return .five
        case "6", "six": return .six
        case "7", "seven": return .seven
        case "8", "eight": return .eight
        case "9", "nine": return .nine
        case "space": return .space
        case "tab": return .tab
        case "return", "enter": return .return
        case "escape", "esc": return .escape
        case "comma": return .comma
        case "period": return .period
        case "slash": return .slash
        case "semicolon": return .semicolon
        case "quote": return .quote
        case "minus": return .minus
        case "equal": return .equal
        case "f1": return .f1
        case "f2": return .f2
        case "f3": return .f3
        case "f4": return .f4
        case "f5": return .f5
        case "f6": return .f6
        case "f7": return .f7
        case "f8": return .f8
        case "f9": return .f9
        case "f10": return .f10
        case "f11": return .f11
        case "f12": return .f12
        default: return nil
        }
    }

    private static func modifierFlags(from names: [String]) -> NSEvent.ModifierFlags {
        names.reduce(into: NSEvent.ModifierFlags()) { flags, name in
            switch name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
            case "command", "cmd", "meta":
                flags.insert(.command)
            case "shift":
                flags.insert(.shift)
            case "option", "alt":
                flags.insert(.option)
            case "control", "ctrl":
                flags.insert(.control)
            default:
                break
            }
        }
    }
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

struct ActionPluginBinding: Equatable {
    let pluginId: String
    let promptName: String
    let mcpServerIds: [String]
}

enum ActionSubmission: Equatable {
    case appendPrompt
    case plugin(ActionPluginBinding)
}

struct ActionDefinition: Equatable, Identifiable {
    let id: String
    let trigger: String
    let title: String
    let description: String?
    let template: String
    let arguments: [ActionArgumentDefinition]
    let icons: [ActionIconDefinition]
    let defaultShortcut: KeyboardShortcuts.Shortcut?
    let submission: ActionSubmission

    var shortcutName: KeyboardShortcuts.Name {
        KeyboardShortcuts.Name("action.\(id)")
    }

    var requiresArguments: Bool {
        arguments.contains(where: \.isRequired)
    }

    var pluginBinding: ActionPluginBinding? {
        if case .plugin(let binding) = submission {
            return binding
        }
        return nil
    }

    static func skill(
        id: String,
        trigger: String,
        title: String,
        description: String?,
        template: String,
        arguments: [ActionArgumentDefinition],
        defaultShortcut: KeyboardShortcuts.Shortcut?
    ) -> ActionDefinition {
        ActionDefinition(
            id: id,
            trigger: trigger,
            title: title,
            description: description,
            template: template,
            arguments: arguments,
            icons: [],
            defaultShortcut: defaultShortcut,
            submission: .appendPrompt
        )
    }

    static func plugin(
        id: String,
        trigger: String,
        title: String,
        description: String?,
        template: String,
        arguments: [ActionArgumentDefinition],
        icons: [ActionIconDefinition],
        defaultShortcut: KeyboardShortcuts.Shortcut?,
        binding: ActionPluginBinding
    ) -> ActionDefinition {
        ActionDefinition(
            id: id,
            trigger: trigger,
            title: title,
            description: description,
            template: template,
            arguments: arguments,
            icons: icons,
            defaultShortcut: defaultShortcut,
            submission: .plugin(binding)
        )
    }

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

                let action: ActionDefinition
                switch prompt.actionKind {
                case .skill:
                    action = ActionDefinition.skill(
                        id: promptId,
                        trigger: prompt.trigger,
                        title: prompt.title,
                        description: prompt.description,
                        template: prompt.template,
                        arguments: prompt.arguments ?? [],
                        defaultShortcut: prompt.globalShortcut?.shortcut
                    )
                case .plugin:
                    action = ActionDefinition.plugin(
                        id: promptId,
                        trigger: prompt.trigger,
                        title: prompt.title,
                        description: prompt.description,
                        template: prompt.template,
                        arguments: prompt.arguments ?? [],
                        icons: prompt.icons ?? [],
                        defaultShortcut: prompt.globalShortcut?.shortcut,
                        binding: ActionPluginBinding(
                            pluginId: manifest.id,
                            promptName: prompt.name,
                            mcpServerIds: manifest.mcpServerIds ?? []
                        )
                    )
                }
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
        if prompt.globalShortcut != nil, prompt.globalShortcut?.shortcut == nil {
            return "global shortcut is invalid"
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

    static func filter(_ actions: [ActionDefinition], query: String) -> [ActionDefinition] {
        let trimmedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedQuery.isEmpty else { return actions }

        let normalizedQuery = trimmedQuery.lowercased()
        return actions.filter { action in
            action.trigger.lowercased().hasPrefix(normalizedQuery)
                || action.title.lowercased().contains(normalizedQuery)
                || (action.description?.lowercased().contains(normalizedQuery) ?? false)
        }
    }
}

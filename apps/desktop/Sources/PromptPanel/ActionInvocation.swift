import Foundation

enum ActionInvocationParseResult: Equatable {
    case plain(String)
    case partial(ActionDefinition)
    case action(ParsedActionInvocation)
}

enum ActionInvocationError: Error, Equatable {
    case missingRequiredArgument(String)
}

struct ParsedActionInvocation: Equatable {
    let action: ActionDefinition
    var values: [String: String]

    func renderedPrompt() throws -> String {
        for argument in action.arguments where argument.isRequired {
            let value = values[argument.name]?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            if value.isEmpty {
                throw ActionInvocationError.missingRequiredArgument(argument.name)
            }
        }

        return Self.render(template: action.template, values: values)
    }

    private static func render(template: String, values: [String: String]) -> String {
        let pattern = #"\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}"#
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return template }

        let mutable = NSMutableString(string: template)
        let range = NSRange(location: 0, length: mutable.length)
        let matches = regex.matches(in: template, range: range)

        for match in matches.reversed() {
            guard match.numberOfRanges > 1 else { continue }
            let key = (template as NSString).substring(with: match.range(at: 1))
            let replacement = values[key] ?? ""
            mutable.replaceCharacters(in: match.range, with: replacement)
        }

        return mutable as String
    }
}

enum ActionInvocation {
    static func parse(draft: String, actions: [ActionDefinition]) -> ActionInvocationParseResult {
        let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return .plain("") }

        let split = splitTrigger(trimmed)
        guard let action = actions.first(where: { $0.trigger.lowercased() == split.trigger.lowercased() }) else {
            return .plain(trimmed)
        }

        guard let tail = split.tail?.trimmingCharacters(in: .whitespacesAndNewlines), !tail.isEmpty else {
            return .partial(action)
        }

        let tokens = tokenize(tail)
        var values: [String: String] = [:]
        for (index, argument) in action.arguments.enumerated() where index < tokens.count {
            values[argument.name] = tokens[index]
        }
        return .action(ParsedActionInvocation(action: action, values: values))
    }

    private static func splitTrigger(_ text: String) -> (trigger: String, tail: String?) {
        guard let spaceIndex = text.firstIndex(where: { $0.isWhitespace }) else {
            return (text, nil)
        }

        let trigger = String(text[..<spaceIndex])
        let tailStart = text.index(after: spaceIndex)
        guard tailStart < text.endIndex else {
            return (trigger, nil)
        }
        return (trigger, String(text[tailStart...]))
    }

    static func tokenize(_ text: String) -> [String] {
        var tokens: [String] = []
        var current = ""
        var inQuotes = false
        var escaping = false
        var tokenStarted = false

        for character in text {
            if escaping {
                current.append(character)
                tokenStarted = true
                escaping = false
                continue
            }

            if inQuotes && character == "\\" {
                escaping = true
                continue
            }

            if character == "\"" {
                inQuotes.toggle()
                tokenStarted = true
                continue
            }

            if character.isWhitespace && !inQuotes {
                if tokenStarted {
                    tokens.append(current)
                    current = ""
                    tokenStarted = false
                }
                continue
            }

            current.append(character)
            tokenStarted = true
        }

        if tokenStarted {
            tokens.append(current)
        }

        return tokens
    }
}

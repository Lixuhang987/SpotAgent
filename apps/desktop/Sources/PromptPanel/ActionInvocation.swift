import Foundation

enum ActionInvocationParseResult: Equatable {
    case plain(String)
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

        let tail = split.tail?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let values = parseBracketArguments(tail)
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

    static func parseBracketArguments(_ text: String) -> [String: String] {
        let pattern = #"\[\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([^\]]*)\]"#
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return [:] }
        let nsRange = NSRange(text.startIndex..<text.endIndex, in: text)
        var values: [String: String] = [:]

        for match in regex.matches(in: text, range: nsRange) {
            guard
                let nameRange = Range(match.range(at: 1), in: text),
                let valueRange = Range(match.range(at: 2), in: text)
            else { continue }

            values[String(text[nameRange])] = String(text[valueRange])
                .trimmingCharacters(in: .whitespacesAndNewlines)
        }

        return values
    }
}

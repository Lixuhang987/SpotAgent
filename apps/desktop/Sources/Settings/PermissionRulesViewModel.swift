import Foundation

struct PermissionRuleEntry: Identifiable, Equatable {
    let id: String
    let toolName: String
    let decision: String
    let createdAtText: String
    let argumentsSummary: String
}

@Observable
@MainActor
final class PermissionRulesViewModel {
    private(set) var rules: [PermissionRuleEntry] = []
    private let filePath: URL

    init(homeDirectoryURL: URL = FileManager.default.homeDirectoryForCurrentUser) {
        self.filePath = homeDirectoryURL
            .appendingPathComponent(".spotAgent", isDirectory: true)
            .appendingPathComponent("permissions.json")
        reload()
    }

    func reload() {
        rules = rawRules().compactMap(Self.entry(from:))
    }

    func revoke(ruleId: String) {
        var list = rawRules()
        list.removeAll { ($0["argHash"] as? String) == ruleId }
        save(list)
        reload()
    }

    private func rawRules() -> [[String: Any]] {
        guard let data = try? Data(contentsOf: filePath),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let list = json["rules"] as? [[String: Any]] else {
            return []
        }
        return list
    }

    private func save(_ list: [[String: Any]]) {
        let json: [String: Any] = ["version": 1, "rules": list]
        guard let data = try? JSONSerialization.data(withJSONObject: json, options: [.prettyPrinted, .sortedKeys]) else {
            return
        }
        try? FileManager.default.createDirectory(
            at: filePath.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        try? data.write(to: filePath, options: .atomic)
    }

    private static func entry(from raw: [String: Any]) -> PermissionRuleEntry? {
        guard let toolName = raw["toolName"] as? String,
              let argHash = raw["argHash"] as? String,
              let decision = raw["decision"] as? String else {
            return nil
        }

        return PermissionRuleEntry(
            id: argHash,
            toolName: toolName,
            decision: decision,
            createdAtText: formatCreatedAt(raw["createdAt"] as? String),
            argumentsSummary: summarizeArguments(raw["arguments"])
        )
    }

    private static func summarizeArguments(_ value: Any?) -> String {
        guard let arguments = value as? [String: Any], !arguments.isEmpty else {
            return "参数摘要不可用：\(value == nil ? "旧规则未保存参数" : "空参数")"
        }
        return arguments.keys.sorted().map { key in
            "\(key): \(formatValue(arguments[key]))"
        }.joined(separator: "\n")
    }

    private static func formatValue(_ value: Any?) -> String {
        switch value {
        case let bool as Bool:
            return bool ? "true" : "false"
        case let string as String:
            return string
        case let number as NSNumber:
            return number.stringValue
        case let array as [Any]:
            return array.map { formatValue($0) }.joined(separator: ", ")
        case let object as [String: Any]:
            return object.keys.sorted()
                .map { "\($0): \(formatValue(object[$0]))" }
                .joined(separator: ", ")
        default:
            return String(describing: value ?? "")
        }
    }

    private static func formatCreatedAt(_ value: String?) -> String {
        guard let value,
              let date = parseISO8601Date(value) else {
            return "未知时间"
        }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd HH:mm"
        return formatter.string(from: date)
    }

    private static func parseISO8601Date(_ value: String) -> Date? {
        let fractionalFormatter = ISO8601DateFormatter()
        fractionalFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractionalFormatter.date(from: value) {
            return date
        }

        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: value)
    }
}

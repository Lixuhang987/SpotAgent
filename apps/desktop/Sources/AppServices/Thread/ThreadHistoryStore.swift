import Foundation

struct ThreadHistoryEntry: Identifiable, Equatable {
    let id: String
    let title: String?
    let createdAt: String
    let updatedAt: String
    let messageCount: Int
    let preview: String
}

struct ThreadHistoryMessage: Identifiable, Equatable {
    let id: String
    let role: String
    let text: String
}

struct ThreadHistoryDetail: Equatable {
    let entry: ThreadHistoryEntry
    let messages: [ThreadHistoryMessage]
}

final class ThreadHistoryStore {
    private let directory: URL

    init(directory: URL = ThreadHistoryStore.defaultDirectory) {
        self.directory = directory
    }

    convenience init(directory: String) {
        self.init(directory: URL(fileURLWithPath: directory, isDirectory: true))
    }

    func list() -> [ThreadHistoryEntry] {
        let files = (try? FileManager.default.contentsOfDirectory(
            at: directory,
            includingPropertiesForKeys: nil
        )) ?? []

        return files
            .filter { $0.pathExtension == "json" }
            .compactMap { loadRecord(from: $0) }
            .map { makeEntry(record: $0) }
            .sorted { $0.updatedAt > $1.updatedAt }
    }

    func load(threadID: String) -> ThreadHistoryDetail? {
        guard let record = loadRecord(from: path(for: threadID)) else { return nil }
        let entry = makeEntry(record: record)
        return ThreadHistoryDetail(
            entry: entry,
            messages: parseMessages(from: record.messages)
        )
    }

    func delete(threadID: String) {
        try? FileManager.default.removeItem(at: path(for: threadID))
    }

    static var defaultDirectory: URL {
        FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".spotAgent")
            .appendingPathComponent("threads")
    }

    private func path(for threadID: String) -> URL {
        directory.appendingPathComponent("\(threadID).json")
    }

    private func loadRecord(from url: URL) -> ThreadHistoryRecord? {
        guard
            let data = try? Data(contentsOf: url),
            let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let metadata = object["metadata"] as? [String: Any]
        else {
            return nil
        }

        let messages = object["messages"] as? [[String: Any]] ?? []
        return ThreadHistoryRecord(metadata: metadata, messages: messages)
    }

    private func makeEntry(record: ThreadHistoryRecord) -> ThreadHistoryEntry {
        let id = record.metadata["id"] as? String ?? ""
        let title = record.metadata["title"] as? String
        let createdAt = record.metadata["createdAt"] as? String ?? ""
        let updatedAt = record.metadata["updatedAt"] as? String ?? ""
        let messageCount = record.metadata["messageCount"] as? Int ?? record.messages.count
        let preview = previewText(from: record.messages) ?? title ?? id

        return ThreadHistoryEntry(
            id: id,
            title: title,
            createdAt: createdAt,
            updatedAt: updatedAt,
            messageCount: messageCount,
            preview: preview
        )
    }

    private func previewText(from messages: [[String: Any]]) -> String? {
        for (index, message) in messages.enumerated() {
            let text = extractText(from: message["content"])
                ?? message["content"] as? String
                ?? ""
            let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty {
                return normalizedPreview(trimmed)
            }
            if index == messages.count - 1 {
                return nil
            }
        }
        return nil
    }

    private func parseMessages(from messages: [[String: Any]]) -> [ThreadHistoryMessage] {
        messages.enumerated().map { index, message in
            let role = message["role"] as? String ?? "message"
            return ThreadHistoryMessage(
                id: message["id"] as? String ?? "\(role)-\(index)",
                role: message["role"] as? String ?? "unknown",
                text: extractText(from: message["content"])
                    ?? message["content"] as? String
                    ?? ""
            )
        }
    }

    private func extractText(from content: Any?) -> String? {
        if let text = content as? String {
            return text
        }

        guard let array = content as? [[String: Any]] else {
            return nil
        }

        let parts = array.compactMap { part -> String? in
            guard let type = part["type"] as? String, type == "text" else { return nil }
            return part["text"] as? String
        }
        let joined = parts.joined()
        return joined.isEmpty ? nil : joined
    }

    private func normalizedPreview(_ text: String) -> String {
        let firstLine = text.split(whereSeparator: \.isNewline).first.map(String.init) ?? text
        if firstLine.count > 72 {
            return String(firstLine.prefix(72)) + "…"
        }
        return firstLine
    }
}

private struct ThreadHistoryRecord {
    let metadata: [String: Any]
    let messages: [[String: Any]]
}

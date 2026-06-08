import Foundation

enum AgentActivityStatus: String, Decodable {
    case idle
    case starting
    case running
    case toolRunning = "tool_running"
    case waiting
    case completed
    case error

    var isActive: Bool {
        switch self {
        case .starting, .running, .toolRunning, .waiting:
            true
        case .idle, .completed, .error:
            false
        }
    }
}

struct AgentActivityEvent: Decodable, Equatable {
    let channel: String
    let type: String
    let activeThreadId: String?
    let status: AgentActivityStatus
    let latestSummary: String?
    let updatedAt: String

    var updatedAtDate: Date {
        Self.parseDate(updatedAt) ?? .now
    }

    var isActivityEvent: Bool {
        channel == "activity" && (type == "activity.snapshot" || type == "activity.changed")
    }

    private static func parseDate(_ value: String) -> Date? {
        let fractionalFormatter = ISO8601DateFormatter()
        fractionalFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractionalFormatter.date(from: value) {
            return date
        }
        let plainFormatter = ISO8601DateFormatter()
        plainFormatter.formatOptions = [.withInternetDateTime]
        return plainFormatter.date(from: value)
    }
}

@MainActor
final class AgentActivityConnectionClient {
    private let connection: AppServerConnection
    private let registry: ThreadRegistry
    private let decoder = JSONDecoder()

    init(connection: AppServerConnection, registry: ThreadRegistry) {
        self.connection = connection
        self.registry = registry
        connection.onTextMessage = { [weak self] text in
            Task { @MainActor in
                self?.handle(raw: text)
            }
        }
    }

    func connect() {
        connection.connect()
    }

    func disconnect() {
        connection.disconnect()
    }

    private func handle(raw: String) {
        guard
            let data = raw.data(using: .utf8),
            let event = try? decoder.decode(AgentActivityEvent.self, from: data),
            event.isActivityEvent
        else {
            return
        }

        registry.apply(activity: event)
    }
}

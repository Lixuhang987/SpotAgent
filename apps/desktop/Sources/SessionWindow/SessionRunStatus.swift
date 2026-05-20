import Foundation

enum SessionRunStatus: String, Codable, Equatable {
    case idle
    case running
    case failed
    case interrupted

    var isRunning: Bool {
        self == .running
    }

    var clearsError: Bool {
        self != .failed
    }

    static func fromProtocolStatus(_ value: String) -> SessionRunStatus {
        if value == "completed" {
            return .idle
        }
        return SessionRunStatus(rawValue: value) ?? .idle
    }
}

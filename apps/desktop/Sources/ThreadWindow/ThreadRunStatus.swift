import Foundation

enum ThreadRunStatus: String, Codable, Equatable {
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

    static func fromProtocolStatus(_ value: String) -> ThreadRunStatus {
        if value == "completed" {
            return .idle
        }
        return ThreadRunStatus(rawValue: value) ?? .idle
    }
}

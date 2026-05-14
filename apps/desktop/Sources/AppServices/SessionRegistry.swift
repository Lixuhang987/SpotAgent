import Combine
import Foundation

struct SessionSummary: Equatable {
    let sessionId: String
    let isRunning: Bool
    let latestSummary: String
    let lastActiveAt: Date
    let windowIsOpen: Bool
}

@MainActor
final class SessionRegistry: ObservableObject {
    @Published private(set) var summaries: [String: SessionSummary] = [:]
    @Published private(set) var recentSessionIDs: [String] = []

    func upsert(_ summary: SessionSummary) {
        summaries[summary.sessionId] = summary
        recentSessionIDs.removeAll { $0 == summary.sessionId }
        recentSessionIDs.insert(summary.sessionId, at: 0)
    }

    var primarySessionID: String? {
        recentSessionIDs.first {
            summaries[$0]?.isRunning == true && summaries[$0]?.windowIsOpen == true
        } ?? recentSessionIDs.first {
            summaries[$0]?.windowIsOpen == true
        }
    }
}

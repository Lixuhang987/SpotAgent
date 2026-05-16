import Foundation

struct SessionSummary: Equatable {
    let sessionId: String
    let isRunning: Bool
    let latestSummary: String
    let lastActiveAt: Date
    let windowIsOpen: Bool
}

@Observable
@MainActor
final class SessionRegistry {
    private(set) var summaries: [String: SessionSummary] = [:]
    private(set) var recentSessionIDs: [String] = []

    func upsert(_ summary: SessionSummary) {
        summaries[summary.sessionId] = summary
        recentSessionIDs = summaries.values
            .sorted { $0.lastActiveAt > $1.lastActiveAt }
            .map(\.sessionId)
    }

    var primarySessionID: String? {
        recentSessionIDs.first {
            summaries[$0]?.isRunning == true && summaries[$0]?.windowIsOpen == true
        } ?? recentSessionIDs.first {
            summaries[$0]?.windowIsOpen == true
        }
    }
}

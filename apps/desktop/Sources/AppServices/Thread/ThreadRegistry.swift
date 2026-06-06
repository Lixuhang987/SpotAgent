import Foundation

struct ThreadSummary: Equatable {
    let threadId: String
    let isRunning: Bool
    let latestSummary: String
    let lastActiveAt: Date
    let windowIsOpen: Bool
}

@Observable
@MainActor
final class ThreadRegistry {
    private(set) var summaries: [String: ThreadSummary] = [:]
    private(set) var recentThreadIDs: [String] = []

    func upsert(_ summary: ThreadSummary) {
        summaries[summary.threadId] = summary
        recentThreadIDs = summaries.values
            .sorted { $0.lastActiveAt > $1.lastActiveAt }
            .map(\.threadId)
    }

    var primaryThreadID: String? {
        recentThreadIDs.first {
            summaries[$0]?.isRunning == true && summaries[$0]?.windowIsOpen == true
        } ?? recentThreadIDs.first {
            summaries[$0]?.windowIsOpen == true
        }
    }
}

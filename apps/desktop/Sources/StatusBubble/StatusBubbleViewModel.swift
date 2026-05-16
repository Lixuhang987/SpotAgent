import Foundation

@Observable
@MainActor
final class StatusBubbleViewModel {
    @ObservationIgnored private let registry: SessionRegistry

    var onTap: ((String?) -> Void)?

    var isRunning: Bool {
        primarySummary?.isRunning ?? false
    }

    var latestSummary: String {
        primarySummary?.latestSummary ?? "点击开始"
    }

    init(registry: SessionRegistry) {
        self.registry = registry
    }

    func tap() {
        onTap?(registry.primarySessionID)
    }

    private var primarySummary: SessionSummary? {
        registry.primarySessionID.flatMap { registry.summaries[$0] }
    }
}

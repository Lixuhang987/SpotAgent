import Foundation

@Observable
@MainActor
final class StatusBubbleViewModel {
    @ObservationIgnored private let registry: ThreadRegistry

    var onTap: ((String?) -> Void)?

    var isRunning: Bool {
        primarySummary?.isRunning ?? false
    }

    var latestSummary: String {
        primarySummary?.latestSummary ?? "点击开始"
    }

    init(registry: ThreadRegistry) {
        self.registry = registry
    }

    func tap() {
        onTap?(registry.primaryThreadID)
    }

    private var primarySummary: ThreadSummary? {
        registry.primaryThreadID.flatMap { registry.summaries[$0] }
    }
}

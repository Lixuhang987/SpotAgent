import Foundation

@Observable
@MainActor
final class SessionHistoryViewModel {
    var query = "" {
        didSet { reconcileSelection() }
    }
    private(set) var items: [SessionHistoryEntry] = []
    private(set) var selectedSessionID: String?
    private(set) var selectedDetail: SessionHistoryDetail?
    private(set) var pendingDeletionID: String?
    private(set) var errorMessage: String?

    var onRestore: ((String) -> Void)?

    @ObservationIgnored private let store: SessionHistoryStore

    var filteredItems: [SessionHistoryEntry] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return items }
        let normalized = trimmed.lowercased()

        return items.filter { item in
            item.id.lowercased().contains(normalized)
                || (item.title?.lowercased().contains(normalized) ?? false)
                || item.preview.lowercased().contains(normalized)
        }
    }

    init(store: SessionHistoryStore) {
        self.store = store
    }

    func refresh() {
        items = store.list()
        reconcileSelection()
    }

    func select(_ sessionID: String) {
        selectedSessionID = sessionID
        selectedDetail = store.load(sessionID: sessionID)
    }

    func restore(_ sessionID: String) {
        onRestore?(sessionID)
    }

    func restoreSelected() {
        guard let selectedSessionID else { return }
        restore(selectedSessionID)
    }

    func requestDelete(_ sessionID: String) {
        pendingDeletionID = sessionID
    }

    func cancelDelete() {
        pendingDeletionID = nil
    }

    func confirmDelete() {
        guard let sessionID = pendingDeletionID else { return }
        store.delete(sessionID: sessionID)
        pendingDeletionID = nil

        if selectedSessionID == sessionID {
            selectedSessionID = nil
            selectedDetail = nil
        }

        refresh()
    }

    private func reconcileSelection() {
        let visibleItems = filteredItems

        guard let selectedSessionID else {
            if let first = visibleItems.first {
                select(first.id)
            } else {
                selectedDetail = nil
            }
            return
        }

        guard visibleItems.contains(where: { $0.id == selectedSessionID }) else {
            if let first = visibleItems.first {
                select(first.id)
            } else {
                self.selectedSessionID = nil
                selectedDetail = nil
            }
            return
        }

        if selectedDetail?.entry.id != selectedSessionID {
            selectedDetail = store.load(sessionID: selectedSessionID)
        }
    }
}

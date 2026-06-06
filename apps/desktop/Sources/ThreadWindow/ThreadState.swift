import Foundation

struct ThreadState: Equatable, Identifiable {
    let id: String
    var preview: String?
    var title: String?
    var status: ThreadRunStatus = .idle
    var createdAt: Date?
    var updatedAt: Date?
    var workspaceID: String?
    var actionBinding: ActionBindingPayload?
    var isInvalid = false
    var invalidReason: String?

    var pendingRequestCount: Int { 0 }

    init(threadID: String) {
        self.id = threadID
    }
}

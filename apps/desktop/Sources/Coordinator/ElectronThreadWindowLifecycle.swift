import Foundation

@Observable
@MainActor
final class ElectronThreadWindowLifecycle: ThreadWindowManaging {
    var webHost: ThreadWindowWebHost? { nil }

    @ObservationIgnored private let client: any ThreadWindowCommanding
    @ObservationIgnored private var isOpen = false
    @ObservationIgnored private var onClosed: (@MainActor () -> Void)?

    init(client: any ThreadWindowCommanding) {
        self.client = client
        self.client.onThreadWindowClosed = { [weak self] in
            self?.handleClosed()
        }
    }

    func prepareForPromptPanel() {
        try? client.prepareThreadWindow()
    }

    func openOrFocusHistory(onClosed: @escaping @MainActor () -> Void) {
        self.onClosed = onClosed
        do {
            try client.openHistory()
            isOpen = true
        } catch {
            isOpen = false
        }
    }

    func createTabWithInitialPrompt(
        _ prompt: PromptSubmission,
        onClosed: @escaping @MainActor () -> Void
    ) {
        self.onClosed = onClosed
        do {
            try client.openInitialPrompt(prompt)
            isOpen = true
        } catch {
            isOpen = false
        }
    }

    func focus(threadID: String?) -> Bool {
        guard isOpen else { return false }
        do {
            try client.focus(threadId: threadID)
            return true
        } catch {
            return false
        }
    }

    func close() {
        isOpen = false
        onClosed = nil
    }

    private func handleClosed() {
        guard isOpen else { return }
        isOpen = false
        let callback = onClosed
        onClosed = nil
        callback?()
    }
}

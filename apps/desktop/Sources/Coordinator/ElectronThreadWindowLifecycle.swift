import Foundation

@Observable
@MainActor
final class ElectronThreadWindowLifecycle: ThreadWindowManaging {
    var webHost: ThreadWindowWebHost? { nil }

    @ObservationIgnored private let client: any ThreadWindowCommanding
    @ObservationIgnored private var isOpen = false
    @ObservationIgnored private var onClosed: (@MainActor () -> Void)?
    @ObservationIgnored private var pendingOpenCallbacks: [String: PendingOpenCallbacks] = [:]
    @ObservationIgnored private var pendingFocusFailures: [String: @MainActor () -> Void] = [:]

    init(client: any ThreadWindowCommanding) {
        self.client = client
        self.client.onThreadWindowClosed = { [weak self] in
            self?.handleClosed()
        }
        self.client.onCommandResult = { [weak self] result in
            self?.handleCommandResult(result)
        }
    }

    func prepareForPromptPanel() {
        try? client.prepareThreadWindow()
    }

    func openOrFocusHistory(
        onOpened: @escaping @MainActor () -> Void,
        onFailed: @escaping @MainActor (String) -> Void,
        onClosed: @escaping @MainActor () -> Void
    ) {
        self.onClosed = onClosed
        do {
            let commandId = try client.openHistory()
            pendingOpenCallbacks[commandId] = PendingOpenCallbacks(
                onOpened: onOpened,
                onFailed: onFailed
            )
        } catch {
            isOpen = false
            onFailed(error.localizedDescription)
        }
    }

    func createTabWithInitialPrompt(
        _ prompt: PromptSubmission,
        onOpened: @escaping @MainActor () -> Void,
        onFailed: @escaping @MainActor (String) -> Void,
        onClosed: @escaping @MainActor () -> Void
    ) {
        self.onClosed = onClosed
        do {
            let commandId = try client.openInitialPrompt(prompt)
            pendingOpenCallbacks[commandId] = PendingOpenCallbacks(
                onOpened: onOpened,
                onFailed: onFailed
            )
        } catch {
            isOpen = false
            onFailed(error.localizedDescription)
        }
    }

    func focus(threadID: String?, onFailure: @escaping @MainActor () -> Void = {}) -> Bool {
        guard isOpen else { return false }
        do {
            let commandId = try client.focus(threadId: threadID)
            pendingFocusFailures[commandId] = onFailure
            return true
        } catch {
            return false
        }
    }

    func close() {
        isOpen = false
        onClosed = nil
        pendingOpenCallbacks.removeAll()
        pendingFocusFailures.removeAll()
    }

    private func handleClosed() {
        guard isOpen else { return }
        isOpen = false
        pendingOpenCallbacks.removeAll()
        pendingFocusFailures.removeAll()
        let callback = onClosed
        onClosed = nil
        callback?()
    }

    private func handleCommandResult(_ result: ThreadWindowCommandResult) {
        switch result.kind {
        case .openInitialPrompt, .openHistory:
            guard let callbacks = pendingOpenCallbacks.removeValue(forKey: result.commandId) else {
                return
            }
            if result.ok {
                isOpen = true
                callbacks.onOpened()
            } else {
                isOpen = false
                callbacks.onFailed(result.error ?? "Electron ThreadWindow command failed")
            }
        case .focus:
            guard let onFailure = pendingFocusFailures.removeValue(forKey: result.commandId) else {
                return
            }
            if !result.ok {
                isOpen = false
                onFailure()
            }
        case .prepare:
            break
        }
    }
}

private struct PendingOpenCallbacks {
    let onOpened: @MainActor () -> Void
    let onFailed: @MainActor (String) -> Void
}

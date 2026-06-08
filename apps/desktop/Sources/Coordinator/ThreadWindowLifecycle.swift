import AppKit
import Foundation

@Observable
@MainActor
final class ThreadWindowLifecycle: ThreadWindowManaging {
    private(set) var webHost: ThreadWindowWebHost?

    @ObservationIgnored private let threadWebSocketURL: URL
    @ObservationIgnored private let webAppURL: URL
    @ObservationIgnored private let windowPresenter: any ThreadWindowPresenting
    @ObservationIgnored private let activationPolicy: AppActivationPolicyCoordinator
    @ObservationIgnored private let setActivationPolicy: @MainActor (NSApplication.ActivationPolicy) -> Void
    @ObservationIgnored private var window: NSWindow?
    @ObservationIgnored private var visibleWindowIsOpen = false

    init(
        threadWebSocketURL: URL,
        webAppURL: URL,
        windowPresenter: any ThreadWindowPresenting,
        activationPolicy: AppActivationPolicyCoordinator,
        setActivationPolicy: @escaping @MainActor (NSApplication.ActivationPolicy) -> Void
    ) {
        self.threadWebSocketURL = threadWebSocketURL
        self.webAppURL = webAppURL
        self.windowPresenter = windowPresenter
        self.activationPolicy = activationPolicy
        self.setActivationPolicy = setActivationPolicy
        setActivationPolicy(activationPolicy.policyAfterUpdatingOpenThreadWindows(by: 0))
    }

    func openOrFocusHistory(
        onOpened: @escaping @MainActor () -> Void,
        onFailed: @escaping @MainActor (String) -> Void,
        onClosed: @escaping @MainActor () -> Void
    ) {
        _ = ensureVisibleWindow(onClosed: onClosed)
        onOpened()
    }

    func createTabWithInitialPrompt(
        _ prompt: PromptSubmission,
        onOpened: @escaping @MainActor () -> Void,
        onFailed: @escaping @MainActor (String) -> Void,
        onClosed: @escaping @MainActor () -> Void
    ) {
        ensureVisibleWindow(onClosed: onClosed).enqueue(initialPrompt: prompt)
        onOpened()
    }

    func createNewTabWithInitialPrompt(
        _ prompt: PromptSubmission,
        onClosed: @escaping @MainActor () -> Void
    ) {
        createTabWithInitialPrompt(
            prompt,
            onOpened: {},
            onFailed: { _ in },
            onClosed: onClosed
        )
    }

    @discardableResult
    func focus(threadID: String? = nil, onFailure: @escaping @MainActor () -> Void = {}) -> Bool {
        guard let window else { return false }
        show(window)
        return true
    }

    func close() {
        webHost = nil
        window = nil
        if visibleWindowIsOpen {
            visibleWindowIsOpen = false
            setActivationPolicy(activationPolicy.policyAfterUpdatingOpenThreadWindows(by: -1))
        }
    }

    private func ensureVisibleWindow(onClosed: @escaping @MainActor () -> Void) -> ThreadWindowWebHost {
        let host = ensurePreparedWindow(onClosed: onClosed)
        if let window {
            show(window)
        }
        return host
    }

    private func ensurePreparedWindow(onClosed: @escaping @MainActor () -> Void) -> ThreadWindowWebHost {
        let host: ThreadWindowWebHost
        if let webHost {
            host = webHost
        } else {
            host = ThreadWindowWebHost(
                threadWebSocketURL: threadWebSocketURL,
                webAppURL: webAppURL
            )
            webHost = host
        }

        guard window == nil else { return host }
        window = windowPresenter.makeWindow(host: host) {
            Task { @MainActor in onClosed() }
        }
        return host
    }

    private func show(_ window: NSWindow) {
        windowPresenter.show(window: window)
        if !visibleWindowIsOpen {
            visibleWindowIsOpen = true
            setActivationPolicy(activationPolicy.policyAfterUpdatingOpenThreadWindows(by: 1))
        }
    }
}

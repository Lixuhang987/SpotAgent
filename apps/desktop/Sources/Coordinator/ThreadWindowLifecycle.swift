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
        _ = ensureWindow(onClosed: onClosed)
        onOpened()
    }

    func createTabWithInitialPrompt(
        _ prompt: PromptSubmission,
        onOpened: @escaping @MainActor () -> Void,
        onFailed: @escaping @MainActor (String) -> Void,
        onClosed: @escaping @MainActor () -> Void
    ) {
        ensureWindow(onClosed: onClosed).enqueue(initialPrompt: prompt)
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
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        return true
    }

    func close() {
        webHost = nil
        if window != nil {
            window = nil
            setActivationPolicy(activationPolicy.policyAfterUpdatingOpenThreadWindows(by: -1))
        }
    }

    private func ensureWindow(onClosed: @escaping @MainActor () -> Void) -> ThreadWindowWebHost {
        if let window, let webHost {
            window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return webHost
        }

        let host = ThreadWindowWebHost(
            threadWebSocketURL: threadWebSocketURL,
            webAppURL: webAppURL
        )
        webHost = host
        window = windowPresenter.present(host: host) {
            Task { @MainActor in onClosed() }
        }
        if window != nil {
            setActivationPolicy(activationPolicy.policyAfterUpdatingOpenThreadWindows(by: 1))
        }
        return host
    }
}

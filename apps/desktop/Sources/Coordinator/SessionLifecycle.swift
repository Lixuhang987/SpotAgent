import AppKit
import Foundation

@Observable
@MainActor
final class SessionLifecycle {
    private(set) var viewModels: [String: SessionViewModel] = [:]

    @ObservationIgnored private let registry: SessionRegistry
    @ObservationIgnored private let windowPresenter: any SessionWindowPresenting
    @ObservationIgnored private let agentServerURL: URL
    @ObservationIgnored private let activationPolicy: AppActivationPolicyCoordinator
    @ObservationIgnored private let setActivationPolicy: @MainActor (NSApplication.ActivationPolicy) -> Void
    @ObservationIgnored private var windows: [String: NSWindow] = [:]

    init(
        registry: SessionRegistry,
        windowPresenter: any SessionWindowPresenting,
        agentServerURL: URL,
        activationPolicy: AppActivationPolicyCoordinator,
        setActivationPolicy: @escaping @MainActor (NSApplication.ActivationPolicy) -> Void
    ) {
        self.registry = registry
        self.windowPresenter = windowPresenter
        self.agentServerURL = agentServerURL
        self.activationPolicy = activationPolicy
        self.setActivationPolicy = setActivationPolicy
        // "0 个会话窗口"语义：把现有 bootstrap 里的初始策略调用下沉到这里。
        setActivationPolicy(activationPolicy.policyAfterUpdatingOpenSessionWindows(by: 0))
    }
}

import AppKit
import Foundation
import SwiftUI

@MainActor
protocol SessionWindowPresenting {
    func present(
        sessionID: String,
        viewModel: SessionViewModel,
        onClose: @escaping () -> Void
    ) -> NSWindow?
}

@MainActor
protocol HotkeyRegistering {
    func registerShowPromptPanel(handler: @escaping () -> Void)
    func registerCaptureSelection(handler: @escaping () -> Void)
    func registerCaptureRegion(handler: @escaping () -> Void)
}

@MainActor
final class AppServices {
    let agentServer: any AgentServerStarting
    let sessionRegistry: SessionRegistry
    let settingsStore: AgentSettingsStore
    let agentServerURL: URL
    let platformBridgeFactory: @MainActor (URL) -> (any PlatformBridgeRunning)?
    let hotkeyRegistrar: any HotkeyRegistering
    let sessionWindowPresenter: any SessionWindowPresenting
    let setActivationPolicy: @MainActor (NSApplication.ActivationPolicy) -> Void
    let settingsWindowFactory: (@MainActor () -> NSWindow)?
    let showsStatusBubble: Bool

    init(
        agentServer: any AgentServerStarting = AgentServerService(),
        sessionRegistry: SessionRegistry = SessionRegistry(),
        settingsStore: AgentSettingsStore = AgentSettingsStore(),
        agentServerURL: URL = URL(string: "ws://127.0.0.1:4317/api/session")!,
        platformBridgeFactory: @escaping @MainActor (URL) -> (any PlatformBridgeRunning)? = { url in
            PlatformBridgeService(serverURL: url)
        },
        hotkeyRegistrar: any HotkeyRegistering = ProductionHotkeyRegistrar(),
        sessionWindowPresenter: any SessionWindowPresenting = ProductionSessionWindowPresenter(),
        setActivationPolicy: @escaping @MainActor (NSApplication.ActivationPolicy) -> Void = {
            NSApplication.shared.setActivationPolicy($0)
        },
        settingsWindowFactory: (@MainActor () -> NSWindow)? = nil,
        showsStatusBubble: Bool = true
    ) {
        self.agentServer = agentServer
        self.sessionRegistry = sessionRegistry
        self.settingsStore = settingsStore
        self.agentServerURL = agentServerURL
        self.platformBridgeFactory = platformBridgeFactory
        self.hotkeyRegistrar = hotkeyRegistrar
        self.sessionWindowPresenter = sessionWindowPresenter
        self.setActivationPolicy = setActivationPolicy
        self.settingsWindowFactory = settingsWindowFactory
        self.showsStatusBubble = showsStatusBubble
    }

    static func testing(
        setActivationPolicy: @escaping @MainActor (NSApplication.ActivationPolicy) -> Void = { _ in },
        settingsWindowFactory: (@MainActor () -> NSWindow)? = nil
    ) -> AppServices {
        AppServices(
            agentServer: NopAgentServerService(),
            agentServerURL: URL(string: "ws://127.0.0.1:0/noop")!,
            platformBridgeFactory: { _ in nil },
            hotkeyRegistrar: NopHotkeyRegistrar(),
            sessionWindowPresenter: NopSessionWindowPresenter(),
            setActivationPolicy: setActivationPolicy,
            settingsWindowFactory: settingsWindowFactory,
            showsStatusBubble: false
        )
    }
}

@MainActor
final class NopAgentServerService: AgentServerStarting {
    var lastStartupError: String?
    var fatalErrorMessage: String?
    var isAvailable = false
    var onAvailabilityChange: ((Bool) -> Void)?
    var onFatalError: ((String) -> Void)?
    func start() throws {}
    func stop() {}
}

@MainActor
final class NopHotkeyRegistrar: HotkeyRegistering {
    func registerShowPromptPanel(handler: @escaping () -> Void) {}
    func registerCaptureSelection(handler: @escaping () -> Void) {}
    func registerCaptureRegion(handler: @escaping () -> Void) {}
}

@MainActor
final class NopSessionWindowPresenter: SessionWindowPresenting {
    func present(sessionID: String, viewModel: SessionViewModel, onClose: @escaping () -> Void) -> NSWindow? {
        nil
    }
}

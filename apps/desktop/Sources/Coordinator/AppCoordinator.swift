import AppKit
import Foundation
import SwiftUI

@Observable
@MainActor
final class AppCoordinator {
    enum Action {
        case showPromptPanel
        case hidePromptPanel
        case togglePromptPanel
        case submitPrompt(String, attachments: [PromptAttachmentResult])
        case submitAction(PromptAction)
        case openSettings
        case settingsWindowClosed
        case sessionClosed(String)
        case statusBubbleTapped(String?)
    }

    private(set) var sessionViewModels: [String: SessionViewModel] = [:]
    var agentServerError: String? { agentServerHealth.errorMessage }

    @ObservationIgnored private let services: AppServices
    @ObservationIgnored private let agentServerHealth: AgentServerHealth
    @ObservationIgnored private var platformBridgeService: (any PlatformBridgeRunning)?
    @ObservationIgnored private let activationPolicy = AppActivationPolicyCoordinator()
    @ObservationIgnored private lazy var promptPanelController = PromptPanelController()
    @ObservationIgnored private lazy var statusBubbleController: StatusBubbleController = {
        StatusBubbleController(registry: services.sessionRegistry)
    }()

    @ObservationIgnored private lazy var promptActions: [PromptAction] = [
        PromptAction(
            id: "open-settings",
            title: "打开设置",
            keywords: ["settings", "preferences", "shortcut", "hotkey"],
            defaultShortcut: .init(.comma, modifiers: [.command]),
            perform: { [weak self] in
                self?.send(.openSettings)
            }
        )
    ]

    @ObservationIgnored private var sessionWindows: [String: NSWindow] = [:]
    @ObservationIgnored private var settingsWindow: NSWindow?

    convenience init() {
        self.init(services: AppServices())
    }

    init(services: AppServices) {
        self.services = services
        self.agentServerHealth = AgentServerHealth(
            agentServer: services.agentServer,
            fatalAlertPresenter: services.fatalAlertPresenter,
            showsFatalAlert: services.showsStatusBubble
        )
        bootstrap()
    }

    func bootstrap() {
        services.setActivationPolicy(activationPolicy.policyAfterUpdatingOpenSessionWindows(by: 0))
        setupPromptPanel()
        setupHotkey()
        setupStatusBubble()
        agentServerHealth.start()
        startPlatformBridge()
        if services.showsStatusBubble {
            statusBubbleController.show()
        }
    }

    func shutdown() {
        platformBridgeService?.stop()
        platformBridgeService = nil
        agentServerHealth.stop()
        settingsWindow?.close()
        settingsWindow = nil
        sessionWindows.values.forEach { $0.close() }
        sessionWindows.removeAll()
    }

    func send(_ action: Action) {
        switch action {
        case .showPromptPanel:
            promptPanelController.show()
        case .hidePromptPanel:
            promptPanelController.hide()
        case .togglePromptPanel:
            promptPanelController.toggle()
        case .submitPrompt(let draft, let attachments):
            handleSubmitPrompt(draft, attachments: attachments)
        case .submitAction(let action):
            action.perform()
            promptPanelController.hide()
        case .openSettings:
            openOrFocusSettingsWindow()
        case .settingsWindowClosed:
            handleSettingsWindowClosed()
        case .sessionClosed(let sessionID):
            handleSessionClosed(sessionID)
        case .statusBubbleTapped(let sessionID):
            handleStatusBubbleTap(sessionID)
        }
    }

    func makeSettingsViewModel() -> AgentSettingsViewModel {
        AgentSettingsViewModel(store: services.settingsStore)
    }

    func makeShortcutActions() -> [PromptAction] {
        promptActions
    }

    private func setupPromptPanel() {
        promptPanelController.register(actions: promptActions)
        promptPanelController.setSelectionProvider(MacSelectionCaptureProvider())
        promptPanelController.onSubmit = { [weak self] draft, attachments in
            self?.send(.submitPrompt(draft, attachments: attachments))
        }
        promptPanelController.onOpenSettings = { [weak self] in
            self?.send(.openSettings)
        }
    }

    private func setupHotkey() {
        services.hotkeyRegistrar.registerShowPromptPanel { [weak self] in
            Task { @MainActor in self?.send(.togglePromptPanel) }
        }
        services.hotkeyRegistrar.registerCaptureSelection { [weak self] in
            Task { @MainActor in await self?.captureCoordinator.captureSelectionAndShow() }
        }
        services.hotkeyRegistrar.registerCaptureRegion { [weak self] in
            Task { @MainActor in await self?.captureCoordinator.captureRegionAndShow() }
        }
    }

    @ObservationIgnored private lazy var captureCoordinator = PromptCaptureCoordinator(
        controller: promptPanelController,
        selectionProvider: MacSelectionCaptureProvider(),
        regionProvider: MacRegionCaptureProvider()
    )

    private func setupStatusBubble() {
        statusBubbleController.onTap = { [weak self] sessionID in
            self?.send(.statusBubbleTapped(sessionID))
        }
    }

    private func startPlatformBridge() {
        guard let bridge = services.platformBridgeFactory(services.agentServerURL) else { return }
        platformBridgeService = bridge
        bridge.start()
    }

    private func handleSubmitPrompt(_ draft: String, attachments: [PromptAttachmentResult]) {
        guard let prompt = PromptSubmission.compose(draft: draft, attachments: attachments) else { return }

        let sessionID = UUID().uuidString
        let viewModel = SessionViewModel(
            sessionID: sessionID,
            socketClient: SessionSocketClient(serverURL: services.agentServerURL)
        )

        sessionViewModels[sessionID] = viewModel
        services.sessionRegistry.upsert(
            SessionSummary(
                sessionId: sessionID,
                isRunning: true,
                latestSummary: prompt.summary,
                lastActiveAt: .now,
                windowIsOpen: true
            )
        )

        promptPanelController.hide()

        if let window = services.sessionWindowPresenter.present(
            sessionID: sessionID,
            viewModel: viewModel,
            onClose: { [weak self] in
                Task { @MainActor in self?.send(.sessionClosed(sessionID)) }
            }
        ) {
            sessionWindows[sessionID] = window
            services.setActivationPolicy(activationPolicy.policyAfterUpdatingOpenSessionWindows(by: 1))
        }

        viewModel.start(
            initialPrompt: prompt.composed,
            attachments: prompt.socketAttachments,
            startupError: agentServerError
        )
    }

    private func handleSessionClosed(_ sessionID: String) {
        let viewModel = sessionViewModels.removeValue(forKey: sessionID)
        viewModel?.stop()

        if sessionWindows.removeValue(forKey: sessionID) != nil {
            services.setActivationPolicy(activationPolicy.policyAfterUpdatingOpenSessionWindows(by: -1))
        }

        services.sessionRegistry.upsert(
            SessionSummary(
                sessionId: sessionID,
                isRunning: viewModel?.status == "running",
                latestSummary: viewModel?.messages.last?.text ?? "",
                lastActiveAt: .now,
                windowIsOpen: false
            )
        )
    }

    private func handleStatusBubbleTap(_ sessionID: String?) {
        if let sessionID, let window = sessionWindows[sessionID] {
            window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }
        promptPanelController.show()
    }

    private func openOrFocusSettingsWindow() {
        services.setActivationPolicy(activationPolicy.policyAfterUpdatingSettingsWindow(isOpen: true))

        if let settingsWindow {
            settingsWindow.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }

        settingsWindow = services.settingsWindowPresenter.present(
            settingsViewModel: makeSettingsViewModel(),
            workspaceViewModel: WorkspaceSettingsViewModel(),
            shortcutActions: makeShortcutActions(),
            onClose: { [weak self] in
                Task { @MainActor in self?.send(.settingsWindowClosed) }
            }
        )
    }

    private func handleSettingsWindowClosed() {
        settingsWindow = nil
        services.setActivationPolicy(activationPolicy.policyAfterUpdatingSettingsWindow(isOpen: false))
    }
}

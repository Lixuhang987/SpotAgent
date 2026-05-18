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

    var sessionViewModels: [String: SessionViewModel] { sessionLifecycle.viewModels }
    var agentServerError: String? { agentServerHealth.errorMessage }

    @ObservationIgnored private let services: AppServices
    @ObservationIgnored private let agentServerHealth: AgentServerHealth
    @ObservationIgnored private let sessionLifecycle: SessionLifecycle
    @ObservationIgnored private let settingsLifecycle: SettingsLifecycle
    @ObservationIgnored private let activationPolicy = AppActivationPolicyCoordinator()
    @ObservationIgnored private var platformBridgeService: (any PlatformBridgeRunning)?
    @ObservationIgnored private lazy var promptPanelController = PromptPanelController()
    @ObservationIgnored private lazy var statusBubbleController: StatusBubbleController = {
        StatusBubbleController(registry: services.sessionRegistry)
    }()
    @ObservationIgnored private lazy var captureCoordinator = PromptCaptureCoordinator(
        controller: promptPanelController,
        selectionProvider: MacSelectionCaptureProvider(),
        regionProvider: MacRegionCaptureProvider()
    )
    @ObservationIgnored private lazy var promptActions: [PromptAction] = [
        PromptAction(
            id: "open-settings",
            title: "打开设置",
            keywords: ["settings", "preferences", "shortcut", "hotkey"],
            defaultShortcut: .init(.comma, modifiers: [.command]),
            perform: { [weak self] in self?.send(.openSettings) }
        )
    ]

    convenience init() { self.init(services: AppServices()) }

    init(services: AppServices) {
        self.services = services
        self.agentServerHealth = AgentServerHealth(
            agentServer: services.agentServer,
            fatalAlertPresenter: services.fatalAlertPresenter,
            showsFatalAlert: services.showsStatusBubble
        )
        self.sessionLifecycle = SessionLifecycle(
            registry: services.sessionRegistry,
            windowPresenter: services.sessionWindowPresenter,
            agentServerURL: services.agentServerURL,
            activationPolicy: activationPolicy,
            setActivationPolicy: services.setActivationPolicy
        )
        self.settingsLifecycle = SettingsLifecycle(
            windowPresenter: services.settingsWindowPresenter,
            activationPolicy: activationPolicy,
            setActivationPolicy: services.setActivationPolicy
        )
        bootstrap()
    }

    func bootstrap() {
        setupPromptPanel()
        setupHotkey()
        setupStatusBubble()
        agentServerHealth.start()
        startPlatformBridge()
        if services.showsStatusBubble { statusBubbleController.show() }
    }

    func shutdown() {
        platformBridgeService?.stop()
        platformBridgeService = nil
        agentServerHealth.stop()
        settingsLifecycle.close()
        sessionLifecycle.closeAll()
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
            handleOpenSettings()
        case .settingsWindowClosed:
            settingsLifecycle.handleClosed()
        case .sessionClosed(let sessionID):
            sessionLifecycle.close(sessionID)
        case .statusBubbleTapped(let sessionID):
            handleStatusBubbleTap(sessionID)
        }
    }

    func makeSettingsViewModel() -> AgentSettingsViewModel {
        AgentSettingsViewModel(store: services.settingsStore)
    }

    func makeShortcutActions() -> [PromptAction] { promptActions }

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
        promptPanelController.hide()
        sessionLifecycle.open(prompt: prompt, startupError: agentServerError) { [weak self] id in
            self?.send(.sessionClosed(id))
        }
    }

    private func handleOpenSettings() {
        settingsLifecycle.openOrFocus(
            settingsViewModel: makeSettingsViewModel(),
            workspaceViewModel: WorkspaceSettingsViewModel(),
            shortcutActions: makeShortcutActions(),
            onClosed: { [weak self] in self?.send(.settingsWindowClosed) }
        )
    }

    private func handleStatusBubbleTap(_ sessionID: String?) {
        if let sessionID, sessionLifecycle.focus(sessionID) { return }
        promptPanelController.show()
    }
}

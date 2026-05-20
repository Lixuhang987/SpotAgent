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
        case submitActionPrompt(String, actionBinding: ActionBindingPayload, attachments: [PromptAttachmentResult])
        case openSettings
        case openHistory
        case settingsWindowClosed
        case sessionWindowClosed
        case statusBubbleTapped(String?)
    }

    var sessionWindowViewModel: SessionWindowViewModel? { sessionWindowLifecycle.viewModel }
    var agentServerError: String? { agentServerHealth.errorMessage }

    @ObservationIgnored private let services: AppServices
    @ObservationIgnored private let agentServerHealth: AgentServerHealth
    @ObservationIgnored private let sessionWindowLifecycle: SessionWindowLifecycle
    @ObservationIgnored private let settingsLifecycle: SettingsLifecycle
    @ObservationIgnored private let activationPolicy = AppActivationPolicyCoordinator()
    @ObservationIgnored private var platformBridgeService: (any PlatformBridgeRunning)?
    @ObservationIgnored private let appScopeShortcutDispatcher = AppScopeShortcutDispatcher()
    @ObservationIgnored private lazy var promptPanelController = PromptPanelController()
    @ObservationIgnored private lazy var statusBubbleController: StatusBubbleController = {
        StatusBubbleController(registry: services.sessionRegistry)
    }()
    @ObservationIgnored private lazy var captureCoordinator = PromptCaptureCoordinator(
        controller: promptPanelController,
        selectionProvider: MacSelectionCaptureProvider(),
        regionProvider: MacRegionCaptureProvider()
    )
    @ObservationIgnored private lazy var basePromptActions: [PromptAction] = [
        PromptAction(
            id: "open-settings",
            title: "打开设置",
            keywords: ["settings", "preferences", "shortcut", "hotkey"],
            defaultShortcut: .init(.comma, modifiers: [.command]),
            perform: { [weak self] in self?.send(.openSettings) }
        ),
        PromptAction(
            id: "open-history",
            title: "会话历史",
            keywords: ["history", "recent", "session"],
            defaultShortcut: nil,
            perform: { [weak self] in self?.send(.openHistory) }
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
        self.sessionWindowLifecycle = SessionWindowLifecycle(
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
        setupAppScopeShortcuts()
        setupStatusBubble()
        setupAgentServerHealth()
        agentServerHealth.start()
        startPlatformBridge()
        if services.showsStatusBubble { statusBubbleController.show() }
    }

    func shutdown() {
        platformBridgeService?.stop()
        platformBridgeService = nil
        appScopeShortcutDispatcher.stop()
        agentServerHealth.stop()
        settingsLifecycle.close()
        sessionWindowLifecycle.close()
    }

    func send(_ action: Action) {
        switch action {
        case .showPromptPanel:
            refreshPromptActions()
            promptPanelController.show()
        case .hidePromptPanel:
            promptPanelController.hide()
        case .togglePromptPanel:
            refreshPromptActions()
            promptPanelController.toggle()
        case .submitPrompt(let draft, let attachments):
            handleSubmitPrompt(draft, attachments: attachments)
        case .submitActionPrompt(let draft, let binding, let attachments):
            handleSubmitPrompt(draft, attachments: attachments, actionBinding: binding)
        case .openSettings:
            handleOpenSettings()
        case .openHistory:
            handleOpenHistory()
        case .settingsWindowClosed:
            settingsLifecycle.handleClosed()
        case .sessionWindowClosed:
            sessionWindowLifecycle.close()
        case .statusBubbleTapped(let sessionID):
            handleStatusBubbleTap(sessionID)
        }
    }

    func makeSettingsViewModel() -> AgentSettingsViewModel {
        AgentSettingsViewModel(store: services.settingsStore)
    }

    func makeToolSettingsViewModel() -> ToolSettingsViewModel {
        ToolSettingsViewModel(store: services.settingsStore)
    }

    func makePermissionRulesViewModel() -> PermissionRulesViewModel {
        PermissionRulesViewModel()
    }

    func makeShortcutActions() -> [PromptAction] { basePromptActions }

    private func setupPromptPanel() {
        refreshPromptActions()
        promptPanelController.onSubmit = { [weak self] draft, attachments in
            self?.send(.submitPrompt(draft, attachments: attachments))
        }
        promptPanelController.onSubmitAction = { [weak self] prompt, binding, attachments in
            self?.send(.submitActionPrompt(prompt, actionBinding: binding, attachments: attachments))
        }
        promptPanelController.onOpenSettings = { [weak self] in
            self?.send(.openSettings)
        }
    }

    private func setupAgentServerHealth() {
        agentServerHealth.onAvailabilityChange = { [weak self] available, message in
            guard let self else { return }
            self.promptPanelController.setSubmissionEnabled(available, message: message)
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

    private func setupAppScopeShortcuts() {
        appScopeShortcutDispatcher.start(actions: basePromptActions)
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

    private func handleSubmitPrompt(
        _ draft: String,
        attachments: [PromptAttachmentResult],
        actionBinding: ActionBindingPayload? = nil
    ) {
        if let agentServerError {
            promptPanelController.setSubmissionEnabled(false, message: agentServerError)
            promptPanelController.show()
            return
        }

        guard let prompt = PromptSubmission.compose(
            draft: draft,
            attachments: attachments,
            actionBinding: actionBinding
        ) else { return }
        promptPanelController.hide()
        sessionWindowLifecycle.createTabWithInitialPrompt(prompt) { [weak self] in
            self?.send(.sessionWindowClosed)
        }
    }

    private func handleOpenSettings() {
        settingsLifecycle.openOrFocus(
            settingsViewModel: makeSettingsViewModel(),
            toolSettingsViewModel: makeToolSettingsViewModel(),
            permissionRulesViewModel: makePermissionRulesViewModel(),
            workspaceViewModel: WorkspaceSettingsViewModel(),
            shortcutActions: makeShortcutActions(),
            onClosed: { [weak self] in self?.send(.settingsWindowClosed) }
        )
    }

    private func handleOpenHistory() {
        sessionWindowLifecycle.openOrFocusHistory { [weak self] in
            self?.send(.sessionWindowClosed)
        }
    }

    private func handleStatusBubbleTap(_ sessionID: String?) {
        if sessionID != nil, sessionWindowLifecycle.focus() { return }
        promptPanelController.show()
    }

    private func refreshPromptActions() {
        promptPanelController.register(actions: buildPromptActions())
    }

    private func buildPromptActions() -> [ActionDefinition] {
        services.actionManifestStore.load().actions
    }
}

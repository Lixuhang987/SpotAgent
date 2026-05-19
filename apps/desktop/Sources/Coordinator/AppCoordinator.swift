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
        case openHistory
        case restoreSession(String)
        case settingsWindowClosed
        case historyWindowClosed
        case sessionClosed(String)
        case statusBubbleTapped(String?)
    }

    var sessionViewModels: [String: SessionViewModel] { sessionLifecycle.viewModels }
    var agentServerError: String? { agentServerHealth.errorMessage }

    @ObservationIgnored private let services: AppServices
    @ObservationIgnored private let agentServerHealth: AgentServerHealth
    @ObservationIgnored private let sessionLifecycle: SessionLifecycle
    @ObservationIgnored private let settingsLifecycle: SettingsLifecycle
    @ObservationIgnored private let historyLifecycle: HistoryLifecycle
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
    @ObservationIgnored private lazy var historyViewModel: SessionHistoryViewModel = {
        let viewModel = SessionHistoryViewModel(store: services.sessionHistoryStore)
        viewModel.onRestore = { [weak self] sessionID in
            self?.send(.restoreSession(sessionID))
        }
        return viewModel
    }()

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
        self.historyLifecycle = HistoryLifecycle(
            windowPresenter: services.historyWindowPresenter,
            activationPolicy: activationPolicy,
            setActivationPolicy: services.setActivationPolicy
        )
        bootstrap()
    }

    func bootstrap() {
        setupPromptPanel()
        setupHotkey()
        setupStatusBubble()
        setupAgentServerHealth()
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
            refreshPromptActions()
            promptPanelController.show()
        case .hidePromptPanel:
            promptPanelController.hide()
        case .togglePromptPanel:
            refreshPromptActions()
            promptPanelController.toggle()
        case .submitPrompt(let draft, let attachments):
            handleSubmitPrompt(draft, attachments: attachments)
        case .submitAction(let action):
            action.perform()
            promptPanelController.hide()
        case .openSettings:
            handleOpenSettings()
        case .openHistory:
            handleOpenHistory()
        case .restoreSession(let sessionID):
            handleRestoreSession(sessionID)
        case .settingsWindowClosed:
            settingsLifecycle.handleClosed()
        case .historyWindowClosed:
            historyLifecycle.handleClosed()
        case .sessionClosed(let sessionID):
            sessionLifecycle.close(sessionID)
            refreshPromptActions()
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
        promptPanelController.setSelectionProvider(MacSelectionCaptureProvider())
        promptPanelController.onSubmit = { [weak self] draft, attachments in
            self?.send(.submitPrompt(draft, attachments: attachments))
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
        if let agentServerError {
            promptPanelController.setSubmissionEnabled(false, message: agentServerError)
            promptPanelController.show()
            return
        }

        guard let prompt = PromptSubmission.compose(draft: draft, attachments: attachments) else { return }
        promptPanelController.hide()
        sessionLifecycle.open(prompt: prompt, startupError: agentServerError) { [weak self] id in
            self?.send(.sessionClosed(id))
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
        historyViewModel.refresh()
        historyLifecycle.openOrFocus(
            historyViewModel: historyViewModel,
            onRestoreSession: { [weak self] sessionID in
                self?.send(.restoreSession(sessionID))
            },
            onClosed: { [weak self] in self?.send(.historyWindowClosed) }
        )
    }

    private func handleRestoreSession(_ sessionID: String) {
        _ = sessionLifecycle.restore(sessionID: sessionID) { [weak self] id in
            self?.send(.sessionClosed(id))
        }
    }

    private func handleStatusBubbleTap(_ sessionID: String?) {
        if let sessionID, sessionLifecycle.focus(sessionID) { return }
        promptPanelController.show()
    }

    private func refreshPromptActions() {
        promptPanelController.register(actions: buildPromptActions())
    }

    private func buildPromptActions() -> [PromptAction] {
        basePromptActions + services.sessionHistoryStore.list().prefix(8).map { item in
            PromptAction(
                id: "recent-session-\(item.id)",
                title: "最近会话：\(item.title ?? item.id)",
                keywords: [item.id, item.title ?? "", item.preview, "recent", "history", "session"],
                defaultShortcut: nil,
                perform: { [weak self] in
                    self?.send(.restoreSession(item.id))
                }
            )
        }
    }
}

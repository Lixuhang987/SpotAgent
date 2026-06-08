import ComposableArchitecture
import Foundation
import KeyboardShortcuts
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
        case threadWindowClosed
        case statusBubbleTapped(String?)
    }

    var threadWindowWebHost: ThreadWindowWebHost? { threadWindowLifecycle.webHost }
    var agentServerError: String? { agentServerHealth.errorMessage }

    @ObservationIgnored private let services: AppServices
    @ObservationIgnored private let store = Store(initialState: AppFeature.State()) {
        AppFeature()
    }
    @ObservationIgnored private let agentServerHealth: AgentServerHealth
    @ObservationIgnored private let threadWindowLifecycle: any ThreadWindowManaging
    @ObservationIgnored private let activityWindowCommandClient: (any ActivityWindowCommanding)?
    @ObservationIgnored private let settingsLifecycle: SettingsLifecycle
    @ObservationIgnored private let activationPolicy = AppActivationPolicyCoordinator()
    @ObservationIgnored private var registeredActionShortcutNames: Set<KeyboardShortcuts.Name> = []
    @ObservationIgnored private lazy var promptPanelController = PromptPanelController()
    @ObservationIgnored private lazy var statusBubbleController: StatusBubbleController = {
        StatusBubbleController(registry: services.threadRegistry)
    }()
    @ObservationIgnored private lazy var captureCoordinator = PromptCaptureCoordinator(
        controller: promptPanelController,
        selectionProvider: MacSelectionCaptureProvider(),
        regionProvider: MacRegionCaptureProvider()
    )

    convenience init() { self.init(services: AppServices()) }

    init(services: AppServices) {
        self.services = services
        self.agentServerHealth = AgentServerHealth(
            appServer: services.appServer,
            fatalAlertPresenter: services.fatalAlertPresenter,
            showsFatalAlert: services.showsFatalAlert
        )
        self.activityWindowCommandClient = services.activityWindowCommandClient
        if let threadWindowCommandClient = services.threadWindowCommandClient {
            self.threadWindowLifecycle = ElectronThreadWindowLifecycle(client: threadWindowCommandClient)
        } else {
            self.threadWindowLifecycle = ThreadWindowLifecycle(
                threadWebSocketURL: services.appServerURL,
                webAppURL: services.threadWindowWebAppURL,
                windowPresenter: services.threadWindowPresenter,
                activationPolicy: activationPolicy,
                setActivationPolicy: services.setActivationPolicy
            )
        }
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
        setupElectronActivityWindow()
        setupAgentServerHealth()
        agentServerHealth.start()
        if services.showsStatusBubble { statusBubbleController.show() }
    }

    func shutdown() {
        unregisterActionShortcuts()
        clearElectronActivityWindowCallbacks()
        agentServerHealth.stop()
        settingsLifecycle.close()
        threadWindowLifecycle.close()
    }

    func send(_ action: Action) {
        switch action {
        case .showPromptPanel:
            refreshActionDefinitions()
            promptPanelController.show()
        case .hidePromptPanel:
            promptPanelController.hide()
        case .togglePromptPanel:
            refreshActionDefinitions()
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
        case .threadWindowClosed:
            threadWindowLifecycle.close()
            store.send(.threadWindowClosed)
        case .statusBubbleTapped(let threadID):
            handleStatusBubbleTap(threadID)
        }
    }

    func makeSettingsViewModel() -> AgentSettingsViewModel {
        AgentSettingsViewModel(store: services.settingsStore)
    }

    func makeToolSettingsViewModel() -> ToolSettingsViewModel {
        ToolSettingsViewModel(store: services.settingsStore)
    }

    func makePluginSettingsViewModel() -> PluginSettingsViewModel {
        PluginSettingsViewModel()
    }

    func makeAppendPromptSettingsViewModel() -> AppendPromptSettingsViewModel {
        AppendPromptSettingsViewModel()
    }

    func makeMCPSettingsViewModel() -> MCPSettingsViewModel {
        MCPSettingsViewModel()
    }

    func makePermissionRulesViewModel() -> PermissionRulesViewModel {
        PermissionRulesViewModel()
    }

    private func setupPromptPanel() {
        refreshActionDefinitions()
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
            self.store.send(.appServerAvailabilityChanged(available))
            self.promptPanelController.setSubmissionEnabled(available, message: message)
            if available {
                self.showElectronActivityWindowOrFallback()
            }
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
        statusBubbleController.onTap = { [weak self] threadID in
            self?.send(.statusBubbleTapped(threadID))
        }
    }

    private func setupElectronActivityWindow() {
        activityWindowCommandClient?.onPromptPanelShowRequested = { [weak self] in
            self?.promptPanelController.show()
        }
        activityWindowCommandClient?.onActivityWindowCommandResult = { [weak self] result in
            guard result.kind == .show, !result.ok else { return }
            self?.statusBubbleController.show()
        }
    }

    private func clearElectronActivityWindowCallbacks() {
        activityWindowCommandClient?.onPromptPanelShowRequested = nil
        activityWindowCommandClient?.onActivityWindowCommandResult = nil
    }

    private func showElectronActivityWindowOrFallback() {
        guard let activityWindowCommandClient else { return }
        do {
            _ = try activityWindowCommandClient.showActivityWindow()
        } catch {
            statusBubbleController.show()
        }
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
        threadWindowLifecycle.createTabWithInitialPrompt(
            prompt,
            onOpened: { [weak self] in
                guard let self else { return }
                self.promptPanelController.hide()
                self.store.send(.threadWindowOpened)
            },
            onFailed: { [weak self] message in
                self?.handleThreadWindowOpenFailure(message)
            },
            onClosed: { [weak self] in
                self?.send(.threadWindowClosed)
            }
        )
    }

    private func handleOpenSettings() {
        let actions = buildActionDefinitions()
        registerActionShortcuts(actions)
        settingsLifecycle.openOrFocus(
            settingsViewModel: makeSettingsViewModel(),
            toolSettingsViewModel: makeToolSettingsViewModel(),
            pluginSettingsViewModel: makePluginSettingsViewModel(),
            appendPromptSettingsViewModel: makeAppendPromptSettingsViewModel(),
            mcpSettingsViewModel: makeMCPSettingsViewModel(),
            permissionRulesViewModel: makePermissionRulesViewModel(),
            workspaceViewModel: WorkspaceSettingsViewModel(),
            shortcutActions: actions,
            onClosed: { [weak self] in self?.send(.settingsWindowClosed) }
        )
    }

    private func handleOpenHistory() {
        threadWindowLifecycle.openOrFocusHistory(
            onOpened: { [weak self] in
                self?.store.send(.threadWindowOpened)
            },
            onFailed: { [weak self] message in
                self?.handleThreadWindowOpenFailure(message)
            },
            onClosed: { [weak self] in
                self?.send(.threadWindowClosed)
            }
        )
    }

    private func handleStatusBubbleTap(_ threadID: String?) {
        if threadID != nil, threadWindowLifecycle.focus(threadID: threadID, onFailure: { [weak self] in
            self?.promptPanelController.show()
        }) { return }
        promptPanelController.show()
    }

    private func handleThreadWindowOpenFailure(_ message: String) {
        store.send(.threadWindowClosed)
        promptPanelController.setSubmissionEnabled(false, message: message)
        promptPanelController.show()
    }

    private func refreshActionDefinitions() {
        let actions = buildActionDefinitions()
        promptPanelController.register(actions: actions)
        registerActionShortcuts(actions)
    }

    private func buildActionDefinitions() -> [ActionDefinition] {
        uniqueActionsByTrigger(services.actionManifestStore.load().actions)
    }

    private func uniqueActionsByTrigger(_ actions: [ActionDefinition]) -> [ActionDefinition] {
        var seen: Set<String> = []
        var result: [ActionDefinition] = []
        for action in actions {
            let trigger = action.trigger.lowercased()
            guard !seen.contains(trigger) else { continue }
            seen.insert(trigger)
            result.append(action)
        }
        return result
    }

    private func registerActionShortcuts(_ actions: [ActionDefinition]) {
        let names = Set(actions.map(\.shortcutName))
        for staleName in registeredActionShortcutNames.subtracting(names) {
            services.hotkeyRegistrar.unregisterActionShortcut(name: staleName)
        }
        registeredActionShortcutNames = names

        for action in actions {
            services.hotkeyRegistrar.registerActionShortcut(
                name: action.shortcutName,
                defaultShortcut: action.defaultShortcut
            ) { [weak self] in
                Task { @MainActor in self?.performActionShortcut(action) }
            }
        }
    }

    private func unregisterActionShortcuts() {
        for name in registeredActionShortcutNames {
            services.hotkeyRegistrar.unregisterActionShortcut(name: name)
        }
        registeredActionShortcutNames = []
    }

    private func performActionShortcut(_ action: ActionDefinition) {
        switch action.submission {
        case .appendPrompt, .plugin:
            if action.requiresArguments {
                promptPanelController.selectActionAndShow(action)
                return
            }
            do {
                let parsed = ParsedActionInvocation(action: action, values: [:])
                let prompt = try parsed.renderedPrompt()
                switch action.submission {
                case .appendPrompt:
                    handleSubmitPrompt(prompt, attachments: [])
                case .plugin(let binding):
                    handleSubmitPrompt(
                        prompt,
                        attachments: [],
                        actionBinding: ActionBindingPayload(pluginId: binding.pluginId, promptName: binding.promptName)
                    )
                }
            } catch {
                promptPanelController.show()
            }
        }
    }
}

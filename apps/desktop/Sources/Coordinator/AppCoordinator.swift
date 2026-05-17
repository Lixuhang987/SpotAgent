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
    private(set) var agentServerError: String?

    @ObservationIgnored private let services: AppServices
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
        bootstrap()
    }

    func bootstrap() {
        services.setActivationPolicy(activationPolicy.policyAfterUpdatingOpenSessionWindows(by: 0))
        setupPromptPanel()
        setupHotkey()
        setupStatusBubble()
        startAgentServer()
        startPlatformBridge()
        if services.showsStatusBubble {
            statusBubbleController.show()
        }
    }

    func shutdown() {
        platformBridgeService?.stop()
        platformBridgeService = nil
        services.agentServer.stop()
        settingsWindow?.close()
        settingsWindow = nil
        sessionWindows.values.forEach { $0.close() }
        sessionWindows.removeAll()
    }

    private func startPlatformBridge() {
        guard let bridge = services.platformBridgeFactory(services.agentServerURL) else { return }
        platformBridgeService = bridge
        bridge.start()
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
            Task { @MainActor in
                self?.send(.togglePromptPanel)
            }
        }
        services.hotkeyRegistrar.registerCaptureSelection { [weak self] in
            Task { @MainActor in
                await self?.handleCaptureSelectionHotkey()
            }
        }
        services.hotkeyRegistrar.registerCaptureRegion { [weak self] in
            Task { @MainActor in
                await self?.handleCaptureRegionHotkey()
            }
        }
    }

    private func handleCaptureSelectionHotkey() async {
        let provider = MacSelectionCaptureProvider()
        let result = await provider.captureSelectedText()
        let attachmentId = "selection-\(UUID().uuidString)"
        switch result {
        case .selected(let text):
            promptPanelController.appendAttachment(.textSelection(id: attachmentId, text: text))
        case .empty:
            break
        case .error(let message):
            promptPanelController.appendAttachment(.selectionError(id: attachmentId, message: message))
        }
        promptPanelController.show()
    }

    private func handleCaptureRegionHotkey() async {
        let provider = MacRegionCaptureProvider()
        let result = await provider.captureRegion()
        let attachmentId = "region-\(UUID().uuidString)"
        switch result {
        case .captured(let pngBase64):
            promptPanelController.appendAttachment(
                .imageRegion(id: attachmentId, mimeType: "image/png", base64: pngBase64)
            )
            promptPanelController.show()
        case .cancelled:
            break
        case .error(let message):
            promptPanelController.appendAttachment(.selectionError(id: attachmentId, message: message))
            promptPanelController.show()
        }
    }

    private func setupStatusBubble() {
        statusBubbleController.onTap = { [weak self] sessionID in
            self?.send(.statusBubbleTapped(sessionID))
        }
    }

    private func startAgentServer() {
        services.agentServer.onAvailabilityChange = { [weak self] available in
            Task { @MainActor in
                guard let self else { return }
                if available {
                    self.agentServerError = nil
                } else if self.agentServerError == nil {
                    self.agentServerError = "agent-server 已断开，正在尝试重连…"
                }
            }
        }
        services.agentServer.onFatalError = { [weak self] message in
            Task { @MainActor in
                self?.agentServerError = message
                self?.showFatalServerAlert(message: message)
            }
        }
        do {
            try services.agentServer.start()
            agentServerError = nil
        } catch {
            agentServerError = services.agentServer.lastStartupError ?? error.localizedDescription
        }
    }

    private func showFatalServerAlert(message: String) {
        guard services.showsStatusBubble else { return }
        let alert = NSAlert()
        alert.messageText = "Agent Server 已停止"
        alert.informativeText = message
        alert.alertStyle = .critical
        alert.addButton(withTitle: "确定")
        alert.addButton(withTitle: "查看日志")
        let response = alert.runModal()
        if response == .alertSecondButtonReturn {
            let logsDir = FileManager.default.homeDirectoryForCurrentUser
                .appendingPathComponent(".spotAgent")
            NSWorkspace.shared.open(logsDir)
        }
    }

    private func handleSubmitPrompt(_ draft: String, attachments: [PromptAttachmentResult]) {
        let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        let tokenSuffix = attachments.compactMap { attachment -> String? in
            if case .textToken(let token) = attachment { return token }
            return nil
        }
        let composedPrompt = ([trimmed] + tokenSuffix).joined(separator: "\n\n")

        let socketAttachments = attachments.compactMap { attachment -> UserMessageAttachmentPayload? in
            switch attachment {
            case .textSelection(let id, let text):
                return .textSelection(id: id, text: text)
            case .imageRegion(let id, let mimeType, let base64):
                return .image(id: id, mimeType: mimeType, base64: base64)
            case .noAttachment, .textToken, .selectionError:
                return nil
            }
        }

        let summaryText: String = {
            if socketAttachments.isEmpty { return composedPrompt }
            return composedPrompt + "\n\n[附件 ×\(socketAttachments.count)]"
        }()

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
                latestSummary: summaryText,
                lastActiveAt: .now,
                windowIsOpen: true
            )
        )

        promptPanelController.hide()

        if let window = services.sessionWindowPresenter.present(
            sessionID: sessionID,
            viewModel: viewModel,
            onClose: { [weak self] in
                Task { @MainActor in
                    self?.send(.sessionClosed(sessionID))
                    self?.sessionWindows.removeValue(forKey: sessionID)
                }
            }
        ) {
            sessionWindows[sessionID] = window
            services.setActivationPolicy(
                activationPolicy.policyAfterUpdatingOpenSessionWindows(by: 1)
            )
        }

        viewModel.start(
            initialPrompt: composedPrompt,
            attachments: socketAttachments,
            startupError: agentServerError
        )
    }

    private func handleSessionClosed(_ sessionID: String) {
        let viewModel = sessionViewModels.removeValue(forKey: sessionID)
        viewModel?.stop()

        let hadWindow = sessionWindows.removeValue(forKey: sessionID) != nil
        if hadWindow {
            services.setActivationPolicy(
                activationPolicy.policyAfterUpdatingOpenSessionWindows(by: -1)
            )
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
        services.setActivationPolicy(
            activationPolicy.policyAfterUpdatingSettingsWindow(isOpen: true)
        )

        if let settingsWindow {
            settingsWindow.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }

        let window = makeSettingsWindow()
        settingsWindow = window

        NotificationCenter.default.addObserver(
            forName: NSWindow.willCloseNotification,
            object: window,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.send(.settingsWindowClosed)
            }
        }

        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    private func handleSettingsWindowClosed() {
        settingsWindow = nil
        services.setActivationPolicy(
            activationPolicy.policyAfterUpdatingSettingsWindow(isOpen: false)
        )
    }

    private func makeSettingsWindow() -> NSWindow {
        if let factory = services.settingsWindowFactory {
            return factory()
        }

        let hosting = NSHostingController(
            rootView: SettingsView(
                settingsViewModel: makeSettingsViewModel(),
                workspaceViewModel: WorkspaceSettingsViewModel(),
                shortcutActions: makeShortcutActions()
            )
        )
        let window = NSWindow(contentViewController: hosting)
        window.title = "设置"
        window.setContentSize(NSSize(width: 660, height: 520))
        window.styleMask.insert(.fullSizeContentView)
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.isOpaque = false
        window.backgroundColor = .clear
        window.hasShadow = true
        return window
    }
}

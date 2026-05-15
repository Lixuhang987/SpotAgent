import AppKit
import Carbon.HIToolbox
import SwiftUI

@main
struct HandAgentApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var settingsStore = AgentSettingsStore()

    var body: some Scene {
        Settings {
            AgentSettingsView(store: settingsStore)
            appDelegate.makeSettingsView()
        }
        .commands {
            CommandGroup(replacing: .appSettings) {
                Button("设置…") {
                    appDelegate.openSettingsWindow()
                }
                .keyboardShortcut(",", modifiers: .command)
            }
        }
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private let services = AppServices()
    private let agentServerURL = URL(string: "ws://127.0.0.1:4317/api/session")!
    private lazy var promptPanelController = PromptPanelController(
        shortcutSettingsStore: services.shortcutSettingsStore
    )
    private let activationPolicyCoordinator = AppActivationPolicyCoordinator()
    private lazy var statusBubbleController = StatusBubbleController(registry: services.sessionRegistry)
    private var sessionWindows: [String: SessionWindowController] = [:]
    private var agentServerStartupError: String?
    private lazy var promptActions: [PromptAction] = [
        PromptAction(
            id: "open-settings",
            title: "打开设置",
            keywords: ["settings", "preferences", "shortcut", "hotkey"],
            defaultShortcut: .init(keyCode: UInt16(kVK_ANSI_Comma), modifiers: [.command]),
            perform: { [weak self] in
                self?.openSettingsWindow()
            }
        )
    ]

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(
            activationPolicyCoordinator.policyAfterUpdatingOpenSessionWindows(by: 0)
        )

        promptPanelController.register(actions: promptActions)
        promptPanelController.onSubmit = { [weak self] draft, attachments in
            self?.openSessionWindow(for: draft, attachments: attachments)
        }
        promptPanelController.onOpenSettings = { [weak self] in
            self?.openSettingsWindow()
        }

        services.hotkeyService.onTrigger = { [promptPanelController] in
            promptPanelController.show()
        }
        services.shortcutSettingsStore.onGlobalShortcutChanged = { [weak self] shortcut in
            _ = self?.services.hotkeyService.setShortcut(shortcut)
        }
        services.shortcutSettingsStore.onActionShortcutsChanged = { [weak self] in
            self?.promptPanelController.register(actions: self?.promptActions ?? [])
        }
        statusBubbleController.onTap = { [weak self] sessionID in
            self?.handleStatusBubbleTap(sessionID: sessionID)
        }

        do {
            try services.agentServerService.start()
            agentServerStartupError = nil
        } catch {
            agentServerStartupError =
                services.agentServerService.lastStartupError
                ?? error.localizedDescription
        }
        _ = services.hotkeyService.start()
        statusBubbleController.show()
    }

    func makeSettingsView() -> some View {
        ShortcutSettingsView(
            store: services.shortcutSettingsStore,
            actions: promptActions
        )
    }

    func openSettingsWindow() {
        NSApp.sendAction(Selector(("showSettingsWindow:")), to: nil, from: nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationWillTerminate(_ notification: Notification) {
        services.hotkeyService.stop()
        services.agentServerService.stop()
        sessionWindows.values.forEach { $0.close() }
        sessionWindows.removeAll()
    }

    private func openSessionWindow(for draft: String, attachments: [PromptAttachmentResult]) {
        let trimmedDraft = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedDraft.isEmpty else { return }

        let attachmentText = attachments.compactMap { attachment -> String? in
            switch attachment {
            case .noAttachment:
                return nil
            case .textToken(let token):
                return token
            }
        }

        let composedPrompt = ([trimmedDraft] + attachmentText).joined(separator: "\n\n")
        let sessionID = UUID().uuidString
        let viewModel = SessionViewModel(
            sessionID: sessionID,
            socketClient: SessionSocketClient(serverURL: agentServerURL)
        )
        let windowController = SessionWindowController(viewModel: viewModel)
        NSApp.setActivationPolicy(
            activationPolicyCoordinator.policyAfterUpdatingOpenSessionWindows(by: 1)
        )

        windowController.onClose = { [weak self, weak viewModel] in
            guard let self else { return }

            self.sessionWindows[sessionID] = nil
            NSApp.setActivationPolicy(
                self.activationPolicyCoordinator.policyAfterUpdatingOpenSessionWindows(by: -1)
            )
            self.services.sessionRegistry.upsert(
                SessionSummary(
                    sessionId: sessionID,
                    isRunning: viewModel?.status == "running",
                    latestSummary: viewModel?.messages.last?.text ?? trimmedDraft,
                    lastActiveAt: .now,
                    windowIsOpen: false
                )
            )
        }

        sessionWindows[sessionID] = windowController
        services.sessionRegistry.upsert(
            SessionSummary(
                sessionId: sessionID,
                isRunning: true,
                latestSummary: composedPrompt,
                lastActiveAt: .now,
                windowIsOpen: true
            )
        )

        windowController.showWindow(nil)
        viewModel.start(
            initialPrompt: composedPrompt,
            startupError: agentServerStartupError
        )
    }

    private func handleStatusBubbleTap(sessionID: String?) {
        if let sessionID {
            focusSessionWindow(with: sessionID)
            return
        }

        promptPanelController.show()
    }

    private func focusSessionWindow(with sessionID: String) {
        if let windowController = sessionWindows[sessionID] {
            windowController.showWindow(nil)
        } else {
            promptPanelController.show()
        }
    }
}

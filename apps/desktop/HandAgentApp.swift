import AppKit
import SwiftUI

@main
struct HandAgentApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        Settings {
            EmptyView()
        }
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private let services = AppServices()
    private let agentServerURL = URL(string: "ws://127.0.0.1:4317/api/session")!
    private let promptPanelController = PromptPanelController()
    private lazy var statusBubbleController = StatusBubbleController(registry: services.sessionRegistry)
    private var sessionWindows: [String: SessionWindowController] = [:]

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)

        promptPanelController.onSubmit = { [weak self] draft, attachments in
            self?.openSessionWindow(for: draft, attachments: attachments)
        }

        services.hotkeyService.onTrigger = { [promptPanelController] in
            promptPanelController.show()
        }
        statusBubbleController.onTap = { [weak self] sessionID in
            self?.handleStatusBubbleTap(sessionID: sessionID)
        }

        try? services.agentServerService.start()
        _ = services.hotkeyService.start()
        statusBubbleController.show()
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

        windowController.onClose = { [weak self, weak viewModel] in
            guard let self else { return }

            self.sessionWindows[sessionID] = nil
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
        viewModel.start(initialPrompt: composedPrompt)
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

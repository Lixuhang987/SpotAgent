import AppKit
import SwiftUI

@MainActor
final class PromptPanelController {
    var onSubmit: ((String, [PromptAttachmentResult]) -> Void)?

    private var actions: [PromptAction] = []
    private var panel: NSPanel?

    func register(actions: [PromptAction]) {
        self.actions = actions
        refreshContent()
    }

    func show() {
        ensurePanel()
        refreshContent()

        guard let panel else { return }

        NSApp.activate(ignoringOtherApps: true)
        panel.center()
        panel.makeKeyAndOrderFront(nil)
    }

    func hide() {
        panel?.orderOut(nil)
    }

    func submit(draft: String, attachments: [PromptAttachmentResult]) {
        let trimmedDraft = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedDraft.isEmpty else { return }

        onSubmit?(trimmedDraft, attachments)
        hide()
    }

    private func ensurePanel() {
        guard panel == nil else { return }

        let panel = NSPanel(
            contentRect: NSRect(x: 0, y: 0, width: 640, height: 420),
            styleMask: [.titled, .closable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        panel.isReleasedWhenClosed = false
        panel.isFloatingPanel = true
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.titleVisibility = .hidden
        panel.titlebarAppearsTransparent = true
        panel.isMovableByWindowBackground = true
        panel.standardWindowButton(.closeButton)?.isHidden = true
        panel.standardWindowButton(.miniaturizeButton)?.isHidden = true
        panel.standardWindowButton(.zoomButton)?.isHidden = true
        panel.hidesOnDeactivate = true
        panel.contentView = makeContentView()
        panel.orderOut(nil)

        self.panel = panel
    }

    private func refreshContent() {
        guard let panel else { return }
        panel.contentView = makeContentView()
    }

    private func makeContentView() -> NSView {
        NSHostingView(
            rootView: PromptPanelView(
                actions: actions,
                onSubmitDraft: { [weak self] draft in
                    self?.submit(draft: draft, attachments: [])
                },
                onSubmitAction: { [weak self] action in
                    action.perform()
                    self?.hide()
                }
            )
        )
    }
}

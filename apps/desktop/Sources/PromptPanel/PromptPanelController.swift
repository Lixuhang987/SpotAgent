import AppKit
import Carbon.HIToolbox
import KeyboardShortcuts
import SwiftUI

@MainActor
final class PromptPanelController {
    var onSubmit: ((String, [PromptAttachmentResult]) -> Void)?
    var onOpenSettings: (() -> Void)?

    private var actions: [PromptAction] = []
    private var focusSeed = 0
    private var panel: PromptPanelWindow?
    private var eventMonitor: Any?

    func register(actions: [PromptAction]) {
        self.actions = actions
        for action in actions {
            if let defaultShortcut = action.defaultShortcut {
                let name = action.shortcutName
                if KeyboardShortcuts.getShortcut(for: name) == nil {
                    KeyboardShortcuts.setShortcut(defaultShortcut, for: name)
                }
            }
        }
        refreshContent()
    }

    func show() {
        ensurePanel()
        focusSeed += 1
        refreshContent()

        guard let panel else { return }

        panel.center()
        panel.orderFrontRegardless()
        panel.makeKey()
        installEventMonitor()
    }

    func hide() {
        panel?.orderOut(nil)
        removeEventMonitor()
    }

    func submit(draft: String, attachments: [PromptAttachmentResult]) {
        let trimmedDraft = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedDraft.isEmpty else { return }

        onSubmit?(trimmedDraft, attachments)
        hide()
    }

    private func ensurePanel() {
        guard panel == nil else { return }

        let panel = PromptPanelWindow(
            contentRect: NSRect(x: 0, y: 0, width: 640, height: 420),
            styleMask: [.nonactivatingPanel, .titled, .closable, .fullSizeContentView],
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
        panel.onDidResignKey = { [weak self] in
            self?.hide()
        }
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
                shortcutLabelProvider: { action in
                    KeyboardShortcuts.getShortcut(for: action.shortcutName)?
                        .description
                },
                focusSeed: focusSeed,
                onOpenSettings: { [weak self] in
                    self?.openSettings()
                },
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

    private func installEventMonitor() {
        guard eventMonitor == nil else { return }
        eventMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard let self else { return event }
            return self.handle(event: event)
        }
    }

    private func removeEventMonitor() {
        if let eventMonitor {
            NSEvent.removeMonitor(eventMonitor)
            self.eventMonitor = nil
        }
    }

    private func handle(event: NSEvent) -> NSEvent? {
        if event.keyCode == UInt16(kVK_Escape) {
            hide()
            return nil
        }

        guard panel?.isKeyWindow == true else { return event }

        guard let eventShortcut = KeyboardShortcuts.Shortcut(event: event) else { return event }

        for action in actions {
            guard let shortcut = KeyboardShortcuts.getShortcut(for: action.shortcutName) else { continue }
            if shortcut == eventShortcut {
                action.perform()
                hide()
                return nil
            }
        }

        return event
    }

    private func openSettings() {
        onOpenSettings?()
        hide()
    }
}

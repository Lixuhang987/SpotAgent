import AppKit
import Carbon.HIToolbox
import KeyboardShortcuts
import SwiftUI

@MainActor
final class PromptPanelController {
    private var panel: PromptPanelWindow?
    private var eventMonitor: Any?
    private var viewModel: PromptPanelViewModel?

    // Legacy callbacks kept for backward compatibility during migration
    var onSubmit: ((String, [PromptAttachmentResult]) -> Void)?
    var onOpenSettings: (() -> Void)?

    func configure(viewModel: PromptPanelViewModel) {
        self.viewModel = viewModel
    }

    func register(actions: [PromptAction]) {
        for action in actions {
            if let defaultShortcut = action.defaultShortcut {
                let name = action.shortcutName
                if KeyboardShortcuts.getShortcut(for: name) == nil {
                    KeyboardShortcuts.setShortcut(defaultShortcut, for: name)
                }
            }
        }
        if viewModel == nil {
            let vm = PromptPanelViewModel(actions: actions)
            vm.onSubmit = { [weak self] draft, attachments in
                self?.onSubmit?(draft, attachments)
            }
            vm.onHide = { [weak self] in
                self?.hide()
            }
            vm.onOpenSettings = { [weak self] in
                self?.onOpenSettings?()
                self?.hide()
            }
            self.viewModel = vm
        }
    }

    func show() {
        ensurePanel()
        guard let panel else { return }
        viewModel?.focusSeed += 1
        panel.center()
        panel.orderFrontRegardless()
        panel.makeKey()
        NSApp.activate(ignoringOtherApps: true)
        installEventMonitor()
    }

    func hide() {
        panel?.orderOut(nil)
        removeEventMonitor()
    }

    private func ensurePanel() {
        guard panel == nil, let viewModel else { return }

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
        panel.onDidResignKey = { [weak self] in
            self?.hide()
        }
        panel.contentView = NSHostingView(rootView: PromptPanelView(viewModel: viewModel))

        self.panel = panel
    }

    private func installEventMonitor() {
        guard eventMonitor == nil else { return }
        eventMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            self?.handleKeyEvent(event) ?? event
        }
    }

    private func removeEventMonitor() {
        if let eventMonitor {
            NSEvent.removeMonitor(eventMonitor)
            self.eventMonitor = nil
        }
    }

    private func handleKeyEvent(_ event: NSEvent) -> NSEvent? {
        if event.keyCode == UInt16(kVK_Escape) {
            hide()
            return nil
        }
        guard panel?.isKeyWindow == true,
              let viewModel,
              let eventShortcut = KeyboardShortcuts.Shortcut(event: event) else {
            return event
        }
        for action in viewModel.filteredActions {
            guard let shortcut = KeyboardShortcuts.getShortcut(for: action.shortcutName) else { continue }
            if shortcut == eventShortcut {
                viewModel.submitAction(action)
                return nil
            }
        }
        return event
    }
}

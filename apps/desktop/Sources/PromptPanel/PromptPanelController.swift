import AppKit
import Carbon.HIToolbox
import KeyboardShortcuts
import SwiftUI

@MainActor
enum PromptPanelPresentationMode {
    case visible
    case hiddenForTesting
}

@MainActor
final class PromptPanelController {
    private var panel: PromptPanelWindow?
    private var eventMonitor: Any?
    private var viewModel: PromptPanelViewModel?
    private var appTheme: AppTheme = .default
    private let quickLookController = QuickLookPreviewController()
    private let captureFocusOwner: () -> Any?
    private let restoreFocusOwner: (Any) -> Void
    private let presentationMode: PromptPanelPresentationMode
    private var previousFocusOwner: Any?

    var onSubmit: ((String, [PromptAttachmentResult]) -> Void)?
    var onSubmitAction: ((String, ActionBindingPayload, [PromptAttachmentResult]) -> Void)?
    var onOpenSettings: (() -> Void)?
    var onDidShow: (() -> Void)?

    init<FocusRestorer: PromptPanelFocusRestoring>(
        focusRestorer: FocusRestorer = MacPromptPanelFocusRestorer(),
        presentationMode: PromptPanelPresentationMode = .visible
    ) {
        self.presentationMode = presentationMode
        captureFocusOwner = { focusRestorer.captureCurrentFocusOwner() }
        restoreFocusOwner = { token in
            guard let typedToken = token as? FocusRestorer.Token else { return }
            focusRestorer.restoreFocus(to: typedToken)
        }
    }

    func configure(viewModel: PromptPanelViewModel) {
        self.viewModel = viewModel
    }

    func updateTheme(_ theme: AppTheme) {
        appTheme = theme
        guard let viewModel, let hostingView = panel?.contentView as? NSHostingView<AnyView> else {
            return
        }
        hostingView.rootView = AnyView(PromptPanelView(viewModel: viewModel).environment(\.appTheme, theme))
    }

    func register(actions: [ActionDefinition]) {
        if viewModel == nil {
            let vm = PromptPanelViewModel(actions: actions)
            vm.onSubmit = { [weak self] draft, attachments in
                self?.onSubmit?(draft, attachments)
            }
            vm.onSubmitAction = { [weak self] prompt, binding, attachments in
                self?.onSubmitAction?(prompt, binding, attachments)
            }
            vm.onHide = { [weak self] in
                self?.hide()
            }
            vm.onOpenSettings = { [weak self] in
                self?.onOpenSettings?()
                self?.hide()
            }
            vm.onPreviewImage = { [weak self] attachment in
                self?.presentQuickLook(for: attachment)
            }
            self.viewModel = vm
            quickLookController.onClose = { [weak self] in
                guard let self, let panel = self.panel, panel.isVisible else { return }
                panel.makeKey()
            }
        } else {
            viewModel?.updateActions(actions)
        }
    }

    var isVisible: Bool {
        panel?.isVisible ?? false
    }

    func appendAttachment(_ attachment: PromptAttachmentResult) {
        viewModel?.appendAttachment(attachment)
    }

    func selectActionAndShow(_ action: ActionDefinition) {
        viewModel?.selectAction(action)
        show()
    }

    func setSubmissionEnabled(_ enabled: Bool, message: String?) {
        viewModel?.setSubmissionEnabled(enabled, message: message)
    }

    func show() {
        ensurePanel()
        guard let panel else { return }
        if !panel.isVisible {
            previousFocusOwner = captureFocusOwner()
        }
        panel.center()
        panel.contentView?.layoutSubtreeIfNeeded()
        guard presentationMode == .visible else {
            DispatchQueue.main.async { [weak self] in
                self?.viewModel?.focusSeed += 1
                self?.onDidShow?()
            }
            return
        }
        panel.orderFrontRegardless()
        panel.makeKey()
        installEventMonitor()
        DispatchQueue.main.async { [weak self] in
            guard let self, self.panel?.isVisible == true else { return }
            self.viewModel?.focusSeed += 1
            self.onDidShow?()
        }
    }

    func hide(restoringFocus: Bool = true) {
        if !restoringFocus {
            previousFocusOwner = nil
        }
        quickLookController.dismiss()
        panel?.orderOut(nil)
        removeEventMonitor()
        if restoringFocus {
            restorePreviousFocusOwner()
        }
    }

    private func presentQuickLook(for attachment: PromptAttachmentResult) {
        guard case let .imageRegion(_, mimeType, base64) = attachment else { return }
        quickLookController.present(base64: base64, mimeType: mimeType, title: attachment.displayLabel)
    }

    func toggle() {
        if isVisible {
            hide()
        } else {
            show()
        }
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
        panel.appearance = NSAppearance(named: .aqua)
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true
        panel.standardWindowButton(.closeButton)?.isHidden = true
        panel.standardWindowButton(.miniaturizeButton)?.isHidden = true
        panel.standardWindowButton(.zoomButton)?.isHidden = true
        panel.onDidResignKey = { [weak self] in
            if QuickLookPreviewController.isQuickLookVisible { return }
            self?.hide()
        }
        let hostingView = NSHostingView(
            rootView: AnyView(PromptPanelView(viewModel: viewModel).environment(\.appTheme, appTheme))
        )
        hostingView.frame = NSRect(origin: .zero, size: panel.contentRect(forFrameRect: panel.frame).size)
        panel.contentView = hostingView
        hostingView.layoutSubtreeIfNeeded()

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
        return event
    }

    private func restorePreviousFocusOwner() {
        guard let previousFocusOwner else { return }
        self.previousFocusOwner = nil
        restoreFocusOwner(previousFocusOwner)
    }
}

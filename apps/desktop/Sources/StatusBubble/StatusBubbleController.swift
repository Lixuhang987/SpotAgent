import AppKit
import SwiftUI

@MainActor
final class StatusBubbleController {
    private let viewModel: StatusBubbleViewModel
    private var panel: StatusBubblePanel?

    init(registry: ThreadRegistry) {
        self.viewModel = StatusBubbleViewModel(registry: registry)
    }

    var onTap: ((String?) -> Void)? {
        get { viewModel.onTap }
        set { viewModel.onTap = newValue }
    }

    func show() {
        if panel == nil {
            let panel = StatusBubblePanel(
                contentRect: NSRect(x: 0, y: 0, width: 280, height: 96),
                styleMask: [.nonactivatingPanel, .fullSizeContentView],
                backing: .buffered,
                defer: false
            )
            panel.isFloatingPanel = true
            panel.level = .floating
            panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
            panel.isReleasedWhenClosed = false
            panel.hidesOnDeactivate = false
            panel.titleVisibility = .hidden
            panel.titlebarAppearsTransparent = true
            panel.isMovableByWindowBackground = true
            panel.isOpaque = false
            panel.backgroundColor = .clear
            panel.hasShadow = true
            panel.contentView = NSHostingView(rootView: StatusBubbleView(viewModel: viewModel))
            self.panel = panel
        }

        positionPanelIfNeeded()
        panel?.orderFrontRegardless()
    }

    private func positionPanelIfNeeded() {
        guard let panel, let screen = NSScreen.main else { return }
        let visibleFrame = screen.visibleFrame
        let origin = NSPoint(
            x: visibleFrame.maxX - panel.frame.width - 24,
            y: visibleFrame.minY + 24
        )
        panel.setFrameOrigin(origin)
    }
}

private final class StatusBubblePanel: NSPanel {
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}

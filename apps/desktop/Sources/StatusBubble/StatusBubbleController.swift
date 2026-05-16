import AppKit
import SwiftUI

@MainActor
final class StatusBubbleController {
    private let viewModel: StatusBubbleViewModel
    private var window: NSWindow?

    init(registry: SessionRegistry) {
        self.viewModel = StatusBubbleViewModel(registry: registry)
    }

    var onTap: ((String?) -> Void)? {
        get { viewModel.onTap }
        set { viewModel.onTap = newValue }
    }

    func show() {
        if window == nil {
            let hosting = NSHostingController(
                rootView: StatusBubbleView(viewModel: viewModel)
            )
            let window = NSWindow(contentViewController: hosting)
            window.setContentSize(NSSize(width: 280, height: 96))
            window.level = .floating
            window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
            window.isReleasedWhenClosed = false
            window.styleMask.insert(.fullSizeContentView)
            window.titleVisibility = .hidden
            window.titlebarAppearsTransparent = true
            window.isMovableByWindowBackground = true
            window.isOpaque = false
            window.backgroundColor = .clear
            window.hasShadow = true
            window.standardWindowButton(.closeButton)?.isHidden = true
            window.standardWindowButton(.miniaturizeButton)?.isHidden = true
            window.standardWindowButton(.zoomButton)?.isHidden = true
            self.window = window
        }

        positionWindowIfNeeded()
        window?.makeKeyAndOrderFront(nil)
    }

    private func positionWindowIfNeeded() {
        guard let window, let screen = NSScreen.main else { return }
        let visibleFrame = screen.visibleFrame
        let origin = NSPoint(
            x: visibleFrame.maxX - window.frame.width - 24,
            y: visibleFrame.minY + 24
        )
        window.setFrameOrigin(origin)
    }
}

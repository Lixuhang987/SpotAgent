import AppKit
import SwiftUI

@MainActor
final class StatusBubbleController {
    var onTap: ((String?) -> Void)?

    private let registry: SessionRegistry
    private var window: NSWindow?

    init(registry: SessionRegistry) {
        self.registry = registry
    }

    func show() {
        if window == nil {
            let hosting = NSHostingController(
                rootView: StatusBubbleView(registry: registry) { [weak self] in
                    guard let self else { return }
                    self.onTap?(self.registry.primarySessionID)
                }
            )
            let window = NSWindow(contentViewController: hosting)
            window.setContentSize(NSSize(width: 280, height: 96))
            window.level = .floating
            window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
            window.isReleasedWhenClosed = false
            window.titleVisibility = .hidden
            window.titlebarAppearsTransparent = true
            window.standardWindowButton(.closeButton)?.isHidden = true
            window.standardWindowButton(.miniaturizeButton)?.isHidden = true
            window.standardWindowButton(.zoomButton)?.isHidden = true
            self.window = window
        }

        positionWindowIfNeeded()
        window?.makeKeyAndOrderFront(nil)
    }

    private func positionWindowIfNeeded() {
        guard let window,
              let screen = NSScreen.main else { return }

        let visibleFrame = screen.visibleFrame
        let origin = NSPoint(
            x: visibleFrame.maxX - window.frame.width - 24,
            y: visibleFrame.minY + 24
        )
        window.setFrameOrigin(origin)
    }
}

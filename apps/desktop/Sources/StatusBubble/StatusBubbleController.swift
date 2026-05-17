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
            let hosting = FirstMouseHostingController(
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

private final class FirstMouseHostingController<Content: View>: NSHostingController<Content> {
    override func loadView() {
        super.loadView()
        view = FirstMouseHostingView(wrapping: view)
    }
}

private final class FirstMouseHostingView: NSView {
    init(wrapping child: NSView) {
        super.init(frame: child.bounds)
        autoresizesSubviews = true
        child.frame = bounds
        child.autoresizingMask = [.width, .height]
        addSubview(child)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func acceptsFirstMouse(for event: NSEvent?) -> Bool {
        true
    }
}

import AppKit
import SwiftUI

@MainActor
final class SessionWindowController: NSWindowController, NSWindowDelegate {
    var onClose: (() -> Void)?

    private let viewModel: SessionViewModel

    init(viewModel: SessionViewModel) {
        self.viewModel = viewModel

        let hosting = NSHostingController(rootView: SessionWindowView(viewModel: viewModel))
        let window = NSWindow(contentViewController: hosting)
        window.title = "Session \(viewModel.sessionID)"
        window.setContentSize(NSSize(width: 760, height: 560))
        window.delegate = nil

        super.init(window: window)
        self.window?.delegate = self
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        nil
    }

    override func showWindow(_ sender: Any?) {
        super.showWindow(sender)
        window?.center()
        NSApp.activate(ignoringOtherApps: true)
        window?.makeKeyAndOrderFront(sender)
    }

    func windowWillClose(_ notification: Notification) {
        viewModel.stop()
        onClose?()
    }
}

import AppKit
import KeyboardShortcuts
import SwiftUI

@MainActor
final class ProductionHotkeyRegistrar: HotkeyRegistering {
    func registerShowPromptPanel(handler: @escaping () -> Void) {
        KeyboardShortcuts.onKeyUp(for: .showPromptPanel) { handler() }
    }

    func registerCaptureSelection(handler: @escaping () -> Void) {
        KeyboardShortcuts.onKeyUp(for: .captureSelection) { handler() }
    }

    func registerCaptureRegion(handler: @escaping () -> Void) {
        KeyboardShortcuts.onKeyUp(for: .captureRegion) { handler() }
    }
}

@MainActor
final class ProductionSessionWindowPresenter: SessionWindowPresenting {
    func present(
        sessionID: String,
        viewModel: SessionViewModel,
        onClose: @escaping () -> Void
    ) -> NSWindow? {
        let hosting = NSHostingController(rootView: SessionWindowView(viewModel: viewModel))
        let window = NSWindow(contentViewController: hosting)
        window.title = "Session \(sessionID.prefix(8))"
        window.setContentSize(NSSize(width: 760, height: 560))
        window.styleMask.insert(.fullSizeContentView)
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.center()

        let sendableOnClose = SendableClosure(closure: onClose)
        NotificationCenter.default.addObserver(
            forName: NSWindow.willCloseNotification,
            object: window,
            queue: .main
        ) { _ in
            Task { @MainActor in sendableOnClose.closure() }
        }

        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        return window
    }
}

private struct SendableClosure: @unchecked Sendable {
    let closure: () -> Void
}

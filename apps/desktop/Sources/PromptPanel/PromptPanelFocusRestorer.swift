import AppKit

@MainActor
protocol PromptPanelFocusRestoring {
    associatedtype Token

    func captureCurrentFocusOwner() -> Token?
    func restoreFocus(to token: Token)
}

@MainActor
struct MacPromptPanelFocusRestorer: PromptPanelFocusRestoring {
    func captureCurrentFocusOwner() -> NSRunningApplication? {
        guard let app = NSWorkspace.shared.frontmostApplication,
              app.processIdentifier != NSRunningApplication.current.processIdentifier
        else {
            return nil
        }
        return app
    }

    func restoreFocus(to app: NSRunningApplication) {
        guard !app.isTerminated else { return }
        app.activate(options: [.activateIgnoringOtherApps])
    }
}

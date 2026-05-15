import AppKit

final class PromptPanelWindow: NSPanel {
    var onDidResignKey: (() -> Void)?

    override var canBecomeKey: Bool {
        true
    }

    override var canBecomeMain: Bool {
        false
    }

    override func resignKey() {
        super.resignKey()
        onDidResignKey?()
    }
}

import AppKit
import Foundation

@MainActor
protocol AppearanceChangeObserving: AnyObject {
    var onSystemAppearanceChange: (() -> Void)? { get set }

    func start()
    func stop()
}

@MainActor
final class SystemAppearanceChangeObserver: AppearanceChangeObserving {
    var onSystemAppearanceChange: (() -> Void)?
    private var observation: NSKeyValueObservation?

    func start() {
        guard observation == nil else { return }
        observation = NSApp.observe(\.effectiveAppearance, options: [.new]) { [weak self] _, _ in
            Task { @MainActor in
                self?.onSystemAppearanceChange?()
            }
        }
    }

    func stop() {
        observation?.invalidate()
        observation = nil
    }
}

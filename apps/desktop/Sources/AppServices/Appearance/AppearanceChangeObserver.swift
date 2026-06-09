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
    private let applicationProvider: @MainActor () -> NSApplication?
    private var observation: NSKeyValueObservation?

    init(applicationProvider: @escaping @MainActor () -> NSApplication? = { NSApplication.shared }) {
        self.applicationProvider = applicationProvider
    }

    func start() {
        guard observation == nil else { return }
        guard let application = applicationProvider() else { return }
        observation = application.observe(\.effectiveAppearance, options: [.new]) { [weak self] _, _ in
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

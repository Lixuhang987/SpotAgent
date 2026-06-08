import AppKit

@MainActor
final class PromptPanelInputFocusRetrier {
    typealias Scheduler = (@escaping @MainActor () -> Void) -> Void

    private let maxAttempts: Int
    private let schedule: Scheduler

    init(
        maxAttempts: Int = 8,
        schedule: @escaping Scheduler = { work in
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.02) {
                Task { @MainActor in
                    work()
                }
            }
        }
    ) {
        self.maxAttempts = maxAttempts
        self.schedule = schedule
    }

    func focus(_ textView: NSTextView, isDisabled: @escaping @MainActor () -> Bool) {
        attemptFocus(textView, isDisabled: isDisabled, attempt: 0)
    }

    private func attemptFocus(
        _ textView: NSTextView,
        isDisabled: @escaping @MainActor () -> Bool,
        attempt: Int
    ) {
        guard !isDisabled() else { return }
        guard let window = textView.window else {
            scheduleRetry(textView, isDisabled: isDisabled, attempt: attempt)
            return
        }

        window.initialFirstResponder = textView
        if window.firstResponder !== textView {
            window.makeFirstResponder(textView)
        }
        if window.firstResponder !== textView {
            scheduleRetry(textView, isDisabled: isDisabled, attempt: attempt)
        }
    }

    private func scheduleRetry(
        _ textView: NSTextView,
        isDisabled: @escaping @MainActor () -> Bool,
        attempt: Int
    ) {
        guard attempt < maxAttempts else { return }
        schedule { [weak self, weak textView] in
            guard let self, let textView else { return }
            self.attemptFocus(textView, isDisabled: isDisabled, attempt: attempt + 1)
        }
    }
}

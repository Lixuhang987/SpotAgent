import AppKit
import SwiftUI

@MainActor
struct PromptPanelGrowingTextView: NSViewRepresentable {
    @Binding var text: String
    @Binding var measuredHeight: CGFloat
    @Environment(\.appTheme) private var theme
    let placeholder: String
    let fontSize: CGFloat
    let isFocused: Bool
    let isDisabled: Bool
    let maxVisibleLines: Int
    let onMoveSelection: (PromptPanelActionSelectionDirection) -> Void
    let onSubmitSelectedAction: () -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(parent: self)
    }

    func makeNSView(context: Context) -> NSScrollView {
        let scrollView = NSScrollView()
        scrollView.drawsBackground = false
        scrollView.borderType = .noBorder
        scrollView.hasVerticalScroller = false
        scrollView.autohidesScrollers = true
        scrollView.verticalScrollElasticity = .automatic

        let textView = PlaceholderTextView()
        textView.delegate = context.coordinator
        textView.font = nsFont
        textView.textColor = NSColor(isDisabled ? theme.colors.textSecondary : theme.colors.textPrimary)
        textView.placeholder = placeholder
        textView.placeholderColor = NSColor(isDisabled ? theme.colors.mutedSoft : theme.colors.textSecondary)
        textView.backgroundColor = .clear
        textView.drawsBackground = false
        textView.isRichText = false
        textView.isEditable = !isDisabled
        textView.isSelectable = !isDisabled
        textView.allowsUndo = true
        textView.importsGraphics = false
        textView.textContainerInset = NSSize(width: 0, height: 0)
        textView.textContainer?.lineFragmentPadding = 0
        textView.textContainer?.widthTracksTextView = true
        textView.textContainer?.heightTracksTextView = false
        textView.minSize = NSSize(width: 0, height: 0)
        textView.maxSize = NSSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude)
        textView.isVerticallyResizable = true
        textView.isHorizontallyResizable = false
        textView.autoresizingMask = [.width]
        textView.string = text

        scrollView.documentView = textView
        context.coordinator.textView = textView
        context.coordinator.scrollView = scrollView
        context.coordinator.recalculateHeight()
        context.coordinator.focusIfNeeded()
        return scrollView
    }

    func updateNSView(_ scrollView: NSScrollView, context: Context) {
        context.coordinator.parent = self
        guard let textView = scrollView.documentView as? PlaceholderTextView else { return }

        if textView.string != text {
            textView.string = text
        }
        textView.font = nsFont
        textView.textColor = NSColor(isDisabled ? theme.colors.textSecondary : theme.colors.textPrimary)
        textView.placeholder = placeholder
        textView.placeholderColor = NSColor(isDisabled ? theme.colors.mutedSoft : theme.colors.textSecondary)
        textView.isEditable = !isDisabled
        textView.isSelectable = !isDisabled
        textView.needsDisplay = true
        context.coordinator.recalculateHeight()
        context.coordinator.focusIfNeeded()
    }

    private var nsFont: NSFont {
        .systemFont(ofSize: fontSize)
    }

    @MainActor
    final class Coordinator: NSObject, NSTextViewDelegate {
        var parent: PromptPanelGrowingTextView
        weak var textView: NSTextView?
        weak var scrollView: NSScrollView?
        private let focusRetrier = PromptPanelInputFocusRetrier()

        init(parent: PromptPanelGrowingTextView) {
            self.parent = parent
        }

        func textDidChange(_ notification: Notification) {
            guard let textView else { return }
            parent.text = textView.string
            recalculateHeight()
        }

        func textView(_ textView: NSTextView,
                      doCommandBy commandSelector: Selector) -> Bool {
            let modifierFlags = NSApp.currentEvent?.modifierFlags ?? []
            guard
                let command = PromptPanelInputCommand.resolve(
                    commandSelector: commandSelector,
                    modifierFlags: modifierFlags
                )
            else {
                return false
            }

            switch command {
            case .insertNewline:
                textView.insertNewlineIgnoringFieldEditor(nil)
            case .selectPreviousAction:
                parent.onMoveSelection(.previous)
            case .selectNextAction:
                parent.onMoveSelection(.next)
            case .submitSelectedAction:
                parent.onSubmitSelectedAction()
            }
            return true
        }

        func focusIfNeeded() {
            guard parent.isFocused, !parent.isDisabled, let textView else { return }
            focusRetrier.focus(textView, isDisabled: { [weak self] in
                self?.parent.isDisabled ?? true
            })
        }

        func recalculateHeight() {
            guard let textView, let scrollView else { return }
            textView.layoutManager?.ensureLayout(for: textView.textContainer!)

            let font = textView.font ?? parent.nsFont
            let lineHeight = font.ascender - font.descender + font.leading
            let maxHeight = lineHeight * CGFloat(parent.maxVisibleLines)
            let usedHeight = textView.layoutManager?.usedRect(for: textView.textContainer!).height ?? lineHeight
            let nextHeight = min(max(ceil(usedHeight), ceil(lineHeight)), ceil(maxHeight))
            let needsScroller = ceil(usedHeight) > ceil(maxHeight)

            scrollView.hasVerticalScroller = needsScroller
            if parent.measuredHeight != nextHeight {
                DispatchQueue.main.async {
                    self.parent.measuredHeight = nextHeight
                }
            }
        }
    }
}

private final class PlaceholderTextView: NSTextView {
    var placeholder: String = ""
    var placeholderColor: NSColor = .placeholderTextColor

    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)
        guard string.isEmpty, !placeholder.isEmpty else { return }

        let attributes: [NSAttributedString.Key: Any] = [
            .font: font ?? NSFont.systemFont(ofSize: NSFont.systemFontSize),
            .foregroundColor: placeholderColor
        ]
        placeholder.draw(at: textContainerOrigin, withAttributes: attributes)
    }
}

import AppKit
import SwiftUI

struct PromptPanelScrollbarPalette {
    let thumbColor: NSColor
    let hoverThumbColor: NSColor
    let thumbInset: CGFloat
    let cornerRadius: CGFloat
    let width: CGFloat

    static func make(theme: AppTheme) -> PromptPanelScrollbarPalette {
        PromptPanelScrollbarPalette(
            thumbColor: NSColor(theme.colors.textPrimary).withAlphaComponent(0.28),
            hoverThumbColor: NSColor(theme.colors.textPrimary).withAlphaComponent(0.42),
            thumbInset: 3,
            cornerRadius: 999,
            width: 10
        )
    }
}

@MainActor
enum PromptPanelScrollbarStyle {
    static func apply(to scrollView: NSScrollView, theme: AppTheme) {
        let palette = PromptPanelScrollbarPalette.make(theme: theme)

        scrollView.drawsBackground = false
        scrollView.backgroundColor = .clear
        scrollView.borderType = .noBorder
        scrollView.scrollerStyle = .overlay
        scrollView.autohidesScrollers = true
        scrollView.hasHorizontalScroller = false

        if let scroller = scrollView.verticalScroller as? PromptPanelOverlayScroller {
            scroller.palette = palette
        } else {
            let scroller = PromptPanelOverlayScroller()
            scroller.palette = palette
            scroller.scrollerStyle = .overlay
            scroller.controlSize = .small
            scrollView.verticalScroller = scroller
        }
    }
}

@MainActor
final class PromptPanelOverlayScroller: NSScroller {
    var palette = PromptPanelScrollbarPalette(
        thumbColor: .clear,
        hoverThumbColor: .clear,
        thumbInset: 3,
        cornerRadius: 999,
        width: 10
    ) {
        didSet { needsDisplay = true }
    }

    private var hoverTrackingArea: NSTrackingArea?
    private var isHovered = false {
        didSet {
            guard isHovered != oldValue else { return }
            needsDisplay = true
        }
    }

    override class func scrollerWidth(
        for controlSize: NSControl.ControlSize,
        scrollerStyle: NSScroller.Style
    ) -> CGFloat {
        PromptPanelScrollbarPalette.make(theme: .default).width
    }

    override func updateTrackingAreas() {
        if let hoverTrackingArea {
            removeTrackingArea(hoverTrackingArea)
        }

        let trackingArea = NSTrackingArea(
            rect: bounds,
            options: [.activeInKeyWindow, .inVisibleRect, .mouseEnteredAndExited],
            owner: self,
            userInfo: nil
        )
        addTrackingArea(trackingArea)
        hoverTrackingArea = trackingArea
        super.updateTrackingAreas()
    }

    override func mouseEntered(with event: NSEvent) {
        isHovered = true
        super.mouseEntered(with: event)
    }

    override func mouseExited(with event: NSEvent) {
        isHovered = false
        super.mouseExited(with: event)
    }

    override func drawKnobSlot(in slotRect: NSRect, highlight flag: Bool) {}

    override func drawKnob() {
        let knobRect = rect(for: .knob)
        guard !knobRect.isEmpty else { return }

        let insetRect = knobRect.insetBy(dx: palette.thumbInset, dy: palette.thumbInset)
        guard insetRect.width > 0, insetRect.height > 0 else { return }

        let color = isHovered ? palette.hoverThumbColor : palette.thumbColor
        color.setFill()
        NSBezierPath(
            roundedRect: insetRect,
            xRadius: min(palette.cornerRadius, insetRect.width / 2),
            yRadius: min(palette.cornerRadius, insetRect.width / 2)
        ).fill()
    }
}

struct PromptPanelContainerModifier: ViewModifier {
    @Environment(\.appTheme) private var theme

    func body(content: Content) -> some View {
        content
            .padding(theme.spacing.xl)
            .frame(minWidth: 640, minHeight: 420)
            .background(theme.colors.canvas.opacity(0.97))
            .clipShape(RoundedRectangle(cornerRadius: theme.radius.lg))
            .overlay(
                RoundedRectangle(cornerRadius: theme.radius.lg)
                    .strokeBorder(theme.colors.hairline, lineWidth: 0.8)
            )
            .shadow(color: theme.colors.ink.opacity(0.14), radius: 26, x: 0, y: 18)
    }
}

struct ActionRowModifier: ViewModifier {
    @Environment(\.appTheme) private var theme
    var isHighlighted: Bool = false

    func body(content: Content) -> some View {
        content
            .padding(.vertical, 9)
            .padding(.horizontal, theme.spacing.md)
            .background(
                RoundedRectangle(cornerRadius: theme.radius.md)
                    .fill(isHighlighted ? theme.colors.surfaceHover : Color.clear)
            )
            .overlay(
                RoundedRectangle(cornerRadius: theme.radius.md)
                    .strokeBorder(isHighlighted ? theme.colors.accentRing : Color.clear, lineWidth: 0.8)
            )
            .contentShape(RoundedRectangle(cornerRadius: theme.radius.md))
    }
}

struct PromptPanelIconButtonModifier: ViewModifier {
    @Environment(\.appTheme) private var theme
    let isHovered: Bool

    func body(content: Content) -> some View {
        content
            .frame(width: 32, height: 32)
            .background(
                RoundedRectangle(cornerRadius: theme.radius.md)
                    .fill(isHovered ? theme.colors.surfaceHover : Color.clear)
            )
            .contentShape(RoundedRectangle(cornerRadius: theme.radius.md))
    }
}

struct PromptPanelTriggerPillModifier: ViewModifier {
    @Environment(\.appTheme) private var theme
    let isHighlighted: Bool

    func body(content: Content) -> some View {
        content
            .font(theme.typography.captionFont)
            .foregroundStyle(isHighlighted ? theme.colors.accent : theme.colors.muted)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(
                Capsule()
                    .fill(isHighlighted ? theme.colors.surfaceHover : theme.colors.surfaceSoft)
            )
            .overlay(
                Capsule()
                    .strokeBorder(isHighlighted ? theme.colors.accentRing : theme.colors.hairlineSoft, lineWidth: 0.6)
            )
    }
}

extension View {
    func promptPanelContainer() -> some View {
        modifier(PromptPanelContainerModifier())
    }

    func actionRow(isHighlighted: Bool = false) -> some View {
        modifier(ActionRowModifier(isHighlighted: isHighlighted))
    }

    func promptPanelIconButton(isHovered: Bool) -> some View {
        modifier(PromptPanelIconButtonModifier(isHovered: isHovered))
    }

    func promptPanelTriggerPill(isHighlighted: Bool) -> some View {
        modifier(PromptPanelTriggerPillModifier(isHighlighted: isHighlighted))
    }
}

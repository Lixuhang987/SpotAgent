import AppKit
import Carbon.HIToolbox
import KeyboardShortcuts
import SwiftUI

struct PromptActionShortcutRecorder: NSViewRepresentable {
    let name: KeyboardShortcuts.Name

    func makeNSView(context: Context) -> PromptActionShortcutRecorderCocoa {
        PromptActionShortcutRecorderCocoa(for: name)
    }

    func updateNSView(_ nsView: PromptActionShortcutRecorderCocoa, context: Context) {
        nsView.shortcutName = name
    }
}

final class PromptActionShortcutRecorderCocoa: NSSearchField, NSSearchFieldDelegate {
    private static let minimumWidth = 130.0
    private static let shortcutDidChangeName = Notification.Name("KeyboardShortcuts_shortcutByNameDidChange")
    private static let functionKeyCodes: Set<UInt16> = [
        UInt16(kVK_F1), UInt16(kVK_F2), UInt16(kVK_F3), UInt16(kVK_F4), UInt16(kVK_F5),
        UInt16(kVK_F6), UInt16(kVK_F7), UInt16(kVK_F8), UInt16(kVK_F9), UInt16(kVK_F10),
        UInt16(kVK_F11), UInt16(kVK_F12), UInt16(kVK_F13), UInt16(kVK_F14), UInt16(kVK_F15),
        UInt16(kVK_F16), UInt16(kVK_F17), UInt16(kVK_F18), UInt16(kVK_F19), UInt16(kVK_F20)
    ]

    var shortcutName: KeyboardShortcuts.Name {
        didSet {
            guard shortcutName != oldValue else { return }
            setStringValue()
        }
    }

    private var canBecomeKey = false
    private var eventMonitor: Any?
    private var shortcutChangeObserver: NotificationToken?
    private var windowDidResignKeyObserver: NotificationToken?
    private var windowDidBecomeKeyObserver: NotificationToken?
    private var cancelButton: NSButtonCell?

    override var canBecomeKeyView: Bool { canBecomeKey }

    override var intrinsicContentSize: CGSize {
        var size = super.intrinsicContentSize
        size.width = Self.minimumWidth
        return size
    }

    private var showsCancelButton: Bool {
        get { (cell as? NSSearchFieldCell)?.cancelButtonCell != nil }
        set { (cell as? NSSearchFieldCell)?.cancelButtonCell = newValue ? cancelButton : nil }
    }

    init(for name: KeyboardShortcuts.Name) {
        self.shortcutName = name
        super.init(frame: NSRect(x: 0, y: 0, width: Self.minimumWidth, height: 24))
        delegate = self
        placeholderString = "Record Shortcut"
        alignment = .center
        (cell as? NSSearchFieldCell)?.searchButtonCell = nil
        wantsLayer = true
        setContentHuggingPriority(.defaultHigh, for: .vertical)
        setContentHuggingPriority(.defaultHigh, for: .horizontal)
        cancelButton = (cell as? NSSearchFieldCell)?.cancelButtonCell
        setStringValue()
        observeShortcutChanges()
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func controlTextDidChange(_ object: Notification) {
        if stringValue.isEmpty {
            PromptActionShortcutStore.setShortcut(nil, for: shortcutName)
        }
        showsCancelButton = !stringValue.isEmpty
    }

    func controlTextDidEndEditing(_ object: Notification) {
        endRecording()
    }

    override func viewDidMoveToWindow() {
        guard let window else {
            windowDidResignKeyObserver = nil
            windowDidBecomeKeyObserver = nil
            endRecording()
            return
        }

        windowDidResignKeyObserver = NotificationToken(NotificationCenter.default.addObserver(
            forName: NSWindow.didResignKeyNotification,
            object: window,
            queue: nil
        ) { [weak self] _ in
            Task { @MainActor in
                self?.endRecording()
                self?.window?.makeFirstResponder(nil)
            }
        })

        windowDidBecomeKeyObserver = NotificationToken(NotificationCenter.default.addObserver(
            forName: NSWindow.didBecomeKeyNotification,
            object: window,
            queue: nil
        ) { [weak self] _ in
            Task { @MainActor in
                self?.preventBecomingKey()
            }
        })

        preventBecomingKey()
    }

    override func becomeFirstResponder() -> Bool {
        guard window != nil else { return false }
        let didBecome = super.becomeFirstResponder()
        guard didBecome else { return didBecome }

        placeholderString = "Press Shortcut"
        showsCancelButton = !stringValue.isEmpty

        eventMonitor = NSEvent.addLocalMonitorForEvents(matching: [.keyDown, .leftMouseUp, .rightMouseUp]) { [weak self] event in
            self?.handle(event) ?? event
        }

        return didBecome
    }

    private func handle(_ event: NSEvent) -> NSEvent? {
        if event.type == .leftMouseUp || event.type == .rightMouseUp {
            let point = convert(event.locationInWindow, from: nil)
            if !bounds.insetBy(dx: -3, dy: -3).contains(point) {
                blur()
                return event
            }
            return nil
        }

        guard event.type == .keyDown else { return nil }

        let modifiers = event.modifierFlags.intersection([.command, .option, .control, .shift, .function])
        if modifiers.isEmpty, event.specialKey == .tab {
            blur()
            return event
        }

        if modifiers.isEmpty, event.keyCode == UInt16(kVK_Escape) {
            blur()
            return nil
        }

        if modifiers.isEmpty, isDeleteKey(event.keyCode) {
            clearShortcut()
            return nil
        }

        let hasRequiredModifier = !modifiers.subtracting([.shift, .function]).isEmpty
        guard hasRequiredModifier || Self.functionKeyCodes.contains(event.keyCode),
              let shortcut = KeyboardShortcuts.Shortcut(event: event)
        else {
            NSSound.beep()
            return nil
        }

        stringValue = shortcut.description
        showsCancelButton = true
        PromptActionShortcutStore.setShortcut(shortcut, for: shortcutName)
        blur()
        return nil
    }

    private func setStringValue() {
        stringValue = KeyboardShortcuts.getShortcut(for: shortcutName)?.description ?? ""
        showsCancelButton = !stringValue.isEmpty
    }

    private func observeShortcutChanges() {
        shortcutChangeObserver = NotificationToken(NotificationCenter.default.addObserver(
            forName: Self.shortcutDidChangeName,
            object: nil,
            queue: nil
        ) { [weak self] notification in
            let changedName = notification.userInfo?["name"] as? KeyboardShortcuts.Name
            Task { @MainActor in
                guard
                    let self,
                    let name = changedName,
                    name == self.shortcutName
                else {
                    return
                }
                self.setStringValue()
            }
        })
    }

    private func preventBecomingKey() {
        canBecomeKey = false
        DispatchQueue.main.async { [weak self] in
            self?.canBecomeKey = true
        }
    }

    private func clearShortcut() {
        stringValue = ""
        showsCancelButton = false
        PromptActionShortcutStore.setShortcut(nil, for: shortcutName)
        blur()
    }

    private func blur() {
        window?.makeFirstResponder(nil)
        endRecording()
    }

    private func endRecording() {
        placeholderString = "Record Shortcut"
        showsCancelButton = !stringValue.isEmpty
        removeEventMonitor()
    }

    private func removeEventMonitor() {
        if let eventMonitor {
            NSEvent.removeMonitor(eventMonitor)
            self.eventMonitor = nil
        }
    }

    private func isDeleteKey(_ keyCode: UInt16) -> Bool {
        keyCode == UInt16(kVK_Delete) || keyCode == UInt16(kVK_ForwardDelete)
    }
}

private final class NotificationToken: @unchecked Sendable {
    private let token: NSObjectProtocol

    init(_ token: NSObjectProtocol) {
        self.token = token
    }

    deinit {
        NotificationCenter.default.removeObserver(token)
    }
}

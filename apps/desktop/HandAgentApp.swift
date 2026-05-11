import AppKit
import ApplicationServices
import Carbon.HIToolbox
import SwiftUI
import WebKit

private struct PromptPayload: Codable {
    let visible: Bool
    let prefill: String
}

private struct HostStatusPayload: Codable {
    let hotkeyAvailable: Bool
    let message: String
}

private struct BubblePayload: Codable {
    let id: String
    let text: String
}

@main
struct HandAgentApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        Settings {
            EmptyView()
        }
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    let controller = DesktopController()

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        controller.start()
    }
}

@MainActor
final class DesktopController: NSObject, NSWindowDelegate, WKNavigationDelegate {
    private let hotkeyMonitor = HotkeyMonitor()
    private var window: NSPanel?
    private let webView = WKWebView(frame: .zero)
    private var pendingPrefill: String?
    private var isWebViewReady = false
    private var hostStatus = HostStatusPayload(
        hotkeyAvailable: false,
        message: "正在检查全局热键权限…"
    )

    func start() {
        hotkeyMonitor.onTrigger = { [weak self] in
            self?.handleHotkey()
        }

        ensureWindow()
        let isHotkeyRegistered = hotkeyMonitor.start()
        hostStatus = makeHostStatus(isHotkeyRegistered: isHotkeyRegistered)
        publishHostStatus()
    }

    func webViewDidFinishLoading() {
        isWebViewReady = true
        publishHostStatus()
        flushPendingPrompt()
    }

    func handleHotkey() {
        toggleWindow()
    }

    private func presentPrompt(prefill: String) {
        guard isWebViewReady else {
            pendingPrefill = prefill
            return
        }

        pendingPrefill = nil

        if let window = webView.window {
            NSApp.activate(ignoringOtherApps: true)
            window.makeKeyAndOrderFront(nil)
        }

        let payload = PromptPayload(visible: true, prefill: prefill)
        guard let data = try? JSONEncoder().encode(payload),
              let json = String(data: data, encoding: .utf8) else {
            return
        }

        webView.evaluateJavaScript("""
        window.dispatchEvent(new CustomEvent("handagent:openPrompt", { detail: \(json) }));
        """)
    }

    private func ensureWindow() {
        guard window == nil else { return }

        webView.navigationDelegate = self
        loadBootstrapHTML(into: webView)

        let panel = NSPanel(
            contentRect: NSRect(x: 0, y: 0, width: 720, height: 520),
            styleMask: [.titled, .closable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        panel.isReleasedWhenClosed = false
        panel.isFloatingPanel = true
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.titleVisibility = .hidden
        panel.titlebarAppearsTransparent = true
        panel.isMovableByWindowBackground = true
        panel.hidesOnDeactivate = true
        panel.standardWindowButton(.closeButton)?.isHidden = true
        panel.standardWindowButton(.miniaturizeButton)?.isHidden = true
        panel.standardWindowButton(.zoomButton)?.isHidden = true
        panel.delegate = self
        panel.contentView = webView
        panel.orderOut(nil)

        window = panel
    }

    private func showWindow() {
        ensureWindow()
        guard let window else { return }

        NSApp.activate(ignoringOtherApps: true)
        window.center()
        window.makeKeyAndOrderFront(nil)
    }

    private func hideWindow() {
        window?.orderOut(nil)
    }

    private func toggleWindow() {
        ensureWindow()
        guard let window else { return }

        if window.isVisible {
            hideWindow()
            return
        }

        showWindow()
        presentPrompt(prefill: "")
    }

    private func flushPendingPrompt() {
        guard let pendingPrefill else { return }
        self.pendingPrefill = nil
        presentPrompt(prefill: pendingPrefill)
    }

    private func publishHostStatus() {
        guard let data = try? JSONEncoder().encode(hostStatus),
              let json = String(data: data, encoding: .utf8) else {
            return
        }

        webView.evaluateJavaScript("""
        window.dispatchEvent(new CustomEvent("handagent:hostStatus", { detail: \(json) }));
        """)
    }

    private func publishBubble(id: String, text: String) {
        guard let data = try? JSONEncoder().encode(BubblePayload(id: id, text: text)),
              let json = String(data: data, encoding: .utf8) else {
            return
        }

        webView.evaluateJavaScript("""
        window.dispatchEvent(new CustomEvent("handagent:bubble", { detail: \(json) }));
        """)
    }

    private func makeHostStatus(isHotkeyRegistered: Bool) -> HostStatusPayload {
        if isHotkeyRegistered {
            return HostStatusPayload(
                hotkeyAvailable: true,
                message: "全局热键已就绪，可随时唤起输入框。"
            )
        }

        return HostStatusPayload(
            hotkeyAvailable: false,
            message: "全局热键注册失败，请检查快捷键冲突。"
        )
    }
    
    func windowWillClose(_ notification: Notification) {
        hideWindow()
    }

    func windowDidResignKey(_ notification: Notification) {
        hideWindow()
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        webViewDidFinishLoading()
    }

    private func loadBootstrapHTML(into webView: WKWebView) {
        guard let url = Bundle.module.url(forResource: "index", withExtension: "html") else {
            return
        }

        webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
    }
}

final class HotkeyMonitor {
    var onTrigger: (() -> Void)?
    private var hotKeyRef: EventHotKeyRef?
    private var eventHandlerRef: EventHandlerRef?

    private let targetKeyCode: UInt32 = UInt32(kVK_Space)
    private let targetModifiers: UInt32 = UInt32(cmdKey | shiftKey)
    private let hotKeyID = EventHotKeyID(signature: OSType(0x48414754), id: 1)

    func start() -> Bool {
        stop()

        let eventType = EventTypeSpec(
            eventClass: UInt32(kEventClassKeyboard),
            eventKind: UInt32(kEventHotKeyPressed)
        )

        let installStatus = InstallEventHandler(
            GetApplicationEventTarget(),
            { _, event, userData in
                guard let userData else { return noErr }

                let monitor = Unmanaged<HotkeyMonitor>.fromOpaque(userData).takeUnretainedValue()
                guard let event else { return noErr }

                var pressedHotKeyID = EventHotKeyID()
                let parameterStatus = GetEventParameter(
                    event,
                    EventParamName(kEventParamDirectObject),
                    EventParamType(typeEventHotKeyID),
                    nil,
                    MemoryLayout<EventHotKeyID>.size,
                    nil,
                    &pressedHotKeyID
                )

                guard parameterStatus == noErr, pressedHotKeyID.id == monitor.hotKeyID.id else {
                    return noErr
                }

                DispatchQueue.main.async { [weak monitor] in
                    monitor?.onTrigger?()
                }

                return noErr
            },
            1,
            [eventType],
            Unmanaged.passUnretained(self).toOpaque(),
            &eventHandlerRef
        )

        guard installStatus == noErr else {
            return false
        }

        let registerStatus = RegisterEventHotKey(
            targetKeyCode,
            targetModifiers,
            hotKeyID,
            GetApplicationEventTarget(),
            0,
            &hotKeyRef
        )

        if registerStatus != noErr {
            stop()
            return false
        }

        return true
    }

    func stop() {
        if let hotKeyRef {
            UnregisterEventHotKey(hotKeyRef)
            self.hotKeyRef = nil
        }
        if let eventHandlerRef {
            RemoveEventHandler(eventHandlerRef)
            self.eventHandlerRef = nil
        }
    }
}

import AppKit
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

private final class WindowDragHandleView: NSView {
    override var mouseDownCanMoveWindow: Bool {
        true
    }
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
    private let services = AppServices()
    private let agentServerURL = URL(string: "ws://127.0.0.1:4317/api/session")!
    private let controller = DesktopController()
    private let promptPanelController = PromptPanelController()
    private lazy var statusBubbleController = StatusBubbleController(registry: services.sessionRegistry)
    private var sessionWindows: [String: SessionWindowController] = [:]

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)

        promptPanelController.onSubmit = { [weak self] draft, attachments in
            self?.openSessionWindow(for: draft, attachments: attachments)
        }

        services.hotkeyService.onTrigger = { [promptPanelController] in
            promptPanelController.show()
        }
        statusBubbleController.onTap = { [weak self] sessionID in
            self?.handleStatusBubbleTap(sessionID: sessionID)
        }

        try? services.agentServerService.start()
        controller.start()
        controller.updateHostStatus(isHotkeyRegistered: services.hotkeyService.start())
        statusBubbleController.show()
    }

    func applicationWillTerminate(_ notification: Notification) {
        services.hotkeyService.stop()
        services.agentServerService.stop()
        sessionWindows.values.forEach { $0.close() }
        sessionWindows.removeAll()
        controller.stop()
    }

    private func openSessionWindow(for draft: String, attachments: [PromptAttachmentResult]) {
        let trimmedDraft = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedDraft.isEmpty else { return }

        let attachmentText = attachments.compactMap { attachment -> String? in
            switch attachment {
            case .noAttachment:
                return nil
            case .textToken(let token):
                return token
            }
        }

        let composedPrompt = ([trimmedDraft] + attachmentText).joined(separator: "\n\n")
        let sessionID = UUID().uuidString
        let viewModel = SessionViewModel(
            sessionID: sessionID,
            socketClient: SessionSocketClient(serverURL: agentServerURL)
        )
        let windowController = SessionWindowController(viewModel: viewModel)

        windowController.onClose = { [weak self, weak viewModel] in
            guard let self else { return }

            self.sessionWindows[sessionID] = nil
            self.services.sessionRegistry.upsert(
                SessionSummary(
                    sessionId: sessionID,
                    isRunning: viewModel?.status == "running",
                    latestSummary: viewModel?.messages.last?.text ?? trimmedDraft,
                    lastActiveAt: .now,
                    windowIsOpen: false
                )
            )
        }

        sessionWindows[sessionID] = windowController
        services.sessionRegistry.upsert(
            SessionSummary(
                sessionId: sessionID,
                isRunning: true,
                latestSummary: composedPrompt,
                lastActiveAt: .now,
                windowIsOpen: true
            )
        )

        windowController.showWindow(nil)
        viewModel.start(initialPrompt: composedPrompt)
    }

    private func handleStatusBubbleTap(sessionID: String?) {
        if let sessionID {
            focusSessionWindow(with: sessionID)
            return
        }

        promptPanelController.show()
    }

    private func focusSessionWindow(with sessionID: String) {
        if let windowController = sessionWindows[sessionID] {
            windowController.showWindow(nil)
        } else {
            promptPanelController.show()
        }
    }
}

@MainActor
final class DesktopController: NSObject, NSWindowDelegate, WKNavigationDelegate {
    private let dragHandleHeight: CGFloat = 36
    private let agentServerURL = URL(string: "ws://127.0.0.1:4317/api/session")!
    private var window: NSPanel?
    private lazy var webView: WKWebView = {
        let configuration = WKWebViewConfiguration()
        let userContentController = WKUserContentController()
        let serverURLLiteral = (try? JSONEncoder().encode(agentServerURL.absoluteString))
            .flatMap { String(data: $0, encoding: .utf8) } ?? "\"\(agentServerURL.absoluteString)\""

        userContentController.addUserScript(
            WKUserScript(
                source: "window.__HANDAGENT_SERVER_URL__ = \(serverURLLiteral);",
                injectionTime: .atDocumentStart,
                forMainFrameOnly: true
            )
        )
        configuration.userContentController = userContentController

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        return webView
    }()
    private var pendingPrefill: String?
    private var isWebViewReady = false
    private var hostStatus = HostStatusPayload(
        hotkeyAvailable: false,
        message: "正在检查全局热键权限…"
    )

    func start() {
        ensureWindow()
        publishHostStatus()
    }

    func webViewDidFinishLoading() {
        isWebViewReady = true
        publishHostStatus()
        flushPendingPrompt()
    }

    func stop() {
        hideWindow()
    }

    func handleHotkey() {
        toggleWindow()
    }

    func updateHostStatus(isHotkeyRegistered: Bool) {
        hostStatus = makeHostStatus(isHotkeyRegistered: isHotkeyRegistered)
        publishHostStatus()
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
        panel.contentView = makePanelContentView()
        panel.orderOut(nil)

        window = panel
    }

    private func makePanelContentView() -> NSView {
        let contentView = NSView()
        contentView.wantsLayer = true

        let dragHandle = WindowDragHandleView()
        dragHandle.translatesAutoresizingMaskIntoConstraints = false
        dragHandle.wantsLayer = true
        dragHandle.layer?.backgroundColor = NSColor.windowBackgroundColor.withAlphaComponent(0.001).cgColor

        webView.translatesAutoresizingMaskIntoConstraints = false

        contentView.addSubview(dragHandle)
        contentView.addSubview(webView)

        NSLayoutConstraint.activate([
            dragHandle.topAnchor.constraint(equalTo: contentView.topAnchor),
            dragHandle.leadingAnchor.constraint(equalTo: contentView.leadingAnchor),
            dragHandle.trailingAnchor.constraint(equalTo: contentView.trailingAnchor),
            dragHandle.heightAnchor.constraint(equalToConstant: dragHandleHeight),

            webView.topAnchor.constraint(equalTo: dragHandle.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: contentView.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: contentView.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: contentView.bottomAnchor)
        ])

        return contentView
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

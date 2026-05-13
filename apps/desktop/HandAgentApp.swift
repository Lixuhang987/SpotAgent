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

    func applicationWillTerminate(_ notification: Notification) {
        controller.stop()
    }
}

@MainActor
final class DesktopController: NSObject, NSWindowDelegate, WKNavigationDelegate {
    private let hotkeyMonitor = HotkeyMonitor()
    private let agentServerRelativePath = "apps/agent-server/src/server.ts"
    private let agentServerURL = URL(string: "ws://127.0.0.1:4317/api/session")!
    private var agentServerProcess: Process?
    private var agentServerOutputPipe: Pipe?
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
        startAgentServer()
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

    func stop() {
        hotkeyMonitor.stop()
        stopAgentServer()
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

    private func startAgentServer() {
        guard agentServerProcess == nil else { return }

        guard let repoRoot = locateRepositoryRoot() else {
            return
        }

        let serverURL = repoRoot.appendingPathComponent(agentServerRelativePath)
        guard FileManager.default.fileExists(atPath: serverURL.path) else {
            return
        }

        let process = Process()
        process.currentDirectoryURL = repoRoot
        process.environment = makeAgentServerEnvironment(repoRoot: repoRoot)
        let nodeArguments = [
            "--experimental-transform-types",
            "--experimental-specifier-resolution=node",
            serverURL.path
        ]

        if let nodeExecutable = locateNodeExecutable() {
            process.executableURL = URL(fileURLWithPath: nodeExecutable)
            process.arguments = nodeArguments
        } else {
            process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
            process.arguments = ["node"] + nodeArguments
        }

        let pipe = Pipe()
        pipe.fileHandleForReading.readabilityHandler = { handle in
            if handle.availableData.isEmpty {
                handle.readabilityHandler = nil
            }
        }
        process.standardOutput = pipe
        process.standardError = pipe

        do {
            try process.run()
            agentServerProcess = process
            agentServerOutputPipe = pipe
        } catch {
            pipe.fileHandleForReading.readabilityHandler = nil
        }
    }

    private func makeAgentServerEnvironment(repoRoot: URL) -> [String: String] {
        var environment = ProcessInfo.processInfo.environment
        let separator = ":"
        let extraNodePaths = [
            repoRoot.appendingPathComponent("apps/agent-server/node_modules").path,
            repoRoot.appendingPathComponent("apps/desktop/Web/node_modules").path
        ]
        let existingNodePath = environment["NODE_PATH"].flatMap { $0.isEmpty ? nil : $0 }
        let combinedNodePath = (extraNodePaths + [existingNodePath].compactMap { $0 }).joined(separator: separator)
        environment["NODE_PATH"] = combinedNodePath
        return environment
    }

    private func stopAgentServer() {
        agentServerOutputPipe?.fileHandleForReading.readabilityHandler = nil
        agentServerOutputPipe = nil
        agentServerProcess?.terminate()
        agentServerProcess = nil
    }

    private func locateRepositoryRoot() -> URL? {
        let fileManager = FileManager.default
        let candidates: [URL] = [
            Bundle.main.executableURL,
            Bundle.main.resourceURL,
            Bundle.main.bundleURL,
            URL(fileURLWithPath: fileManager.currentDirectoryPath)
        ].compactMap { $0 }

        for candidate in candidates {
            if let root = findRepositoryRoot(startingAt: candidate) {
                return root
            }
        }

        return nil
    }

    private func findRepositoryRoot(startingAt url: URL) -> URL? {
        let fileManager = FileManager.default
        var current = url.standardizedFileURL

        while true {
            let packageManifest = current.appendingPathComponent("Package.swift")
            let serverPath = current.appendingPathComponent(agentServerRelativePath)

            if fileManager.fileExists(atPath: packageManifest.path),
               fileManager.fileExists(atPath: serverPath.path) {
                return current
            }

            let parent = current.deletingLastPathComponent()
            if parent.path == current.path {
                return nil
            }

            current = parent
        }
    }

    private func locateNodeExecutable() -> String? {
        let fileManager = FileManager.default
        let searchDirectories = (
            ProcessInfo.processInfo.environment["PATH"]?
                .split(separator: ":")
                .map(String.init) ?? []
        ) + [
            "/opt/homebrew/bin",
            "/usr/local/bin",
            "/usr/bin"
        ]

        for directory in searchDirectories {
            let candidate = URL(fileURLWithPath: directory).appendingPathComponent("node").path
            if fileManager.isExecutableFile(atPath: candidate) {
                return candidate
            }
        }

        return nil
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

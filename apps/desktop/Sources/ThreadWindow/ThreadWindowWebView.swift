import SwiftUI
import WebKit

struct ThreadWindowWebView: NSViewRepresentable {
    let host: ThreadWindowWebHost

    func makeCoordinator() -> Coordinator {
        Coordinator(host: host)
    }

    func makeNSView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        let userScript = WKUserScript(
            source: host.configurationScript,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        configuration.userContentController.addUserScript(userScript)

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        context.coordinator.attach(webView)
        load(host.webAppURL, in: webView)
        return webView
    }

    func updateNSView(_ webView: WKWebView, context: Context) {}

    private func load(_ url: URL, in webView: WKWebView) {
        if url.isFileURL {
            webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        } else {
            webView.load(URLRequest(url: url))
        }
    }

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate {
        private let host: ThreadWindowWebHost
        private weak var webView: WKWebView?
        private var didFinishInitialNavigation = false

        init(host: ThreadWindowWebHost) {
            self.host = host
        }

        func attach(_ webView: WKWebView) {
            self.webView = webView
            host.onInitialPromptsEnqueued = { [weak self] in
                self?.drainIfReady()
            }
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            didFinishInitialNavigation = true
            drainInitialPrompts(into: webView)
        }

        private func drainIfReady() {
            guard didFinishInitialNavigation, let webView else { return }
            drainInitialPrompts(into: webView)
        }

        private func drainInitialPrompts(into webView: WKWebView) {
            for prompt in host.drainInitialPrompts() {
                guard
                    let data = try? JSONEncoder().encode(prompt),
                    let json = String(data: data, encoding: .utf8)
                else { continue }
                let script = """
                if (typeof window.handAgentReceiveInitialPrompt === "function") {
                  window.handAgentReceiveInitialPrompt(\(json));
                }
                """
                webView.evaluateJavaScript(script)
            }
        }
    }
}

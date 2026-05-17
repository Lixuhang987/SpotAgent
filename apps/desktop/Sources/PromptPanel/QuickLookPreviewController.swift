import AppKit
import Quartz

@MainActor
final class QuickLookPreviewController: NSObject {
    private var previewItem: QuickLookPreviewItem?
    private var resignKeyObserver: NSObjectProtocol?

    var onClose: (() -> Void)?

    static var isQuickLookVisible: Bool {
        QLPreviewPanel.sharedPreviewPanelExists() && QLPreviewPanel.shared().isVisible
    }

    func present(base64: String, mimeType: String, title: String) {
        cleanupTempFile()
        guard let data = Data(base64Encoded: base64) else { return }
        let ext = fileExtension(for: mimeType)
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("handagent-preview-\(UUID().uuidString).\(ext)")
        do {
            try data.write(to: url)
        } catch {
            return
        }
        previewItem = QuickLookPreviewItem(url: url, title: title)

        guard let panel = QLPreviewPanel.shared() else { return }
        panel.dataSource = self
        panel.delegate = self
        panel.reloadData()

        if resignKeyObserver == nil {
            resignKeyObserver = NotificationCenter.default.addObserver(
                forName: NSWindow.didResignKeyNotification,
                object: panel,
                queue: .main
            ) { [weak self] _ in
                Task { @MainActor in
                    self?.handleClose()
                }
            }
        }

        panel.makeKeyAndOrderFront(nil)
    }

    func dismiss() {
        if Self.isQuickLookVisible {
            QLPreviewPanel.shared().orderOut(nil)
        }
        handleClose()
    }

    private func handleClose() {
        if let observer = resignKeyObserver {
            NotificationCenter.default.removeObserver(observer)
            resignKeyObserver = nil
        }
        cleanupTempFile()
        onClose?()
    }

    private func cleanupTempFile() {
        if let url = previewItem?.url {
            try? FileManager.default.removeItem(at: url)
        }
        previewItem = nil
    }

    private func fileExtension(for mimeType: String) -> String {
        switch mimeType.lowercased() {
        case "image/png": return "png"
        case "image/jpeg", "image/jpg": return "jpg"
        case "image/gif": return "gif"
        case "image/heic": return "heic"
        case "image/webp": return "webp"
        default: return "png"
        }
    }
}

extension QuickLookPreviewController: QLPreviewPanelDataSource {
    nonisolated func numberOfPreviewItems(in panel: QLPreviewPanel!) -> Int {
        MainActor.assumeIsolated { previewItem == nil ? 0 : 1 }
    }

    nonisolated func previewPanel(_ panel: QLPreviewPanel!, previewItemAt index: Int) -> QLPreviewItem! {
        MainActor.assumeIsolated { previewItem }
    }
}

extension QuickLookPreviewController: QLPreviewPanelDelegate {}

private final class QuickLookPreviewItem: NSObject, QLPreviewItem, @unchecked Sendable {
    let url: URL
    let title: String

    init(url: URL, title: String) {
        self.url = url
        self.title = title
    }

    var previewItemURL: URL? { url }
    var previewItemTitle: String? { title }
}

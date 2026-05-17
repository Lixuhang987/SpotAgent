import AppKit
import Foundation

struct PlatformBridgeError: Error {
    let code: String
    let message: String
}

@MainActor
protocol PlatformProvider {
    func handle(method: String, args: Any?) async throws -> Any?
}

@MainActor
final class MacPlatformProvider: PlatformProvider {
    func handle(method: String, args: Any?) async throws -> Any? {
        switch method {
        case "clipboard.read":
            return readClipboard()
        case "app.frontmost":
            return frontmostApp()
        case "window.list":
            return windowList()
        case "screen.capture", "ocr.read", "accessibility.snapshot", "accessibility.action":
            throw PlatformBridgeError(
                code: "not_implemented",
                message: "macOS provider has not implemented \(method) yet"
            )
        default:
            throw PlatformBridgeError(
                code: "unknown_method",
                message: "Unknown platform method: \(method)"
            )
        }
    }

    private func readClipboard() -> [String: Any?] {
        let pasteboard = NSPasteboard.general
        let text = pasteboard.string(forType: .string)
        return ["text": text as Any?]
    }

    private func frontmostApp() -> [String: Any?] {
        let app = NSWorkspace.shared.frontmostApplication
        return [
            "name": app?.localizedName as Any?,
            "bundleId": app?.bundleIdentifier as Any?,
            "pid": app.map { Int($0.processIdentifier) } as Any?,
            "resolution": "best_effort",
        ]
    }

    private func windowList() -> [[String: Any?]] {
        let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
        let infoList = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] ?? []
        return infoList.compactMap { info -> [String: Any?]? in
            let layer = info[kCGWindowLayer as String] as? Int ?? 0
            if layer != 0 { return nil }
            return [
                "id": info[kCGWindowNumber as String] as? Int as Any?,
                "title": info[kCGWindowName as String] as? String as Any?,
                "appName": info[kCGWindowOwnerName as String] as? String as Any?,
            ]
        }
    }
}

import AppKit
import CoreGraphics
import Foundation
import ImageIO
@preconcurrency import ScreenCaptureKit
import UniformTypeIdentifiers

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
        case "screen.capture":
            return try await captureScreen(args: args)
        case "ocr.read", "accessibility.snapshot", "accessibility.action":
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

    private func captureScreen(args: Any?) async throws -> [String: Any?] {
        let argsDict = args as? [String: Any] ?? [:]
        let target = argsDict["target"] as? [String: Any]
        let kind = target?["kind"] as? String

        let content: SCShareableContent
        do {
            content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
        } catch {
            throw PlatformBridgeError(
                code: "permission_denied",
                message: "Failed to enumerate shareable content (\(error.localizedDescription))。请确认 HandAgent 已获得「屏幕录制」权限。"
            )
        }

        switch kind {
        case "window":
            guard let windowId = (target?["windowId"] as? NSNumber)?.intValue else {
                throw PlatformBridgeError(
                    code: "invalid_argument",
                    message: "screen.capture window target requires integer windowId"
                )
            }
            guard let window = content.windows.first(where: { Int($0.windowID) == windowId }) else {
                throw PlatformBridgeError(code: "not_found", message: "No window found with id \(windowId)")
            }
            let image = try await captureImage(
                filter: SCContentFilter(desktopIndependentWindow: window),
                width: max(64, Int(window.frame.width)),
                height: max(64, Int(window.frame.height))
            )
            return try makeResponse(image: image, target: target)

        case "region":
            guard
                let x = (target?["x"] as? NSNumber)?.intValue,
                let y = (target?["y"] as? NSNumber)?.intValue,
                let width = (target?["width"] as? NSNumber)?.intValue,
                let height = (target?["height"] as? NSNumber)?.intValue
            else {
                throw PlatformBridgeError(
                    code: "invalid_argument",
                    message: "screen.capture region target requires integer x/y/width/height"
                )
            }
            let display = try resolveDisplay(displayId: target?["displayId"] as? String, content: content)
            let full = try await captureImage(
                filter: SCContentFilter(display: display, excludingWindows: []),
                width: display.width,
                height: display.height
            )
            let cropRect = CGRect(x: x, y: y, width: width, height: height)
            guard let cropped = full.cropping(to: cropRect) else {
                throw PlatformBridgeError(
                    code: "invalid_argument",
                    message: "Region rect (\(x),\(y) \(width)x\(height)) is outside display bounds (\(display.width)x\(display.height))"
                )
            }
            return try makeResponse(image: cropped, target: target)

        default:
            let display = try resolveDisplay(
                displayId: target?["displayId"] as? String ?? target?["screenId"] as? String,
                content: content
            )
            let image = try await captureImage(
                filter: SCContentFilter(display: display, excludingWindows: []),
                width: display.width,
                height: display.height
            )
            return try makeResponse(image: image, target: target)
        }
    }

    private func resolveDisplay(displayId: String?, content: SCShareableContent) throws -> SCDisplay {
        if
            let displayId,
            let id = UInt32(displayId),
            let found = content.displays.first(where: { $0.displayID == id })
        {
            return found
        }
        guard let first = content.displays.first else {
            throw PlatformBridgeError(code: "not_found", message: "No displays available")
        }
        return first
    }

    private func captureImage(filter: SCContentFilter, width: Int, height: Int) async throws -> CGImage {
        let config = SCStreamConfiguration()
        config.width = max(1, width)
        config.height = max(1, height)
        config.showsCursor = false
        do {
            return try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: config)
        } catch {
            throw PlatformBridgeError(
                code: "capture_failed",
                message: "ScreenCaptureKit capture failed: \(error.localizedDescription)"
            )
        }
    }

    private func makeResponse(image: CGImage, target: [String: Any]?) throws -> [String: Any?] {
        guard let png = pngData(from: image) else {
            throw PlatformBridgeError(code: "encode_failed", message: "Failed to encode captured image as PNG")
        }
        return [
            "imageBase64": png.base64EncodedString(),
            "mimeType": "image/png",
            "width": image.width,
            "height": image.height,
            "target": target,
            "resolution": "best_effort",
        ]
    }

    private func pngData(from image: CGImage) -> Data? {
        let mutable = NSMutableData()
        guard let dest = CGImageDestinationCreateWithData(mutable, UTType.png.identifier as CFString, 1, nil) else {
            return nil
        }
        CGImageDestinationAddImage(dest, image, nil)
        guard CGImageDestinationFinalize(dest) else { return nil }
        return mutable as Data
    }
}

import AppKit
import ApplicationServices
import CoreGraphics
import Foundation
import ImageIO
@preconcurrency import ScreenCaptureKit
import UniformTypeIdentifiers
import Vision

private let macPlatformAXWindowNumberAttribute = "AXWindowNumber"

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
        case "app.list":
            return appList()
        case "app.frontmost":
            return frontmostApp()
        case "window.list":
            return windowList()
        case "screen.capture":
            return try await captureScreen(args: args)
        case "ocr.read":
            return try await readOCR(args: args)
        case "accessibility.snapshot":
            return try accessibilitySnapshot(args: args)
        case "accessibility.action":
            return try accessibilityAction(args: args)
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

    private func appList() -> [[String: Any?]] {
        NSWorkspace.shared.runningApplications
            .sorted { lhs, rhs in
                (lhs.localizedName ?? lhs.bundleIdentifier ?? "") <
                    (rhs.localizedName ?? rhs.bundleIdentifier ?? "")
            }
            .map { app in
                [
                    "name": app.localizedName as Any?,
                    "bundleId": app.bundleIdentifier as Any?,
                    "pid": Int(app.processIdentifier),
                    "isActive": app.isActive,
                    "activationPolicy": app.activationPolicy.readableName,
                    "resolution": "best_effort",
                ]
            }
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

        let hasScreenCaptureAccess = try MacPlatformScreenCapturePermission.ensureAllowed()

        let content: SCShareableContent
        do {
            content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
        } catch {
            throw MacPlatformScreenCapturePermission.shareableContentError(
                error,
                preflightAccess: hasScreenCaptureAccess
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

    private func readOCR(args: Any?) async throws -> [String: Any] {
        let request = try MacPlatformOCRRequest.parse(args: args)
        guard let source = CGImageSourceCreateWithData(request.imageData as CFData, nil),
              let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
            throw PlatformBridgeError(
                code: "invalid_argument",
                message: "ocr.read imageBase64 must contain a decodable image"
            )
        }

        let observations = try recognizeText(in: image, language: request.language)
        let lines = observations.compactMap { observation -> [String: Any]? in
            guard let candidate = observation.topCandidates(1).first else { return nil }
            return [
                "text": candidate.string,
                "confidence": Double(candidate.confidence),
            ]
        }
        let text = lines.compactMap { $0["text"] as? String }.joined(separator: "\n")
        return [
            "text": text,
            "lines": lines,
            "resolution": "best_effort",
        ]
    }

    private func recognizeText(in image: CGImage, language: String?) throws -> [VNRecognizedTextObservation] {
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = true
        if let language, !language.isEmpty {
            request.recognitionLanguages = [language]
        }

        let handler = VNImageRequestHandler(cgImage: image, options: [:])
        do {
            try handler.perform([request])
            return request.results ?? []
        } catch {
            throw PlatformBridgeError(
                code: "ocr_failed",
                message: "Vision OCR failed: \(error.localizedDescription)"
            )
        }
    }

    private func accessibilitySnapshot(args: Any?) throws -> [String: Any?] {
        guard MacPlatformAccessibilityPermission.isTrusted() else {
            throw MacPlatformAccessibilityPermission.deniedError()
        }
        let request = try MacPlatformAccessibilitySnapshotRequest.parse(args: args)
        let root = try resolveSnapshotRoot(for: request.target)
        return snapshot(
            element: root.element,
            target: request.target.dictionary,
            elementId: root.elementId,
            depth: 0,
            maxDepth: request.maxDepth,
            maxChildren: request.maxChildren
        )
    }

    private func accessibilityAction(args: Any?) throws -> [String: Any?] {
        guard MacPlatformAccessibilityPermission.isTrusted() else {
            throw MacPlatformAccessibilityPermission.deniedError()
        }
        let request = try MacPlatformAccessibilityActionRequest.parse(args: args)
        let element = try resolveActionTarget(request.target)

        switch request.action {
        case .press:
            try performPress(on: element, actionName: "press")
        case .click:
            do {
                try performPress(on: element, actionName: "click")
            } catch {
                try performMouseClick(on: element)
            }
        case .setValue(let value):
            let result = AXUIElementSetAttributeValue(element, kAXValueAttribute as CFString, value as CFTypeRef)
            guard result == .success else {
                throw PlatformBridgeError(
                    code: "action_failed",
                    message: "accessibility.action set_value failed: \(result.readableName)"
                )
            }
        }

        return [
            "ok": true,
            "target": request.target.dictionary,
            "action": request.action.dictionary,
            "resolution": "best_effort",
        ]
    }

    private func resolveSnapshotRoot(
        for target: MacPlatformAccessibilitySnapshotTarget
    ) throws -> (element: AXUIElement, elementId: String?) {
        switch target {
        case .frontmostApp:
            guard let pid = NSWorkspace.shared.frontmostApplication?.processIdentifier else {
                throw PlatformBridgeError(code: "not_found", message: "No frontmost app is available")
            }
            return (AXUIElementCreateApplication(pid), "pid:\(pid);path:")
        case .app(let pid, let bundleId):
            let resolvedPid: pid_t?
            if let pid {
                resolvedPid = pid_t(pid)
            } else if let bundleId {
                resolvedPid = NSWorkspace.shared.runningApplications
                    .first(where: { $0.bundleIdentifier == bundleId })?
                    .processIdentifier
            } else {
                resolvedPid = NSWorkspace.shared.frontmostApplication?.processIdentifier
            }
            guard let resolvedPid else {
                throw PlatformBridgeError(code: "not_found", message: "No matching app found for accessibility.snapshot")
            }
            return (AXUIElementCreateApplication(resolvedPid), "pid:\(resolvedPid);path:")
        case .window(let windowId):
            let app = try appForWindow(windowId: windowId)
            let appElement = AXUIElementCreateApplication(app.processIdentifier)
            guard let window = accessibilityWindow(
                appElement: appElement,
                windowId: windowId,
                appProcessIdentifier: app.processIdentifier
            ) else {
                let message = windowId.map {
                    "No accessibility window found for windowId \($0)"
                } ?? "No focused window found for accessibility.snapshot"
                throw PlatformBridgeError(code: "not_found", message: message)
            }
            return (window, nil)
        case .element(let pid, let path):
            let root = AXUIElementCreateApplication(pid_t(pid))
            return (try element(root: root, path: path), "pid:\(pid);path:\(path.map(String.init).joined(separator: "."))")
        }
    }

    private func resolveActionTarget(_ target: MacPlatformAccessibilityActionTarget) throws -> AXUIElement {
        switch target {
        case .frontmostApp:
            let systemWide = AXUIElementCreateSystemWide()
            guard let focused = copyElementAttribute(systemWide, kAXFocusedUIElementAttribute) else {
                throw PlatformBridgeError(code: "not_found", message: "No focused accessibility element found")
            }
            return focused
        case .window(let windowId):
            let app = try appForWindow(windowId: windowId)
            let appElement = AXUIElementCreateApplication(app.processIdentifier)
            guard let window = accessibilityWindow(
                appElement: appElement,
                windowId: windowId,
                appProcessIdentifier: app.processIdentifier
            ) else {
                let message = windowId.map {
                    "No accessibility window found for windowId \($0)"
                } ?? "No focused window found for accessibility.action"
                throw PlatformBridgeError(code: "not_found", message: message)
            }
            return window
        case .element(let pid, let path):
            let root = AXUIElementCreateApplication(pid_t(pid))
            return try element(root: root, path: path)
        }
    }

    private func appForWindow(windowId: Int?) throws -> NSRunningApplication {
        if let windowId {
            guard let window = cgWindowMetadata(windowId: windowId),
                  let app = NSRunningApplication(processIdentifier: pid_t(window.ownerPid)) else {
                throw PlatformBridgeError(code: "not_found", message: "No app found for windowId \(windowId)")
            }
            return app
        }
        guard let app = NSWorkspace.shared.frontmostApplication else {
            throw PlatformBridgeError(code: "not_found", message: "No frontmost app is available")
        }
        return app
    }

    private func element(root: AXUIElement, path: [Int]) throws -> AXUIElement {
        var current = root
        for index in path {
            let children = copyElementArrayAttribute(current, kAXChildrenAttribute)
            guard children.indices.contains(index) else {
                throw PlatformBridgeError(
                    code: "not_found",
                    message: "No accessibility element found at path \(path.map(String.init).joined(separator: "."))"
                )
            }
            current = children[index]
        }
        return current
    }

    private func accessibilityWindow(
        appElement: AXUIElement,
        windowId: Int?,
        appProcessIdentifier: pid_t
    ) -> AXUIElement? {
        selectAccessibilityWindow(
            windowId: windowId,
            focusedWindow: copyElementAttribute(appElement, kAXFocusedWindowAttribute),
            windows: copyElementArrayAttribute(appElement, kAXWindowsAttribute),
            targetWindow: windowId.flatMap(cgWindowMetadata),
            appProcessIdentifier: Int(appProcessIdentifier),
            windowNumber: { copyIntAttribute($0, macPlatformAXWindowNumberAttribute) },
            windowTitle: { copyStringAttribute($0, kAXTitleAttribute) },
            windowFrame: { copyFrameRect($0) }
        )
    }

    private func snapshot(
        element: AXUIElement,
        target: [String: Any]?,
        elementId: String?,
        depth: Int,
        maxDepth: Int,
        maxChildren: Int
    ) -> [String: Any?] {
        let role = copyStringAttribute(element, kAXRoleAttribute) ?? "unknown"
        let title = copyStringAttribute(element, kAXTitleAttribute)
        let value = copyStringAttribute(element, kAXValueAttribute)
        let description = copyStringAttribute(element, kAXDescriptionAttribute)
        let frame = copyFrame(element)
        let children: [[String: Any?]]

        if depth >= maxDepth {
            children = []
        } else {
            children = Array(copyElementArrayAttribute(element, kAXChildrenAttribute).prefix(maxChildren)).enumerated()
                .map { index, child in
                    let childId = elementId.map { base in
                        base.hasSuffix("path:")
                            ? "\(base)\(index)"
                            : "\(base).\(index)"
                    }
                    return snapshot(
                        element: child,
                        target: nil,
                        elementId: childId,
                        depth: depth + 1,
                        maxDepth: maxDepth,
                        maxChildren: maxChildren
                    )
                }
        }

        return [
            "role": role,
            "label": title ?? description,
            "title": title,
            "value": value,
            "description": description,
            "frame": frame,
            "elementId": elementId,
            "target": target,
            "children": children,
            "resolution": "best_effort",
        ]
    }

    private func performPress(on element: AXUIElement, actionName: String) throws {
        let result = AXUIElementPerformAction(element, kAXPressAction as CFString)
        guard result == .success else {
            throw PlatformBridgeError(
                code: "action_failed",
                message: "accessibility.action \(actionName) failed: \(result.readableName)"
            )
        }
    }

    private func performMouseClick(on element: AXUIElement) throws {
        guard let frame = copyFrame(element) else {
            throw PlatformBridgeError(
                code: "action_failed",
                message: "accessibility.action click failed: element has no frame for fallback click"
            )
        }
        guard let x = frame["x"], let y = frame["y"], let width = frame["width"], let height = frame["height"] else {
            throw PlatformBridgeError(
                code: "action_failed",
                message: "accessibility.action click failed: element frame is incomplete"
            )
        }
        let point = CGPoint(x: x + width / 2, y: y + height / 2)
        guard let down = CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: point, mouseButton: .left),
              let up = CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: point, mouseButton: .left) else {
            throw PlatformBridgeError(code: "action_failed", message: "accessibility.action click failed: cannot create mouse event")
        }
        down.post(tap: .cghidEventTap)
        up.post(tap: .cghidEventTap)
    }

    private func copyElementAttribute(_ element: AXUIElement, _ attribute: String) -> AXUIElement? {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, attribute as CFString, &value) == .success,
              let value,
              CFGetTypeID(value) == AXUIElementGetTypeID() else {
            return nil
        }
        return (value as! AXUIElement)
    }

    private func copyElementArrayAttribute(_ element: AXUIElement, _ attribute: String) -> [AXUIElement] {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, attribute as CFString, &value) == .success,
              let array = value as? [AXUIElement] else {
            return []
        }
        return array
    }

    private func copyStringAttribute(_ element: AXUIElement, _ attribute: String) -> String? {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, attribute as CFString, &value) == .success else { return nil }
        if let string = value as? String {
            return string
        }
        if let number = value as? NSNumber {
            return number.stringValue
        }
        return nil
    }

    private func copyIntAttribute(_ element: AXUIElement, _ attribute: String) -> Int? {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, attribute as CFString, &value) == .success else { return nil }
        if let int = value as? Int {
            return int
        }
        if let number = value as? NSNumber {
            return number.intValue
        }
        return nil
    }

    private func copyFrame(_ element: AXUIElement) -> [String: Double]? {
        guard let frame = copyFrameRect(element) else { return nil }
        return [
            "x": frame.origin.x,
            "y": frame.origin.y,
            "width": frame.width,
            "height": frame.height,
        ]
    }

    private func copyFrameRect(_ element: AXUIElement) -> CGRect? {
        var positionValue: CFTypeRef?
        var sizeValue: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, kAXPositionAttribute as CFString, &positionValue) == .success,
              AXUIElementCopyAttributeValue(element, kAXSizeAttribute as CFString, &sizeValue) == .success,
              let positionAX = positionValue,
              let sizeAX = sizeValue else {
            return nil
        }

        guard CFGetTypeID(positionAX) == AXValueGetTypeID(),
              CFGetTypeID(sizeAX) == AXValueGetTypeID() else {
            return nil
        }

        var point = CGPoint.zero
        var size = CGSize.zero
        guard AXValueGetValue((positionAX as! AXValue), .cgPoint, &point),
              AXValueGetValue((sizeAX as! AXValue), .cgSize, &size) else {
            return nil
        }
        return CGRect(origin: point, size: size)
    }
}

struct MacPlatformOCRRequest: Equatable {
    let imageData: Data
    let mimeType: String?
    let language: String?

    static func parse(args: Any?) throws -> MacPlatformOCRRequest {
        let argsDict = args as? [String: Any] ?? [:]
        guard let imageBase64 = argsDict["imageBase64"] as? String, !imageBase64.isEmpty else {
            throw PlatformBridgeError(code: "invalid_argument", message: "ocr.read requires non-empty imageBase64")
        }
        guard let imageData = Data(base64Encoded: imageBase64) else {
            throw PlatformBridgeError(code: "invalid_argument", message: "ocr.read imageBase64 must be valid base64")
        }
        let mimeType = argsDict["mimeType"] as? String
        if let mimeType, !["image/png", "image/jpeg", "image/webp"].contains(mimeType) {
            throw PlatformBridgeError(code: "invalid_argument", message: "ocr.read unsupported mimeType: \(mimeType)")
        }
        return MacPlatformOCRRequest(
            imageData: imageData,
            mimeType: mimeType,
            language: argsDict["language"] as? String
        )
    }
}

enum MacPlatformAccessibilityPermission {
    static func isTrusted() -> Bool {
        AXIsProcessTrustedWithOptions(["AXTrustedCheckOptionPrompt": false] as CFDictionary)
    }

    static func deniedError() -> PlatformBridgeError {
        PlatformBridgeError(
            code: "permission_denied",
            message: "HandAgent 没有辅助功能权限。请打开「系统设置 → 隐私与安全性 → 辅助功能」，允许 HandAgent 后重试。"
        )
    }
}

enum MacPlatformScreenCapturePermission {
    static func isAllowed() -> Bool {
        CGPreflightScreenCaptureAccess()
    }

    static func requestAccess() -> Bool {
        CGRequestScreenCaptureAccess()
    }

    static func ensureAllowed(
        preflight: () -> Bool = isAllowed,
        request: () -> Bool = requestAccess
    ) throws -> Bool {
        if preflight() {
            return true
        }
        guard request() else {
            throw deniedError()
        }
        return true
    }

    static func deniedError() -> PlatformBridgeError {
        PlatformBridgeError(
            code: "permission_denied",
            message: "HandAgent 没有屏幕录制权限。请打开「系统设置 → 隐私与安全性 → 屏幕录制」，允许 HandAgent 后重试。"
        )
    }

    static func shareableContentError(_ error: Error, preflightAccess: Bool) -> PlatformBridgeError {
        let nsError = error as NSError
        return PlatformBridgeError(
            code: preflightAccess ? "capture_failed" : "permission_denied",
            message: """
            Failed to enumerate ScreenCaptureKit shareable content \
            (preflight=\(preflightAccess), domain=\(nsError.domain), code=\(nsError.code), message=\(nsError.localizedDescription)).
            """
        )
    }
}

struct MacPlatformAccessibilitySnapshotRequest: Equatable {
    let target: MacPlatformAccessibilitySnapshotTarget
    let maxDepth: Int
    let maxChildren: Int

    static func parse(args: Any?) throws -> MacPlatformAccessibilitySnapshotRequest {
        let argsDict = args as? [String: Any] ?? [:]
        let target = try MacPlatformAccessibilitySnapshotTarget.parse(args: argsDict)
        return MacPlatformAccessibilitySnapshotRequest(
            target: target,
            maxDepth: clampedInt(argsDict["maxDepth"], defaultValue: 4, minValue: 0, maxValue: 6),
            maxChildren: clampedInt(argsDict["maxChildren"], defaultValue: 25, minValue: 1, maxValue: 50)
        )
    }
}

enum MacPlatformAccessibilitySnapshotTarget: Equatable {
    case frontmostApp
    case app(pid: Int?, bundleId: String?)
    case window(windowId: Int?)
    case element(pid: Int, path: [Int])

    var dictionary: [String: Any] {
        switch self {
        case .frontmostApp:
            return ["kind": "frontmost_app"]
        case .app(let pid, let bundleId):
            var value: [String: Any] = ["kind": "app"]
            if let pid { value["pid"] = pid }
            if let bundleId { value["bundleId"] = bundleId }
            return value
        case .window(let windowId):
            var value: [String: Any] = ["kind": "window"]
            if let windowId { value["windowId"] = windowId }
            return value
        case .element(let pid, let path):
            return ["kind": "element", "elementId": elementId(pid: pid, path: path)]
        }
    }

    static func parse(args: [String: Any]) throws -> MacPlatformAccessibilitySnapshotTarget {
        let kind = args["kind"] as? String ?? "frontmost_app"
        switch kind {
        case "frontmost_app":
            return .frontmostApp
        case "app":
            return .app(pid: intValue(args["pid"]), bundleId: args["bundleId"] as? String)
        case "window":
            return .window(windowId: intValue(args["windowId"]))
        case "element":
            guard let elementId = args["elementId"] as? String else {
                throw PlatformBridgeError(code: "invalid_argument", message: "accessibility.snapshot element target requires elementId")
            }
            let parsed = try parseElementId(elementId)
            return .element(pid: parsed.pid, path: parsed.path)
        default:
            throw PlatformBridgeError(code: "invalid_argument", message: "Unknown accessibility.snapshot target kind: \(kind)")
        }
    }
}

struct MacPlatformAccessibilityActionRequest: Equatable {
    let target: MacPlatformAccessibilityActionTarget
    let action: MacPlatformAccessibilityAction

    static func parse(args: Any?) throws -> MacPlatformAccessibilityActionRequest {
        let argsDict = args as? [String: Any] ?? [:]
        guard let targetDict = argsDict["target"] as? [String: Any] else {
            throw PlatformBridgeError(code: "invalid_argument", message: "accessibility.action requires target")
        }
        guard let actionDict = argsDict["action"] as? [String: Any] else {
            throw PlatformBridgeError(code: "invalid_argument", message: "accessibility.action requires action")
        }
        return MacPlatformAccessibilityActionRequest(
            target: try MacPlatformAccessibilityActionTarget.parse(args: targetDict),
            action: try MacPlatformAccessibilityAction.parse(args: actionDict)
        )
    }
}

enum MacPlatformAccessibilityActionTarget: Equatable {
    case frontmostApp
    case window(windowId: Int?)
    case element(pid: Int, path: [Int])

    var dictionary: [String: Any] {
        switch self {
        case .frontmostApp:
            return ["kind": "frontmost_app"]
        case .window(let windowId):
            var value: [String: Any] = ["kind": "window"]
            if let windowId { value["windowId"] = windowId }
            return value
        case .element(let pid, let path):
            return ["kind": "element", "elementId": elementId(pid: pid, path: path)]
        }
    }

    static func parse(args: [String: Any]) throws -> MacPlatformAccessibilityActionTarget {
        let kind = args["kind"] as? String ?? "frontmost_app"
        switch kind {
        case "frontmost_app":
            return .frontmostApp
        case "window":
            return .window(windowId: intValue(args["windowId"]))
        case "element":
            guard let elementId = args["elementId"] as? String else {
                throw PlatformBridgeError(code: "invalid_argument", message: "accessibility.action element target requires elementId")
            }
            let parsed = try parseElementId(elementId)
            return .element(pid: parsed.pid, path: parsed.path)
        default:
            throw PlatformBridgeError(code: "invalid_argument", message: "Unknown accessibility.action target kind: \(kind)")
        }
    }
}

enum MacPlatformAccessibilityAction: Equatable {
    case press
    case click
    case setValue(String)

    var dictionary: [String: Any] {
        switch self {
        case .press:
            return ["kind": "press"]
        case .click:
            return ["kind": "click"]
        case .setValue(let value):
            return ["kind": "set_value", "value": value]
        }
    }

    static func parse(args: [String: Any]) throws -> MacPlatformAccessibilityAction {
        let kind = args["kind"] as? String
        switch kind {
        case "press":
            return .press
        case "click":
            return .click
        case "set_value":
            guard let value = args["value"] as? String else {
                throw PlatformBridgeError(code: "invalid_argument", message: "accessibility.action set_value requires value")
            }
            return .setValue(value)
        default:
            throw PlatformBridgeError(code: "invalid_argument", message: "Unknown accessibility.action kind: \(kind ?? "nil")")
        }
    }
}

private func parseElementId(_ elementId: String) throws -> (pid: Int, path: [Int]) {
    let parts = Dictionary(uniqueKeysWithValues: elementId.split(separator: ";").compactMap { part -> (String, String)? in
        let pair = part.split(separator: ":", maxSplits: 1).map(String.init)
        guard pair.count == 2 else { return nil }
        return (pair[0], pair[1])
    })
    guard let pidString = parts["pid"], let pid = Int(pidString) else {
        throw PlatformBridgeError(code: "invalid_argument", message: "elementId must include pid, for example pid:123;path:0.1")
    }
    let pathString = parts["path"] ?? ""
    let path: [Int]
    if pathString.isEmpty {
        path = []
    } else {
        path = try pathString.split(separator: ".").map { item in
            guard let index = Int(item), index >= 0 else {
                throw PlatformBridgeError(code: "invalid_argument", message: "elementId path must contain non-negative integer indexes")
            }
            return index
        }
    }
    return (pid, path)
}

private func elementId(pid: Int, path: [Int]) -> String {
    "pid:\(pid);path:\(path.map(String.init).joined(separator: "."))"
}

struct MacPlatformCGWindowMetadata: Equatable {
    let windowId: Int
    let ownerPid: Int
    let title: String?
    let bounds: CGRect?
}

private func cgWindowMetadata(windowId: Int) -> MacPlatformCGWindowMetadata? {
    let windows = CGWindowListCopyWindowInfo([.optionIncludingWindow], CGWindowID(windowId)) as? [[String: Any]] ?? []
    guard let info = windows.first,
          let ownerPid = intValue(info[kCGWindowOwnerPID as String]) else {
        return nil
    }
    return MacPlatformCGWindowMetadata(
        windowId: intValue(info[kCGWindowNumber as String]) ?? windowId,
        ownerPid: ownerPid,
        title: info[kCGWindowName as String] as? String,
        bounds: cgWindowBounds(info[kCGWindowBounds as String])
    )
}

func selectAccessibilityWindow<Element>(
    windowId: Int?,
    focusedWindow: Element?,
    windows: [Element],
    targetWindow: MacPlatformCGWindowMetadata? = nil,
    appProcessIdentifier: Int? = nil,
    windowNumber: (Element) -> Int?,
    windowTitle: (Element) -> String? = { _ in nil },
    windowFrame: (Element) -> CGRect? = { _ in nil }
) -> Element? {
    guard let windowId else {
        return focusedWindow
    }
    if let directMatch = windows.first(where: { windowNumber($0) == windowId }) {
        return directMatch
    }
    guard let targetWindow,
          targetWindow.windowId == windowId,
          targetWindow.ownerPid == appProcessIdentifier,
          let targetTitle = normalizedNonEmptyTitle(targetWindow.title),
          let targetBounds = targetWindow.bounds else {
        return nil
    }
    let fallbackMatches = windows.filter { window in
        guard normalizedNonEmptyTitle(windowTitle(window)) == targetTitle,
              let frame = windowFrame(window) else {
            return false
        }
        return frame.approximatelyEquals(targetBounds)
    }
    return fallbackMatches.count == 1 ? fallbackMatches[0] : nil
}

private func cgWindowBounds(_ value: Any?) -> CGRect? {
    guard let bounds = value as? [String: Any],
          let x = doubleValue(bounds["X"]),
          let y = doubleValue(bounds["Y"]),
          let width = doubleValue(bounds["Width"]),
          let height = doubleValue(bounds["Height"]) else {
        return nil
    }
    return CGRect(x: x, y: y, width: width, height: height)
}

private func normalizedNonEmptyTitle(_ title: String?) -> String? {
    guard let title else { return nil }
    let normalized = title.trimmingCharacters(in: .whitespacesAndNewlines)
    return normalized.isEmpty ? nil : normalized
}

private func intValue(_ value: Any?) -> Int? {
    if let int = value as? Int { return int }
    return (value as? NSNumber)?.intValue
}

private func doubleValue(_ value: Any?) -> Double? {
    if let double = value as? Double { return double }
    if let int = value as? Int { return Double(int) }
    return (value as? NSNumber)?.doubleValue
}

private func clampedInt(_ value: Any?, defaultValue: Int, minValue: Int, maxValue: Int) -> Int {
    min(max(intValue(value) ?? defaultValue, minValue), maxValue)
}

private extension CGRect {
    func approximatelyEquals(_ other: CGRect, tolerance: CGFloat = 2) -> Bool {
        abs(origin.x - other.origin.x) <= tolerance &&
            abs(origin.y - other.origin.y) <= tolerance &&
            abs(width - other.width) <= tolerance &&
            abs(height - other.height) <= tolerance
    }
}

private extension NSApplication.ActivationPolicy {
    var readableName: String {
        switch self {
        case .regular: return "regular"
        case .accessory: return "accessory"
        case .prohibited: return "prohibited"
        @unknown default: return "unknown"
        }
    }
}

private extension AXError {
    var readableName: String {
        switch self {
        case .success: return "success"
        case .failure: return "failure"
        case .illegalArgument: return "illegal_argument"
        case .invalidUIElement: return "invalid_ui_element"
        case .invalidUIElementObserver: return "invalid_ui_element_observer"
        case .cannotComplete: return "cannot_complete"
        case .attributeUnsupported: return "attribute_unsupported"
        case .actionUnsupported: return "action_unsupported"
        case .notificationUnsupported: return "notification_unsupported"
        case .notImplemented: return "not_implemented"
        case .notificationAlreadyRegistered: return "notification_already_registered"
        case .notificationNotRegistered: return "notification_not_registered"
        case .apiDisabled: return "api_disabled"
        case .noValue: return "no_value"
        case .parameterizedAttributeUnsupported: return "parameterized_attribute_unsupported"
        case .notEnoughPrecision: return "not_enough_precision"
        @unknown default: return "unknown"
        }
    }
}

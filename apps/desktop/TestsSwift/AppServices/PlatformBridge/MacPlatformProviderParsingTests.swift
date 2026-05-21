import CoreGraphics
import XCTest
@testable import HandAgentDesktop

final class MacPlatformProviderParsingTests: XCTestCase {
    @MainActor
    func testAppListReturnsSerializableRunningApplications() async throws {
        let provider = MacPlatformProvider()

        let result = try await provider.handle(method: "app.list", args: [:] as [String: Any])
        let apps = try XCTUnwrap(result as? [[String: Any?]])
        XCTAssertFalse(apps.isEmpty)

        let first = try XCTUnwrap(apps.first)
        XCTAssertEqual(first["resolution"] as? String, "best_effort")
        XCTAssertNotNil(first["pid"] as? Int)
    }

    func testOCRRequestRejectsMissingImageBase64() {
        XCTAssertThrowsError(try MacPlatformOCRRequest.parse(args: [:] as [String: Any])) { error in
            let bridgeError = error as? PlatformBridgeError
            XCTAssertEqual(bridgeError?.code, "invalid_argument")
            XCTAssertEqual(bridgeError?.message, "ocr.read requires non-empty imageBase64")
        }
    }

    func testOCRRequestDecodesBase64AndLanguage() throws {
        let request = try MacPlatformOCRRequest.parse(args: [
            "imageBase64": Data("hello".utf8).base64EncodedString(),
            "mimeType": "image/png",
            "language": "zh-Hans",
        ])

        XCTAssertEqual(request.imageData, Data("hello".utf8))
        XCTAssertEqual(request.mimeType, "image/png")
        XCTAssertEqual(request.language, "zh-Hans")
    }

    func testAccessibilitySnapshotRequestAppliesLimits() throws {
        let request = try MacPlatformAccessibilitySnapshotRequest.parse(args: [
            "kind": "frontmost_app",
            "maxDepth": 99,
            "maxChildren": 1000,
        ])

        XCTAssertEqual(request.target, .frontmostApp)
        XCTAssertEqual(request.maxDepth, 6)
        XCTAssertEqual(request.maxChildren, 50)
    }

    func testAccessibilityActionRequestParsesSetValueElementTarget() throws {
        let request = try MacPlatformAccessibilityActionRequest.parse(args: [
            "target": [
                "kind": "element",
                "elementId": "pid:123;path:0.2.1",
            ],
            "action": [
                "kind": "set_value",
                "value": "new text",
            ],
        ])

        XCTAssertEqual(request.target, .element(pid: 123, path: [0, 2, 1]))
        XCTAssertEqual(request.action, .setValue("new text"))
    }

    func testAccessibilityDeniedErrorUsesReadablePermissionGuide() {
        let error = MacPlatformAccessibilityPermission.deniedError()

        XCTAssertEqual(error.code, "permission_denied")
        XCTAssertTrue(error.message.contains("系统设置"))
        XCTAssertTrue(error.message.contains("隐私与安全性"))
        XCTAssertTrue(error.message.contains("辅助功能"))
    }

    func testScreenCapturePreflightDeniedErrorUsesReadablePermissionGuide() {
        let error = MacPlatformScreenCapturePermission.deniedError()

        XCTAssertEqual(error.code, "permission_denied")
        XCTAssertTrue(error.message.contains("系统设置"))
        XCTAssertTrue(error.message.contains("隐私与安全性"))
        XCTAssertTrue(error.message.contains("屏幕录制"))
    }

    func testScreenCaptureAccessDoesNotRequestWhenPreflightAlreadyAllowed() throws {
        var requestCount = 0

        let isAllowed = try MacPlatformScreenCapturePermission.ensureAllowed(
            preflight: { true },
            request: {
                requestCount += 1
                return false
            }
        )

        XCTAssertTrue(isAllowed)
        XCTAssertEqual(requestCount, 0)
    }

    func testScreenCaptureAccessRequestsWhenPreflightDenied() throws {
        var requestCount = 0

        let isAllowed = try MacPlatformScreenCapturePermission.ensureAllowed(
            preflight: { false },
            request: {
                requestCount += 1
                return true
            }
        )

        XCTAssertTrue(isAllowed)
        XCTAssertEqual(requestCount, 1)
    }

    func testScreenCaptureAccessThrowsPermissionGuideWhenRequestDenied() {
        XCTAssertThrowsError(try MacPlatformScreenCapturePermission.ensureAllowed(
            preflight: { false },
            request: { false }
        )) { error in
            let bridgeError = error as? PlatformBridgeError
            XCTAssertEqual(bridgeError?.code, "permission_denied")
            XCTAssertTrue(bridgeError?.message.contains("屏幕录制") ?? false)
        }
    }

    func testScreenCaptureShareableContentErrorDoesNotReportPermissionDeniedWhenPreflightAllowsAccess() {
        let underlying = NSError(
            domain: "com.apple.ScreenCaptureKit.SCStreamErrorDomain",
            code: -3801,
            userInfo: [NSLocalizedDescriptionKey: "用户拒绝了应用程序、窗口、显示器捕捉的TCC"]
        )

        let error = MacPlatformScreenCapturePermission.shareableContentError(
            underlying,
            preflightAccess: true
        )

        XCTAssertEqual(error.code, "capture_failed")
        XCTAssertTrue(error.message.contains("ScreenCaptureKit"))
        XCTAssertTrue(error.message.contains("preflight=true"))
        XCTAssertTrue(error.message.contains("com.apple.ScreenCaptureKit.SCStreamErrorDomain"))
        XCTAssertTrue(error.message.contains("-3801"))
    }

    func testAccessibilityWindowSelectionRequiresExplicitWindowMatch() {
        let selected = selectAccessibilityWindow(
            windowId: 42,
            focusedWindow: "focused",
            windows: ["one", "two"],
            windowNumber: { $0 == "two" ? 42 : 7 }
        )

        XCTAssertEqual(selected, "two")

        let missing = selectAccessibilityWindow(
            windowId: 99,
            focusedWindow: "focused",
            windows: ["one", "two"],
            windowNumber: { $0 == "two" ? 42 : 7 }
        )

        XCTAssertNil(missing)
    }

    func testAccessibilityWindowSelectionPrefersWindowNumberMatch() {
        let targetWindow = MacPlatformCGWindowMetadata(
            windowId: 42,
            ownerPid: 123,
            title: "未命名2.rtf",
            bounds: CGRect(x: 20, y: 40, width: 800, height: 600)
        )

        let selected = selectAccessibilityWindow(
            windowId: 42,
            focusedWindow: "focused",
            windows: ["fallback", "direct"],
            targetWindow: targetWindow,
            appProcessIdentifier: 123,
            windowNumber: { $0 == "direct" ? 42 : nil },
            windowTitle: { _ in "未命名2.rtf" },
            windowFrame: { _ in CGRect(x: 20, y: 40, width: 800, height: 600) }
        )

        XCTAssertEqual(selected, "direct")
    }

    func testAccessibilityWindowSelectionFallsBackToTitleAndFrameWhenWindowNumberIsUnavailable() {
        let targetWindow = MacPlatformCGWindowMetadata(
            windowId: 52648,
            ownerPid: 321,
            title: "未命名2.rtf",
            bounds: CGRect(x: 16, y: 72, width: 960, height: 720)
        )

        let selected = selectAccessibilityWindow(
            windowId: 52648,
            focusedWindow: "focused",
            windows: ["other", "target"],
            targetWindow: targetWindow,
            appProcessIdentifier: 321,
            windowNumber: { _ in nil },
            windowTitle: { $0 == "target" ? "未命名2.rtf" : "未命名.rtf" },
            windowFrame: {
                $0 == "target"
                    ? CGRect(x: 16.5, y: 72, width: 960, height: 720)
                    : CGRect(x: 120, y: 120, width: 960, height: 720)
            }
        )

        XCTAssertEqual(selected, "target")
    }

    func testAccessibilityWindowSelectionReturnsNilWhenExplicitWindowCannotBeMatched() {
        let selected = selectAccessibilityWindow(
            windowId: 99,
            focusedWindow: "focused",
            windows: ["target"],
            targetWindow: nil,
            appProcessIdentifier: 321,
            windowNumber: { _ in nil },
            windowTitle: { _ in "未命名2.rtf" },
            windowFrame: { _ in CGRect(x: 16, y: 72, width: 960, height: 720) }
        )

        XCTAssertNil(selected)
    }

    func testAccessibilityWindowSelectionUsesFocusedWindowWhenWindowIdIsOmitted() {
        let selected = selectAccessibilityWindow(
            windowId: nil,
            focusedWindow: "focused",
            windows: ["one"],
            windowNumber: { _ in nil }
        )

        XCTAssertEqual(selected, "focused")
    }
}

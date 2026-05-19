import XCTest
@testable import HandAgentDesktop

final class MacPlatformProviderParsingTests: XCTestCase {
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

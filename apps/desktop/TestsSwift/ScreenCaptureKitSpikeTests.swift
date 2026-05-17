import XCTest
import ScreenCaptureKit
import CoreGraphics

/// 可行性 spike: 验证用 ScreenCaptureKit 替换 screencapture CLI 的三种 target。
/// 这些测试需要「屏幕录制」权限。无权限时会以 SkipReason 跳过，不会让 CI 红。
/// 目的：在落到生产代码前，证明 display/window/region 三条路径的 API 形状可行。
final class ScreenCaptureKitSpikeTests: XCTestCase {
    private struct PermissionDeniedError: Error {}

    private func currentShareableContent() async throws -> SCShareableContent {
        do {
            return try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
        } catch {
            throw PermissionDeniedError()
        }
    }

    func test_enumerate_displays_and_windows() async throws {
        let content: SCShareableContent
        do {
            content = try await currentShareableContent()
        } catch is PermissionDeniedError {
            throw XCTSkip("Screen recording permission not granted; run from signed app to verify.")
        }

        XCTAssertGreaterThan(content.displays.count, 0, "至少应该有一个 display")
        for d in content.displays {
            print("[spike] display id=\(d.displayID) size=\(d.width)x\(d.height)")
        }
        for w in content.windows.prefix(5) {
            print("[spike] window id=\(w.windowID) title=\(w.title ?? "<nil>") app=\(w.owningApplication?.applicationName ?? "<nil>")")
        }
    }

    func test_capture_display() async throws {
        let content: SCShareableContent
        do {
            content = try await currentShareableContent()
        } catch is PermissionDeniedError {
            throw XCTSkip("Screen recording permission not granted.")
        }
        guard let display = content.displays.first else {
            throw XCTSkip("No displays available.")
        }

        let filter = SCContentFilter(display: display, excludingWindows: [])
        let config = SCStreamConfiguration()
        config.width = display.width
        config.height = display.height
        config.showsCursor = false

        let cgImage = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: config)
        XCTAssertGreaterThan(cgImage.width, 0)
        XCTAssertGreaterThan(cgImage.height, 0)

        let pngData = try XCTUnwrap(pngData(from: cgImage), "应该能编码为 PNG")
        XCTAssertGreaterThan(pngData.count, 1024, "整个 display 的 PNG 至少应该 > 1KB")
        print("[spike] captured display \(cgImage.width)x\(cgImage.height) png=\(pngData.count) bytes")
    }

    func test_capture_window_if_any() async throws {
        let content: SCShareableContent
        do {
            content = try await currentShareableContent()
        } catch is PermissionDeniedError {
            throw XCTSkip("Screen recording permission not granted.")
        }
        // 找一个本进程之外、有标题的可见窗口
        guard let target = content.windows.first(where: { ($0.title?.isEmpty == false) && $0.isOnScreen }) else {
            throw XCTSkip("No suitable window found for capture spike.")
        }

        let filter = SCContentFilter(desktopIndependentWindow: target)
        let config = SCStreamConfiguration()
        // 用窗口自身像素尺寸；frame 是点，乘以 backing scale。test 里取 2x 或 1x 都不影响 spike 结论。
        config.width = max(64, Int(target.frame.width))
        config.height = max(64, Int(target.frame.height))
        config.showsCursor = false

        let cgImage = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: config)
        XCTAssertGreaterThan(cgImage.width, 0)
        XCTAssertGreaterThan(cgImage.height, 0)
        print("[spike] captured window id=\(target.windowID) -> \(cgImage.width)x\(cgImage.height)")
    }

    func test_capture_region_via_crop() async throws {
        let content: SCShareableContent
        do {
            content = try await currentShareableContent()
        } catch is PermissionDeniedError {
            throw XCTSkip("Screen recording permission not granted.")
        }
        guard let display = content.displays.first else {
            throw XCTSkip("No displays available.")
        }

        let filter = SCContentFilter(display: display, excludingWindows: [])
        let config = SCStreamConfiguration()
        config.width = display.width
        config.height = display.height
        config.showsCursor = false

        let full = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: config)
        let regionRect = CGRect(
            x: full.width / 4,
            y: full.height / 4,
            width: full.width / 2,
            height: full.height / 2
        )
        let cropped = try XCTUnwrap(full.cropping(to: regionRect))
        XCTAssertEqual(cropped.width, regionRect.size.width.rounded(.toNearestOrEven).intValue)
        XCTAssertEqual(cropped.height, regionRect.size.height.rounded(.toNearestOrEven).intValue)
        print("[spike] cropped region -> \(cropped.width)x\(cropped.height)")
    }

    private func pngData(from cgImage: CGImage) -> Data? {
        let mutable = NSMutableData()
        guard let dest = CGImageDestinationCreateWithData(mutable, "public.png" as CFString, 1, nil) else {
            return nil
        }
        CGImageDestinationAddImage(dest, cgImage, nil)
        guard CGImageDestinationFinalize(dest) else { return nil }
        return mutable as Data
    }
}

private extension CGFloat {
    var intValue: Int { Int(self) }
}

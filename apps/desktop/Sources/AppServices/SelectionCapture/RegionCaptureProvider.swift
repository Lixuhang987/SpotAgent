import AppKit
import Foundation

enum RegionCaptureResult: Equatable {
    case captured(pngBase64: String)
    case cancelled
    case error(message: String)
}

protocol RegionCaptureProvider: Sendable {
    func captureRegion() async -> RegionCaptureResult
}

final class MacRegionCaptureProvider: RegionCaptureProvider {
    func captureRegion() async -> RegionCaptureResult {
        let tempPath = FileManager.default.temporaryDirectory
            .appendingPathComponent("handagent-region-\(UUID().uuidString).png").path

        return await Task.detached(priority: .userInitiated) {
            defer {
                try? FileManager.default.removeItem(atPath: tempPath)
            }

            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
            process.arguments = ["-i", "-x", tempPath]
            process.standardOutput = Pipe()
            process.standardError = Pipe()

            do {
                try process.run()
                process.waitUntilExit()
            } catch {
                return RegionCaptureResult.error(message: "无法启动 screencapture: \(error.localizedDescription)")
            }

            guard process.terminationStatus == 0 else {
                return .error(message: "screencapture 退出码 \(process.terminationStatus)")
            }

            guard FileManager.default.fileExists(atPath: tempPath) else {
                return .cancelled
            }

            do {
                let data = try Data(contentsOf: URL(fileURLWithPath: tempPath))
                guard !data.isEmpty else { return .cancelled }
                return .captured(pngBase64: data.base64EncodedString())
            } catch {
                return .error(message: "读取截图失败: \(error.localizedDescription)")
            }
        }.value
    }
}

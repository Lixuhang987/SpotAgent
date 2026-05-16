import AppKit
import Foundation

enum SelectionCaptureResult: Equatable {
    case selected(text: String)
    case empty
    case error(message: String)
}

protocol SelectionCaptureProvider: Sendable {
    func captureSelectedText() async -> SelectionCaptureResult
}

final class MacSelectionCaptureProvider: SelectionCaptureProvider {
    private let waitMs: UInt64

    init(waitMs: UInt64 = 120) {
        self.waitMs = waitMs
    }

    func captureSelectedText() async -> SelectionCaptureResult {
        let pasteboard = NSPasteboard.general
        let originalChangeCount = pasteboard.changeCount
        let originalText = pasteboard.string(forType: .string)

        do {
            try await runAppleScript(#"tell application "System Events" to keystroke "c" using command down"#)
        } catch {
            return .error(message: "AppleScript copy failed: \(error.localizedDescription)")
        }

        try? await Task.sleep(nanoseconds: waitMs * 1_000_000)

        defer {
            if let originalText {
                pasteboard.clearContents()
                pasteboard.setString(originalText, forType: .string)
            }
        }

        if pasteboard.changeCount == originalChangeCount {
            return .empty
        }
        guard let copied = pasteboard.string(forType: .string), !copied.isEmpty else {
            return .empty
        }

        return .selected(text: copied)
    }

    private func runAppleScript(_ script: String) async throws {
        try await Task.detached(priority: .userInitiated) {
            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
            process.arguments = ["-e", script]
            process.standardOutput = Pipe()
            process.standardError = Pipe()
            try process.run()
            process.waitUntilExit()
            if process.terminationStatus != 0 {
                throw NSError(
                    domain: "MacSelectionCaptureProvider",
                    code: Int(process.terminationStatus),
                    userInfo: [NSLocalizedDescriptionKey: "osascript exited with code \(process.terminationStatus)"]
                )
            }
        }.value
    }
}

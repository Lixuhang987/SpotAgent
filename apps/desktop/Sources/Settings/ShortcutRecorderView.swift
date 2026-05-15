import AppKit
import Carbon.HIToolbox
import SwiftUI

struct ShortcutRecorderView: View {
    @Binding var shortcut: KeyShortcut?
    let allowsPlainKeys: Bool

    @State private var isRecording = false
    @State private var monitor: Any?

    var body: some View {
        HStack(spacing: 8) {
            Button(isRecording ? "按下快捷键…" : shortcutLabel) {
                toggleRecording()
            }
            .buttonStyle(.bordered)

            Button("清除") {
                shortcut = nil
                stopRecording()
            }
            .buttonStyle(.borderless)
            .disabled(shortcut == nil && !isRecording)
        }
        .onDisappear {
            stopRecording()
        }
    }

    private var shortcutLabel: String {
        shortcut?.displayString ?? "未设置"
    }

    private func toggleRecording() {
        if isRecording {
            stopRecording()
            return
        }

        isRecording = true
        monitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { event in
            if event.keyCode == UInt16(kVK_Escape) {
                stopRecording()
                return nil
            }

            if event.keyCode == UInt16(kVK_Delete) && event.modifierFlags.intersection(.deviceIndependentFlagsMask).isEmpty {
                shortcut = nil
                stopRecording()
                return nil
            }

            guard let shortcut = KeyShortcut.from(event: event, allowsPlainKeys: allowsPlainKeys) else {
                return nil
            }

            self.shortcut = shortcut
            stopRecording()
            return nil
        }
    }

    private func stopRecording() {
        if let monitor {
            NSEvent.removeMonitor(monitor)
            self.monitor = nil
        }
        isRecording = false
    }
}

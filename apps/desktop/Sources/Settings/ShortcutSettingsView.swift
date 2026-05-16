import KeyboardShortcuts
import SwiftUI

struct ShortcutSettingsView: View {
    let actions: [PromptAction]

    var body: some View {
        Form {
            Section("全局快捷键") {
                KeyboardShortcuts.Recorder("唤起 PromptPanel", name: .showPromptPanel)
            }

            Section("PromptAction 快捷键") {
                if actions.isEmpty {
                    Text("当前没有可配置的 PromptAction。")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(actions) { action in
                        KeyboardShortcuts.Recorder(action.title, name: action.shortcutName)
                    }
                }
            }
        }
        .formStyle(.grouped)
        .padding(20)
        .frame(width: 560, height: 320)
    }
}

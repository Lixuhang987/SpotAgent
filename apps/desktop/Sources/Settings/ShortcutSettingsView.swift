import SwiftUI

struct ShortcutSettingsView: View {
    @ObservedObject var store: ShortcutSettingsStore
    let actions: [PromptAction]

    var body: some View {
        Form {
            Section("全局快捷键") {
                HStack {
                    Text("唤起 PromptPanel")
                    Spacer()
                    ShortcutRecorderView(
                        shortcut: Binding(
                            get: { store.globalShortcut },
                            set: { newValue in
                                if let newValue {
                                    store.globalShortcut = newValue
                                }
                            }
                        ),
                        allowsPlainKeys: false
                    )
                }
                Text("全局快捷键至少需要一个修饰键。")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Section("PromptAction 快捷键") {
                if actions.isEmpty {
                    Text("当前没有可配置的 PromptAction。")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(actions) { action in
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(action.title)
                                Text(action.id)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            ShortcutRecorderView(
                                shortcut: Binding(
                                    get: { store.shortcut(forActionID: action.id) },
                                    set: { store.setShortcut($0, forActionID: action.id) }
                                ),
                                allowsPlainKeys: true
                            )
                        }
                    }
                }
            }
        }
        .formStyle(.grouped)
        .padding(20)
        .frame(width: 560, height: 320)
    }
}

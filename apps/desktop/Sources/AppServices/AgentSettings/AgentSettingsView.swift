import SwiftUI

struct AgentSettingsView: View {
    @Bindable var store: AgentSettingsStore

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                GroupBox("模型") {
                    VStack(alignment: .leading, spacing: 12) {
                        TextField(
                            "gpt-5-mini",
                            text: binding(
                                get: \.model,
                                set: { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                            )
                        )

                        Picker("接口", selection: binding(get: \.api, set: { $0 })) {
                            ForEach(AgentAPIType.allCases) { api in
                                Text(api.title).tag(api)
                            }
                        }

                        TextField(
                            "https://api.openai.com/v1",
                            text: binding(
                                get: \.baseURL,
                                set: { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                            )
                        )
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }

                GroupBox("认证") {
                    TextField(
                        "sk-...",
                        text: binding(
                            get: \.apiKey,
                            set: { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                        )
                    )
                    .privacySensitive()
                    .textFieldStyle(.roundedBorder)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text("设置会自动保存到 `~/.spotAgent/settings.json`。")
                        .foregroundStyle(.secondary)

                    if let saveErrorMessage = store.saveErrorMessage {
                        Text(saveErrorMessage)
                            .foregroundStyle(.red)
                    }
                }
            }
            .padding(20)
        }
        .frame(width: 520)
    }

    private func binding<Value>(
        get keyPath: WritableKeyPath<AgentSettings, Value>,
        set normalize: @escaping (Value) -> Value
    ) -> Binding<Value> {
        Binding(
            get: { store.settings[keyPath: keyPath] },
            set: { newValue in
                store.update { settings in
                    settings[keyPath: keyPath] = normalize(newValue)
                }
            }
        )
    }
}

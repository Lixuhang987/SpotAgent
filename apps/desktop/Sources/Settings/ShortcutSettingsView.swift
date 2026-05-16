import KeyboardShortcuts
import SwiftUI

struct ShortcutSettingsView: View {
    let actions: [PromptAction]
    @Environment(\.appTheme) private var theme

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                SettingsSection {
                    SettingsRow("唤起面板") {
                        KeyboardShortcuts.Recorder("", name: .showPromptPanel)
                    }
                }

                SettingsSectionSeparator()

                SettingsSection {
                    if actions.isEmpty {
                        SettingsRow("Actions") {
                            Text("当前没有可配置的 PromptAction")
                                .font(theme.typography.captionFont)
                                .foregroundStyle(theme.colors.textSecondary)
                        }
                    } else {
                        ForEach(Array(actions.enumerated()), id: \.element.id) { index, action in
                            if index > 0 {
                                SettingsRowDivider()
                            }
                            SettingsRow(action.title) {
                                KeyboardShortcuts.Recorder("", name: action.shortcutName)
                            }
                        }
                    }
                }

                Spacer(minLength: 0)
            }
        }
    }
}

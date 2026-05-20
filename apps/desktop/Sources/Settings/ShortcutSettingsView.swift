import KeyboardShortcuts
import SwiftUI

struct ShortcutSettingsView: View {
    let actions: [PromptAction]
    @Environment(\.appTheme) private var theme

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                SettingsSectionHeader("全局快捷键")
                SettingsSection {
                    SettingsRow("唤起面板") {
                        KeyboardShortcuts.Recorder("", name: .showPromptPanel)
                    }
                    SettingsRowDivider()
                    SettingsRow("捕获文本选区") {
                        KeyboardShortcuts.Recorder("", name: .captureSelection)
                    }
                    SettingsRowDivider()
                    SettingsRow("圈选区域截图") {
                        KeyboardShortcuts.Recorder("", name: .captureRegion)
                    }
                }

                SettingsSectionSeparator()

                SettingsSectionHeader("App 内快捷键")
                SettingsSection {
                    if actions.isEmpty {
                        SettingsRow("快捷键") {
                            Text("当前没有可配置的 App 内快捷键")
                                .font(theme.typography.captionFont)
                                .foregroundStyle(theme.colors.textSecondary)
                        }
                    } else {
                        SettingsListSection(items: actions) { action in
                            SettingsRow(action.title) {
                                KeyboardShortcuts.Recorder("", name: action.shortcutName) { _ in
                                    KeyboardShortcuts.disable(action.shortcutName)
                                }
                            }
                        }
                    }
                }

                Spacer(minLength: 0)
            }
        }
        .onAppear {
            AppScopeShortcutDefaults.disableGlobalRegistration(for: actions.map(\.shortcutName))
        }
    }
}

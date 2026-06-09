import SwiftUI

struct AppearanceSettingsView: View {
    @Bindable var viewModel: AppearanceSettingsViewModel
    @Environment(\.appTheme) private var theme

    var body: some View {
        VStack(spacing: 0) {
            SettingsSectionHeader("外观")
            SettingsSection {
                SettingsRow("主题") {
                    SettingsSegmentedControl(
                        AppearanceThemePreference.allCases,
                        selection: $viewModel.themePreference,
                        title: \.title
                    )
                    .frame(width: 260)
                }
            }
            if let saveErrorMessage = viewModel.saveErrorMessage {
                Text(saveErrorMessage)
                    .font(theme.typography.captionFont)
                    .foregroundStyle(theme.colors.error)
                    .padding(.horizontal, theme.spacing.xxl)
            }
            Spacer(minLength: 0)
        }
    }
}

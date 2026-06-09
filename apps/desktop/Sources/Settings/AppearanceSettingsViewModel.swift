import Foundation

@Observable
@MainActor
final class AppearanceSettingsViewModel {
    @ObservationIgnored private let themeService: AppearanceThemeService

    init(store: AgentSettingsStore) {
        self.themeService = AppearanceThemeService(store: store)
    }

    init(themeService: AppearanceThemeService) {
        self.themeService = themeService
    }

    var themePreference: AppearanceThemePreference {
        get { themeService.currentTheme.preference }
        set { themeService.updatePreference(newValue) }
    }

    var saveErrorMessage: String? { themeService.saveErrorMessage }
}

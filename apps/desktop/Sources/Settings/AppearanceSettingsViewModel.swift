import Foundation

@Observable
@MainActor
final class AppearanceSettingsViewModel {
    @ObservationIgnored private let store: AgentSettingsStore

    init(store: AgentSettingsStore) {
        self.store = store
    }

    var themePreference: AppearanceThemePreference {
        get { store.appearance.themePreference }
        set {
            store.updateAppearance { appearance in
                appearance.themePreference = newValue
            }
        }
    }

    var saveErrorMessage: String? { store.saveErrorMessage }
}

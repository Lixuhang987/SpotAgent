import AppKit
import Observation

@Observable
@MainActor
final class AppearanceThemeService {
    @ObservationIgnored private let store: AgentSettingsStore
    @ObservationIgnored private let systemResolver: @MainActor () -> ResolvedAppearanceTheme
    var onThemeChange: ((HostThemePayload) -> Void)?

    init(
        store: AgentSettingsStore,
        systemResolver: @escaping @MainActor () -> ResolvedAppearanceTheme = AppearanceThemeService.resolveSystemTheme
    ) {
        self.store = store
        self.systemResolver = systemResolver
    }

    var currentTheme: HostThemePayload {
        HostThemePayload(
            preference: store.appearance.themePreference,
            resolved: resolve(store.appearance.themePreference)
        )
    }

    var appTheme: AppTheme {
        AppTheme.resolved(currentTheme.resolved)
    }

    func updatePreference(_ preference: AppearanceThemePreference) {
        store.updateAppearance { appearance in
            appearance.themePreference = preference
        }
        onThemeChange?(currentTheme)
    }

    func systemAppearanceDidChange() {
        guard store.appearance.themePreference == .system else { return }
        onThemeChange?(currentTheme)
    }

    private func resolve(_ preference: AppearanceThemePreference) -> ResolvedAppearanceTheme {
        switch preference {
        case .light: return .light
        case .dark: return .dark
        case .system: return systemResolver()
        }
    }

    static func resolveSystemTheme() -> ResolvedAppearanceTheme {
        let bestMatch = NSApp.effectiveAppearance.bestMatch(from: [.darkAqua, .aqua])
        return bestMatch == .darkAqua ? .dark : .light
    }
}

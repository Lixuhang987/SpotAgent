import AppKit

enum AppearanceThemePreference: String, CaseIterable, Codable, Equatable, Identifiable, Sendable {
    case system
    case light
    case dark

    var id: String { rawValue }

    var title: String {
        switch self {
        case .system: return "跟随系统"
        case .light: return "浅色"
        case .dark: return "深色"
        }
    }
}

enum ResolvedAppearanceTheme: String, Codable, Equatable, Sendable {
    case light
    case dark
}

struct AppearanceSettings: Codable, Equatable, Sendable {
    var themePreference: AppearanceThemePreference

    static let defaultValue = AppearanceSettings(themePreference: .system)
}

struct HostThemePayload: Codable, Equatable, Sendable {
    let preference: AppearanceThemePreference
    let resolved: ResolvedAppearanceTheme
}

import Foundation

enum AgentAPIType: String, CaseIterable, Codable, Equatable, Identifiable {
    case responses
    case chat
    case completion

    var id: String { rawValue }

    var title: String {
        switch self {
        case .responses:
            return "Responses"
        case .chat:
            return "Chat Completions"
        case .completion:
            return "Completions"
        }
    }
}

struct AgentSettings: Codable, Equatable {
    var model: String
    var apiKey: String
    var baseURL: String
    var api: AgentAPIType

    static let defaultValue = AgentSettings(
        model: "gpt-5-mini",
        apiKey: "",
        baseURL: "",
        api: .responses
    )

    enum CodingKeys: String, CodingKey {
        case model
        case apiKey
        case baseURL = "baseUrl"
        case api
    }
}

private struct AgentSettingsFile: Codable {
    var llm: AgentSettings
}

@MainActor
final class AgentSettingsStore: ObservableObject {
    @Published private(set) var settings: AgentSettings
    @Published private(set) var saveErrorMessage: String?

    private let fileManager: FileManager
    private let homeDirectoryURL: URL

    init(
        fileManager: FileManager = .default,
        homeDirectoryURL: URL = FileManager.default.homeDirectoryForCurrentUser
    ) {
        self.fileManager = fileManager
        self.homeDirectoryURL = homeDirectoryURL
        self.settings = Self.loadSettings(fileManager: fileManager, homeDirectoryURL: homeDirectoryURL)
    }

    func update(_ mutate: (inout AgentSettings) -> Void) {
        var nextSettings = settings
        mutate(&nextSettings)
        settings = nextSettings
        persist()
    }

    static func settingsFileURL(homeDirectoryURL: URL) -> URL {
        homeDirectoryURL
            .appendingPathComponent(".spotAgent", isDirectory: true)
            .appendingPathComponent("settings.json")
    }

    private static func loadSettings(fileManager: FileManager, homeDirectoryURL: URL) -> AgentSettings {
        let fileURL = settingsFileURL(homeDirectoryURL: homeDirectoryURL)
        guard let data = try? Data(contentsOf: fileURL),
              let persisted = try? JSONDecoder().decode(AgentSettingsFile.self, from: data)
        else {
            return .defaultValue
        }

        return persisted.llm
    }

    private func persist() {
        let directoryURL = homeDirectoryURL.appendingPathComponent(".spotAgent", isDirectory: true)
        let fileURL = Self.settingsFileURL(homeDirectoryURL: homeDirectoryURL)

        do {
            try fileManager.createDirectory(at: directoryURL, withIntermediateDirectories: true)
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            let data = try encoder.encode(AgentSettingsFile(llm: settings))
            try data.write(to: fileURL, options: .atomic)
            saveErrorMessage = nil
        } catch {
            saveErrorMessage = "保存设置失败：\(error.localizedDescription)"
        }
    }
}

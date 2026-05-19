import Foundation

enum AgentAPIType: String, CaseIterable, Codable, Equatable, Identifiable {
    case responses
    case chat
    case completion

    var id: String { rawValue }

    var title: String {
        switch self {
        case .responses: return "Responses"
        case .chat: return "Chat Completions"
        case .completion: return "Completions"
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

struct AgentToolSettings: Codable, Equatable {
    var allowlist: [String]?
    var denylist: [String]

    static let defaultValue = AgentToolSettings(allowlist: nil, denylist: [])

    init(allowlist: [String]?, denylist: [String]) {
        self.allowlist = allowlist
        self.denylist = denylist
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        allowlist = try container.decodeIfPresent([String].self, forKey: .allowlist)
        denylist = try container.decodeIfPresent([String].self, forKey: .denylist) ?? []
    }
}

private struct AgentSettingsFile: Codable {
    var llm: AgentSettings?
    var tools: AgentToolSettings?
}

@Observable
@MainActor
final class AgentSettingsStore {
    private(set) var settings: AgentSettings
    private(set) var toolSettings: AgentToolSettings
    private(set) var saveErrorMessage: String?

    @ObservationIgnored private let fileManager: FileManager
    @ObservationIgnored private let homeDirectoryURL: URL
    @ObservationIgnored private var lastLoadedData: Data?
    @ObservationIgnored private var pollingTask: Task<Void, Never>?

    init(
        fileManager: FileManager = .default,
        homeDirectoryURL: URL = FileManager.default.homeDirectoryForCurrentUser
    ) {
        self.fileManager = fileManager
        self.homeDirectoryURL = homeDirectoryURL
        let loadedState = Self.loadState(fileManager: fileManager, homeDirectoryURL: homeDirectoryURL)
        self.settings = loadedState.settings
        self.toolSettings = loadedState.toolSettings
        self.lastLoadedData = loadedState.data
        startPolling()
    }

    deinit {
        pollingTask?.cancel()
    }

    func update(_ mutate: (inout AgentSettings) -> Void) {
        var nextSettings = settings
        mutate(&nextSettings)
        settings = nextSettings
        persist()
    }

    func updateToolSettings(_ mutate: (inout AgentToolSettings) -> Void) {
        var nextToolSettings = toolSettings
        mutate(&nextToolSettings)
        toolSettings = nextToolSettings
        persist()
    }

    func reloadFromDisk() {
        let loadedState = Self.loadState(fileManager: fileManager, homeDirectoryURL: homeDirectoryURL)
        guard loadedState.data != lastLoadedData else { return }
        settings = loadedState.settings
        toolSettings = loadedState.toolSettings
        lastLoadedData = loadedState.data
        saveErrorMessage = nil
    }

    static func settingsFileURL(homeDirectoryURL: URL) -> URL {
        homeDirectoryURL
            .appendingPathComponent(".spotAgent", isDirectory: true)
            .appendingPathComponent("settings.json")
    }

    private static func loadState(fileManager: FileManager, homeDirectoryURL: URL) -> (
        settings: AgentSettings,
        toolSettings: AgentToolSettings,
        data: Data?
    ) {
        let fileURL = settingsFileURL(homeDirectoryURL: homeDirectoryURL)
        guard let data = try? Data(contentsOf: fileURL),
              let persisted = try? JSONDecoder().decode(AgentSettingsFile.self, from: data)
        else {
            return (.defaultValue, .defaultValue, nil)
        }
        return (persisted.llm ?? .defaultValue, persisted.tools ?? .defaultValue, data)
    }

    private func persist() {
        let directoryURL = homeDirectoryURL.appendingPathComponent(".spotAgent", isDirectory: true)
        let fileURL = Self.settingsFileURL(homeDirectoryURL: homeDirectoryURL)

        do {
            try fileManager.createDirectory(at: directoryURL, withIntermediateDirectories: true)
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            let data = try encoder.encode(AgentSettingsFile(llm: settings, tools: toolSettings))
            try data.write(to: fileURL, options: .atomic)
            lastLoadedData = data
            saveErrorMessage = nil
        } catch {
            saveErrorMessage = "保存设置失败：\(error.localizedDescription)"
        }
    }

    private func startPolling() {
        pollingTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(500))
                guard let self else { return }
                self.reloadFromDisk()
            }
        }
    }
}

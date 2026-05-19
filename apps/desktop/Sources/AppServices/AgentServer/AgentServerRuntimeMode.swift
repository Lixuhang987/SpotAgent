import Foundation

enum AgentServerLLMMode: String, Decodable {
    case settings
    case mock
}

enum AgentServerRuntimeMode {
    static let markerFileName = "HandAgentRuntimeMode.json"

    static func resolve(
        resourcesURL: URL?,
        environment: [String: String] = ProcessInfo.processInfo.environment
    ) -> AgentServerLLMMode {
        if environment["HANDAGENT_LLM_MODE"] == AgentServerLLMMode.mock.rawValue {
            return .mock
        }

        guard let marker = readMarker(resourcesURL: resourcesURL) else {
            return .settings
        }
        return marker.llmMode == .mock ? .mock : .settings
    }

    static func apply(to environment: inout [String: String], resourcesURL: URL?) {
        if resolve(resourcesURL: resourcesURL, environment: environment) == .mock {
            environment["HANDAGENT_LLM_MODE"] = AgentServerLLMMode.mock.rawValue
        }
    }

    private static func readMarker(resourcesURL: URL?) -> RuntimeModeMarker? {
        guard let resourcesURL else {
            return nil
        }
        let fileURL = resourcesURL.appendingPathComponent(markerFileName)
        guard let data = try? Data(contentsOf: fileURL) else {
            return nil
        }
        return try? JSONDecoder().decode(RuntimeModeMarker.self, from: data)
    }
}

private struct RuntimeModeMarker: Decodable {
    let llmMode: AgentServerLLMMode
}

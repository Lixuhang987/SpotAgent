import Foundation

@Observable
@MainActor
final class AgentSettingsViewModel {
    @ObservationIgnored private let store: AgentSettingsStore

    init(store: AgentSettingsStore) {
        self.store = store
    }

    var model: String {
        get { store.settings.model }
        set { update { $0.model = newValue.trimmingCharacters(in: .whitespacesAndNewlines) } }
    }

    var provider: AgentLLMProvider {
        get { store.settings.provider }
        set { update { $0.provider = newValue } }
    }

    var apiKey: String {
        get { store.settings.apiKey }
        set { update { $0.apiKey = newValue.trimmingCharacters(in: .whitespacesAndNewlines) } }
    }

    var baseURL: String {
        get { store.settings.baseURL }
        set { update { $0.baseURL = newValue.trimmingCharacters(in: .whitespacesAndNewlines) } }
    }

    var api: AgentAPIType {
        get { store.settings.api }
        set { update { $0.api = newValue } }
    }

    var saveErrorMessage: String? { store.saveErrorMessage }

    private func update(_ mutate: (inout AgentSettings) -> Void) {
        store.update(mutate)
    }
}

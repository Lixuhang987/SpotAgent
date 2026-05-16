import Foundation

@MainActor
final class AppServices {
    let agentServerService: AgentServerService
    let sessionRegistry: SessionRegistry

    init(
        agentServerService: AgentServerService = AgentServerService(),
        sessionRegistry: SessionRegistry = SessionRegistry()
    ) {
        self.agentServerService = agentServerService
        self.sessionRegistry = sessionRegistry
    }
}

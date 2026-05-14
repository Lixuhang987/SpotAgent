import Foundation

@MainActor
final class AppServices {
    let hotkeyService: HotkeyService
    let agentServerService: AgentServerService
    let sessionRegistry: SessionRegistry

    init(
        hotkeyService: HotkeyService = HotkeyService(),
        agentServerService: AgentServerService = AgentServerService(),
        sessionRegistry: SessionRegistry = SessionRegistry()
    ) {
        self.hotkeyService = hotkeyService
        self.agentServerService = agentServerService
        self.sessionRegistry = sessionRegistry
    }
}

import Foundation
import Carbon.HIToolbox

@MainActor
final class AppServices {
    let hotkeyService: HotkeyService
    let agentServerService: AgentServerService
    let sessionRegistry: SessionRegistry
    let shortcutSettingsStore: ShortcutSettingsStore

    init(
        hotkeyService: HotkeyService? = nil,
        agentServerService: AgentServerService = AgentServerService(),
        sessionRegistry: SessionRegistry = SessionRegistry(),
        shortcutSettingsStore: ShortcutSettingsStore? = nil
    ) {
        let shortcutSettingsStore =
            shortcutSettingsStore
            ?? ShortcutSettingsStore(
                defaultGlobalShortcut: .init(
                    keyCode: UInt16(kVK_Space),
                    modifiers: [.command, .shift]
                ),
                defaultActionShortcuts: [:]
            )
        self.shortcutSettingsStore = shortcutSettingsStore
        self.hotkeyService =
            hotkeyService ?? HotkeyService(configuredShortcut: shortcutSettingsStore.globalShortcut)
        self.agentServerService = agentServerService
        self.sessionRegistry = sessionRegistry
    }
}

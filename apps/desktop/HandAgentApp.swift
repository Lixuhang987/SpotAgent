import AppKit
import KeyboardShortcuts
import SwiftUI

@main
struct HandAgentApp: App {
    @State private var coordinator = AppCoordinator()

    var body: some Scene {
        Settings {
            SettingsView(
                settingsViewModel: coordinator.makeSettingsViewModel(),
                shortcutActions: coordinator.makeShortcutActions()
            )
        }
        .defaultSize(width: 580, height: 480)
        .commands {
            CommandGroup(replacing: .appSettings) {
                Button("设置…") {
                    coordinator.send(.openSettings)
                }
                .keyboardShortcut(",", modifiers: .command)
            }
        }
    }
}

import AppKit
import KeyboardShortcuts
import SwiftUI

@main
struct HandAgentApp: App {
    @NSApplicationDelegateAdaptor(HandAgentApplicationDelegate.self) private var appDelegate
    @State private var coordinator: AppCoordinator

    init() {
        let coordinator = AppCoordinator()
        _coordinator = State(initialValue: coordinator)
        appDelegate.coordinator = coordinator
    }

    var body: some Scene {
        Settings {
            EmptyView()
        }
        .commands {
            CommandGroup(replacing: .appSettings) {
                Button("设置…") {
                    coordinator.send(.openSettings)
                }
            }
        }
    }
}

@MainActor
final class HandAgentApplicationDelegate: NSObject, NSApplicationDelegate {
    weak var coordinator: AppCoordinator?
    private var hasShutDown = false

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        shutdownCoordinatorIfNeeded()
        return .terminateNow
    }

    func applicationWillTerminate(_ notification: Notification) {
        shutdownCoordinatorIfNeeded()
    }

    private func shutdownCoordinatorIfNeeded() {
        guard !hasShutDown else { return }
        hasShutDown = true
        coordinator?.shutdown()
    }
}

import AppKit
import Foundation

@Observable
@MainActor
final class AgentServerHealth {
    private(set) var errorMessage: String?
    var onAvailabilityChange: ((Bool, String?) -> Void)?

    @ObservationIgnored private let agentServer: any AgentServerStarting
    @ObservationIgnored private let fatalAlertPresenter: any FatalAlertPresenting
    @ObservationIgnored private let showsFatalAlert: Bool

    init(
        agentServer: any AgentServerStarting,
        fatalAlertPresenter: any FatalAlertPresenting,
        showsFatalAlert: Bool
    ) {
        self.agentServer = agentServer
        self.fatalAlertPresenter = fatalAlertPresenter
        self.showsFatalAlert = showsFatalAlert
    }

    func start() {
        agentServer.onAvailabilityChange = { [weak self] available in
            Task { @MainActor in
                guard let self else { return }
                if available {
                    self.errorMessage = nil
                    self.onAvailabilityChange?(true, nil)
                } else if self.errorMessage == nil {
                    self.errorMessage = "agent-server 已断开，正在尝试重连…"
                    self.onAvailabilityChange?(false, self.errorMessage)
                }
            }
        }
        agentServer.onFatalError = { [weak self] message in
            Task { @MainActor in
                guard let self else { return }
                self.errorMessage = message
                self.onAvailabilityChange?(false, message)
                self.presentFatalAlert(message: message)
            }
        }
        do {
            try agentServer.start()
            errorMessage = nil
            onAvailabilityChange?(true, nil)
        } catch {
            errorMessage = agentServer.lastStartupError ?? error.localizedDescription
            onAvailabilityChange?(false, errorMessage)
        }
    }

    func stop() {
        agentServer.stop()
    }

    private func presentFatalAlert(message: String) {
        guard showsFatalAlert else { return }
        fatalAlertPresenter.showFatal(
            title: "Agent Server 已停止",
            message: message,
            primaryButtonTitle: "确定",
            secondaryButtonTitle: "查看日志",
            onSecondary: {
                let logsDir = FileManager.default.homeDirectoryForCurrentUser
                    .appendingPathComponent(".spotAgent")
                NSWorkspace.shared.open(logsDir)
            }
        )
    }
}

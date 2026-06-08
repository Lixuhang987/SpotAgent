import XCTest
@testable import HandAgentDesktop

@MainActor
final class AgentServerHealthTests: XCTestCase {
    func testUnavailableCallbackRefreshesLatestStartupErrorMessage() async {
        let appServer = RecordingHealthAppServer()
        let health = AgentServerHealth(
            appServer: appServer,
            fatalAlertPresenter: NopFatalAlertPresenter(),
            showsFatalAlert: false
        )
        var updates: [(Bool, String?)] = []
        health.onAvailabilityChange = { available, message in
            updates.append((available, message))
        }

        health.start()
        appServer.startupErrorMessage = "prewarm failed"
        appServer.onAvailabilityChange?(false)
        await Task.yield()

        XCTAssertEqual(health.errorMessage, "prewarm failed")
        XCTAssertEqual(updates.map(\.0), [false, false])
        XCTAssertEqual(updates.map(\.1), [
            "agent-server 已断开，正在尝试重连…",
            "prewarm failed",
        ])
    }
}

@MainActor
private final class RecordingHealthAppServer: AppServerManaging {
    var isAvailable = false
    var startupErrorMessage: String?
    var onAvailabilityChange: ((Bool) -> Void)?
    var onFatalError: ((String) -> Void)?

    func start() {}
    func stop() {}
}

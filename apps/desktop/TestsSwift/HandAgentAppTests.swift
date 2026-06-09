import AppKit
import XCTest
@testable import HandAgentDesktop

@MainActor
final class HandAgentAppTests: XCTestCase {
    func testApplicationWillTerminateShutsDownCoordinator() {
        let appServer = RecordingLifecycleAppServer()
        let coordinator = AppCoordinator(
            services: AppServices(
                appServer: appServer,
                threadWindowCommandClient: NopThreadWindowCommandClient(),
                platformServerURL: URL(string: "ws://127.0.0.1:0/noop-platform")!,
                hotkeyRegistrar: NopHotkeyRegistrar(),
                settingsWindowPresenter: NopSettingsWindowPresenter(),
                fatalAlertPresenter: NopFatalAlertPresenter(),
                setActivationPolicy: { _ in },
                showsFatalAlert: false
            )
        )
        let delegate = HandAgentApplicationDelegate()
        delegate.coordinator = coordinator

        let reply = delegate.applicationShouldTerminate(NSApplication.shared)
        delegate.applicationWillTerminate(
            Notification(name: NSApplication.willTerminateNotification)
        )

        XCTAssertEqual(reply, .terminateNow)
        XCTAssertEqual(appServer.stopCount, 1)
    }
}

@MainActor
private final class RecordingLifecycleAppServer: AppServerManaging {
    var isAvailable = true
    var startupErrorMessage: String?
    var onAvailabilityChange: ((Bool) -> Void)?
    var onFatalError: ((String) -> Void)?
    private(set) var stopCount = 0

    func start() {}

    func stop() {
        stopCount += 1
    }
}

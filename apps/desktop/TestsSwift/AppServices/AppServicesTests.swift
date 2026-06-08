import XCTest
@testable import HandAgentDesktop

final class AppServicesTests: XCTestCase {
    @MainActor
    func testDefaultThreadWindowWebAppURLUsesLocalHTTPRouteByDefault() throws {
        let url = AppServices.defaultThreadWindowWebAppURL(
            environment: [:],
            bundle: .main,
            currentDirectoryURL: URL(fileURLWithPath: "/repo", isDirectory: true)
        )

        XCTAssertEqual(url.absoluteString, "http://127.0.0.1:4317/thread-window/index.html")
    }

    @MainActor
    func testDefaultThreadWindowWebAppURLRespectsExplicitEnvironmentURL() throws {
        let url = AppServices.defaultThreadWindowWebAppURL(
            environment: ["HANDAGENT_THREAD_WINDOW_WEB_URL": "http://127.0.0.1:9999/custom/index.html"],
            bundle: .main,
            currentDirectoryURL: URL(fileURLWithPath: "/repo", isDirectory: true)
        )

        XCTAssertEqual(url.absoluteString, "http://127.0.0.1:9999/custom/index.html")
    }

    @MainActor
    func testElectronShellFlagSelectsElectronBackedAppServer() throws {
        let appServer = AppServices.defaultAppServer(
            environment: [
                "HANDAGENT_ELECTRON_SHELL": "1",
                "HANDAGENT_ELECTRON_BINARY": "/usr/bin/env",
                "HANDAGENT_ELECTRON_MAIN": "apps/electron-shell/dist/main/main.js",
            ],
            platformServerURL: URL(string: "ws://127.0.0.1:4317/api/platform")!
        )

        XCTAssertTrue(appServer is ElectronBackedAppServer)
    }

    @MainActor
    func testDefaultAppServerUsesSwiftAppServerWithoutElectronFlag() throws {
        let appServer = AppServices.defaultAppServer(
            environment: [:],
            platformServerURL: URL(string: "ws://127.0.0.1:4317/api/platform")!
        )

        XCTAssertTrue(appServer is AppServer)
    }
}

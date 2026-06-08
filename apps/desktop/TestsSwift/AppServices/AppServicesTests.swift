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
                "HANDAGENT_ELECTRON_MAIN": "apps/electron-shell/dist/main/main.js",
            ],
            platformServerURL: URL(string: "ws://127.0.0.1:4317/api/platform")!
        )

        XCTAssertTrue(appServer is ElectronBackedAppServer)
    }

    @MainActor
    func testElectronRuntimeProvidesThreadWindowCommandClient() throws {
        let runtime = AppServices.defaultRuntime(
            environment: [
                "HANDAGENT_ELECTRON_SHELL": "1",
                "HANDAGENT_ELECTRON_MAIN": "apps/electron-shell/dist/main/main.js",
            ],
            platformServerURL: URL(string: "ws://127.0.0.1:4317/api/platform")!
        )

        XCTAssertTrue(runtime.appServer is ElectronBackedAppServer)
        XCTAssertTrue(runtime.threadWindowCommandClient is ElectronBackedAppServer)
        XCTAssertTrue(runtime.activityWindowCommandClient is ElectronBackedAppServer)
        XCTAssertTrue((runtime.appServer as AnyObject) === (runtime.threadWindowCommandClient as AnyObject))
        XCTAssertTrue((runtime.appServer as AnyObject) === (runtime.activityWindowCommandClient as AnyObject))
    }

    @MainActor
    func testDefaultRuntimeDoesNotProvideThreadWindowCommandClientWithoutElectronFlag() throws {
        let runtime = AppServices.defaultRuntime(
            environment: [:],
            platformServerURL: URL(string: "ws://127.0.0.1:4317/api/platform")!
        )

        XCTAssertTrue(runtime.appServer is AppServer)
        XCTAssertNil(runtime.threadWindowCommandClient)
        XCTAssertNil(runtime.activityWindowCommandClient)
    }

    @MainActor
    func testElectronRuntimeProvidesActivityWindowClientAndDisablesSwiftStatusBubble() {
        let services = AppServices(
            environment: [
                "HANDAGENT_ELECTRON_SHELL": "1",
                "HANDAGENT_ELECTRON_MAIN": "apps/electron-shell/dist/main/main.js",
            ]
        )

        XCTAssertNotNil(services.threadWindowCommandClient)
        XCTAssertNotNil(services.activityWindowCommandClient)
        XCTAssertFalse(services.showsStatusBubble)
        XCTAssertTrue(services.showsFatalAlert)
    }

    @MainActor
    func testDefaultElectronShellLaunchUsesPnpmWorkspaceElectron() throws {
        let repoRoot = URL(fileURLWithPath: "/repo/worktree", isDirectory: true)
        let configuration = AppServices.defaultElectronShellLaunchConfiguration(
            environment: ["HANDAGENT_ELECTRON_SHELL": "1"],
            currentDirectoryURL: repoRoot,
            bundleExecutableURL: nil,
            bundleResourceURL: nil,
            bundleURL: nil,
            fileExists: { path in
                path == repoRoot.appendingPathComponent("Package.swift").path ||
                    path == repoRoot.appendingPathComponent("apps/electron-shell/package.json").path
            }
        )

        XCTAssertEqual(configuration.launchPath, "/usr/bin/env")
        XCTAssertEqual(configuration.arguments, [
            "pnpm",
            "--filter",
            "handagent-electron-shell",
            "exec",
            "electron",
            "apps/electron-shell/dist/main/main.js",
        ])
        XCTAssertEqual(configuration.currentDirectoryURL?.path, repoRoot.path)
        XCTAssertEqual(configuration.environment["HANDAGENT_REPO_ROOT"], repoRoot.path)
    }

    @MainActor
    func testDefaultElectronShellLaunchPrefersBundledMainWhenPackagedResourcesExist() throws {
        let resourcesURL = URL(fileURLWithPath: "/Applications/HandAgentDesktop.app/Contents/Resources", isDirectory: true)
        let bundledMain = resourcesURL.appendingPathComponent("ElectronShell/dist/main/main.js")
        let configuration = AppServices.defaultElectronShellLaunchConfiguration(
            environment: ["HANDAGENT_ELECTRON_SHELL": "1"],
            currentDirectoryURL: URL(fileURLWithPath: "/tmp", isDirectory: true),
            bundleExecutableURL: URL(fileURLWithPath: "/Applications/HandAgentDesktop.app/Contents/MacOS/HandAgentDesktop"),
            bundleResourceURL: resourcesURL,
            bundleURL: URL(fileURLWithPath: "/Applications/HandAgentDesktop.app", isDirectory: true),
            fileExists: { path in
                path == bundledMain.path
            }
        )

        XCTAssertEqual(configuration.launchPath, "/usr/bin/env")
        XCTAssertEqual(configuration.arguments, [
            "pnpm",
            "--filter",
            "handagent-electron-shell",
            "exec",
            "electron",
            bundledMain.path,
        ])
        XCTAssertNil(configuration.currentDirectoryURL)
    }

    @MainActor
    func testExplicitElectronBinaryPreservesOverride() throws {
        let configuration = AppServices.defaultElectronShellLaunchConfiguration(
            environment: [
                "HANDAGENT_ELECTRON_SHELL": "1",
                "HANDAGENT_ELECTRON_BINARY": "/custom/electron",
                "HANDAGENT_ELECTRON_MAIN": "/custom/main.js",
            ],
            currentDirectoryURL: URL(fileURLWithPath: "/repo/worktree", isDirectory: true),
            bundleExecutableURL: nil,
            bundleResourceURL: nil,
            bundleURL: nil,
            fileExists: { _ in false }
        )

        XCTAssertEqual(configuration.launchPath, "/custom/electron")
        XCTAssertEqual(configuration.arguments, ["/custom/main.js"])
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

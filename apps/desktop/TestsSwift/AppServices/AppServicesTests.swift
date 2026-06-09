import XCTest
@testable import HandAgentDesktop

final class AppServicesTests: XCTestCase {
    @MainActor
    func testDefaultRuntimeProvidesElectronWindowCommandClientsWithoutFeatureFlag() throws {
        let runtime = AppServices.defaultRuntime(
            environment: [
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
    func testDefaultServicesProvideElectronActivityWindowClient() {
        let services = AppServices(
            environment: [
                "HANDAGENT_ELECTRON_MAIN": "apps/electron-shell/dist/main/main.js",
            ]
        )

        XCTAssertNotNil(services.threadWindowCommandClient)
        XCTAssertNotNil(services.activityWindowCommandClient)
        XCTAssertTrue(services.showsFatalAlert)
    }

    @MainActor
    func testDefaultElectronShellLaunchUsesPnpmWorkspaceElectron() throws {
        let repoRoot = URL(fileURLWithPath: "/repo/worktree", isDirectory: true)
        let electronMain = repoRoot.appendingPathComponent("apps/electron-shell/dist/main/main.js").path
        let configuration = AppServices.defaultElectronShellLaunchConfiguration(
            environment: [:],
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
                electronMain,
            ])
        XCTAssertEqual(configuration.currentDirectoryURL?.path, repoRoot.path)
        XCTAssertEqual(configuration.environment["HANDAGENT_REPO_ROOT"], repoRoot.path)
    }

    @MainActor
    func testRelativeElectronMainOverrideResolvesAgainstRepositoryRoot() throws {
        let repoRoot = URL(fileURLWithPath: "/repo/worktree", isDirectory: true)
        let configuration = AppServices.defaultElectronShellLaunchConfiguration(
            environment: [
                "HANDAGENT_ELECTRON_MAIN": "apps/electron-shell/dist/main/main.js",
            ],
            currentDirectoryURL: repoRoot,
            bundleExecutableURL: nil,
            bundleResourceURL: nil,
            bundleURL: nil,
            fileExists: { path in
                path == repoRoot.appendingPathComponent("Package.swift").path ||
                    path == repoRoot.appendingPathComponent("apps/electron-shell/package.json").path
            }
        )

        XCTAssertEqual(
            configuration.arguments,
            [
                "pnpm",
                "--filter",
                "handagent-electron-shell",
                "exec",
                "electron",
                repoRoot.appendingPathComponent("apps/electron-shell/dist/main/main.js").path,
            ]
        )
    }

    @MainActor
    func testDefaultElectronShellLaunchPrefersBundledMainWhenPackagedResourcesExist() throws {
        let resourcesURL = URL(fileURLWithPath: "/Applications/HandAgentDesktop.app/Contents/Resources", isDirectory: true)
        let bundledMain = resourcesURL.appendingPathComponent("ElectronShell/dist/main/main.js")
        let configuration = AppServices.defaultElectronShellLaunchConfiguration(
            environment: [:],
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
            "electron",
            bundledMain.path,
        ])
        XCTAssertNil(configuration.currentDirectoryURL)
    }

    @MainActor
    func testExplicitElectronBinaryPreservesOverride() throws {
        let configuration = AppServices.defaultElectronShellLaunchConfiguration(
            environment: [
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
}

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
}

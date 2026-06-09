import AppKit
import XCTest
@testable import HandAgentDesktop

final class AppearanceChangeObserverTests: XCTestCase {
    @MainActor
    func testStartDoesNotCrashWhenApplicationIsNotAvailableYet() {
        let observer = SystemAppearanceChangeObserver(applicationProvider: { nil })

        observer.start()
        observer.stop()
    }

    @MainActor
    func testStartRetriesApplicationLookupAfterApplicationWasMissing() {
        var applications: [NSApplication?] = [nil, NSApplication.shared]
        let observer = SystemAppearanceChangeObserver(
            applicationProvider: {
                applications.removeFirst()
            }
        )

        observer.start()
        observer.start()

        XCTAssertTrue(applications.isEmpty)
        observer.stop()
    }
}

import Foundation
import XCTest
@testable import HandAgentDesktop

@MainActor
final class WindowCloseObservationTests: XCTestCase {
    func testCloseNotificationRunsCallbackOnceAndReleasesObserver() async {
        let notificationCenter = NotificationCenter()
        let notificationName = Notification.Name("WindowCloseObservationTests.close")
        let observedObject = NSObject()
        var closeCount = 0
        let closed = expectation(description: "close callback")

        let observation = WindowCloseObservation(
            notificationCenter: notificationCenter,
            notificationName: notificationName,
            object: observedObject,
            queue: nil
        ) {
            closeCount += 1
            closed.fulfill()
        }

        notificationCenter.post(name: notificationName, object: observedObject)
        notificationCenter.post(name: notificationName, object: observedObject)
        await fulfillment(of: [closed], timeout: 1)

        XCTAssertEqual(closeCount, 1)
        XCTAssertFalse(observation.isObserving)
    }

    func testCancelReleasesObserverBeforeCloseNotification() {
        let notificationCenter = NotificationCenter()
        let notificationName = Notification.Name("WindowCloseObservationTests.cancel")
        let observedObject = NSObject()
        var closeCount = 0

        let observation = WindowCloseObservation(
            notificationCenter: notificationCenter,
            notificationName: notificationName,
            object: observedObject,
            queue: nil
        ) {
            closeCount += 1
        }

        observation.cancel()
        notificationCenter.post(name: notificationName, object: observedObject)

        XCTAssertEqual(closeCount, 0)
        XCTAssertFalse(observation.isObserving)
    }

    func testRepeatedWindowCloseCyclesDoNotDuplicateCallbacks() async {
        let notificationCenter = NotificationCenter()
        let notificationName = Notification.Name("WindowCloseObservationTests.repeated")
        var closeCount = 0
        var observations: [WindowCloseObservation] = []
        var observedObjects: [NSObject] = []
        let closed = expectation(description: "close callbacks")
        closed.expectedFulfillmentCount = 20

        for _ in 0..<20 {
            let observedObject = NSObject()
            let observation = WindowCloseObservation(
                notificationCenter: notificationCenter,
                notificationName: notificationName,
                object: observedObject,
                queue: nil
            ) {
                closeCount += 1
                closed.fulfill()
            }
            observedObjects.append(observedObject)
            observations.append(observation)
        }

        for observedObject in observedObjects {
            notificationCenter.post(name: notificationName, object: observedObject)
            notificationCenter.post(name: notificationName, object: observedObject)
        }

        await fulfillment(of: [closed], timeout: 1)
        XCTAssertEqual(closeCount, 20)
        XCTAssertTrue(observations.allSatisfy { !$0.isObserving })
    }
}

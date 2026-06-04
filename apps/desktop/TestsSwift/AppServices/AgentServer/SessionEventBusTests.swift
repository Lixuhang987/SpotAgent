import XCTest
@testable import HandAgentDesktop

@MainActor
final class SessionEventBusTests: XCTestCase {
    func testSessionSubscriberOnlyReceivesMatchingSessionMessages() {
        let bus = SessionEventBus<String>()
        var received: [String] = []

        let subscription = bus.subscribe(sessionID: "session-1") { message in
            received.append(message)
        }

        bus.publish("message-1", to: "session-1")
        bus.publish("message-2", to: "session-2")
        bus.publishGlobal("global-message")

        XCTAssertEqual(received, ["message-1"])
        _ = subscription
    }

    func testCancelledSubscriptionStopsReceivingMessages() {
        let bus = SessionEventBus<String>()
        var received: [String] = []

        let subscription = bus.subscribe(sessionID: "session-1") { message in
            received.append(message)
        }

        bus.publish("before-cancel", to: "session-1")
        subscription.cancel()
        bus.publish("after-cancel", to: "session-1")

        XCTAssertEqual(received, ["before-cancel"])
    }

    func testDifferentSessionSubscriptionsDoNotCrossDeliver() {
        let bus = SessionEventBus<String>()
        var sessionOneReceived: [String] = []
        var sessionTwoReceived: [String] = []

        let subscriptionOne = bus.subscribe(sessionID: "session-1") { message in
            sessionOneReceived.append(message)
        }
        let subscriptionTwo = bus.subscribe(sessionID: "session-2") { message in
            sessionTwoReceived.append(message)
        }

        bus.publish("message-1", to: "session-1")
        bus.publish("message-2", to: "session-2")

        XCTAssertEqual(sessionOneReceived, ["message-1"])
        XCTAssertEqual(sessionTwoReceived, ["message-2"])
        _ = (subscriptionOne, subscriptionTwo)
    }

    func testGlobalSubscriberReceivesMessagesWithoutSessionID() {
        let bus = SessionEventBus<String>()
        var received: [String] = []

        let subscription = bus.subscribeGlobal { message in
            received.append(message)
        }

        bus.publishGlobal("window-message")
        bus.publish("session-message", to: "session-1")

        XCTAssertEqual(received, ["window-message"])
        _ = subscription
    }
}

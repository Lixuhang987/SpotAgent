import XCTest
@testable import HandAgentDesktop

@MainActor
final class ThreadEventBusTests: XCTestCase {
    func testThreadSubscriberOnlyReceivesMatchingThreadMessages() {
        let bus = ThreadEventBus<String>()
        var received: [String] = []

        let subscription = bus.subscribe(threadID: "thread-1") { message in
            received.append(message)
        }

        bus.publish("message-1", to: "thread-1")
        bus.publish("message-2", to: "thread-2")
        bus.publishGlobal("global-message")

        XCTAssertEqual(received, ["message-1"])
        _ = subscription
    }

    func testCancelledSubscriptionStopsReceivingMessages() {
        let bus = ThreadEventBus<String>()
        var received: [String] = []

        let subscription = bus.subscribe(threadID: "thread-1") { message in
            received.append(message)
        }

        bus.publish("before-cancel", to: "thread-1")
        subscription.cancel()
        bus.publish("after-cancel", to: "thread-1")

        XCTAssertEqual(received, ["before-cancel"])
    }

    func testDifferentThreadSubscriptionsDoNotCrossDeliver() {
        let bus = ThreadEventBus<String>()
        var threadOneReceived: [String] = []
        var threadTwoReceived: [String] = []

        let subscriptionOne = bus.subscribe(threadID: "thread-1") { message in
            threadOneReceived.append(message)
        }
        let subscriptionTwo = bus.subscribe(threadID: "thread-2") { message in
            threadTwoReceived.append(message)
        }

        bus.publish("message-1", to: "thread-1")
        bus.publish("message-2", to: "thread-2")

        XCTAssertEqual(threadOneReceived, ["message-1"])
        XCTAssertEqual(threadTwoReceived, ["message-2"])
        _ = (subscriptionOne, subscriptionTwo)
    }

    func testGlobalSubscriberReceivesMessagesWithoutThreadID() {
        let bus = ThreadEventBus<String>()
        var received: [String] = []

        let subscription = bus.subscribeGlobal { message in
            received.append(message)
        }

        bus.publishGlobal("window-message")
        bus.publish("thread-message", to: "thread-1")

        XCTAssertEqual(received, ["window-message"])
        _ = subscription
    }
}

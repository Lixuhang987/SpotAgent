import Foundation

@MainActor
final class ThreadEventBus<Message> {
    final class Subscription {
        private var cancelHandler: (() -> Void)?

        fileprivate init(cancelHandler: @escaping () -> Void) {
            self.cancelHandler = cancelHandler
        }

        func cancel() {
            cancelHandler?()
            cancelHandler = nil
        }

        deinit {
            cancel()
        }
    }

    typealias Handler = (Message) -> Void

    private var threadSubscribers: [String: [UUID: Handler]] = [:]
    private var globalSubscribers: [UUID: Handler] = [:]

    @discardableResult
    func subscribe(threadID: String, handler: @escaping Handler) -> Subscription {
        let id = UUID()
        threadSubscribers[threadID, default: [:]][id] = handler
        return Subscription { [weak self] in
            self?.unsubscribe(threadID: threadID, id: id)
        }
    }

    @discardableResult
    func subscribeGlobal(handler: @escaping Handler) -> Subscription {
        let id = UUID()
        globalSubscribers[id] = handler
        return Subscription { [weak self] in
            self?.unsubscribeGlobal(id: id)
        }
    }

    func publish(_ message: Message, to threadID: String) {
        guard let handlers = threadSubscribers[threadID]?.values else { return }
        for handler in handlers {
            handler(message)
        }
    }

    func publishGlobal(_ message: Message) {
        for handler in globalSubscribers.values {
            handler(message)
        }
    }

    private func unsubscribe(threadID: String, id: UUID) {
        guard var handlers = threadSubscribers[threadID] else { return }
        handlers.removeValue(forKey: id)
        if handlers.isEmpty {
            threadSubscribers.removeValue(forKey: threadID)
        } else {
            threadSubscribers[threadID] = handlers
        }
    }

    private func unsubscribeGlobal(id: UUID) {
        globalSubscribers.removeValue(forKey: id)
    }
}

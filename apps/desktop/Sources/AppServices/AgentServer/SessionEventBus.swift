import Foundation

@MainActor
final class SessionEventBus<Message> {
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

    private var sessionSubscribers: [String: [UUID: Handler]] = [:]
    private var globalSubscribers: [UUID: Handler] = [:]

    @discardableResult
    func subscribe(sessionID: String, handler: @escaping Handler) -> Subscription {
        let id = UUID()
        sessionSubscribers[sessionID, default: [:]][id] = handler
        return Subscription { [weak self] in
            self?.unsubscribe(sessionID: sessionID, id: id)
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

    func publish(_ message: Message, to sessionID: String) {
        guard let handlers = sessionSubscribers[sessionID]?.values else { return }
        for handler in handlers {
            handler(message)
        }
    }

    func publishGlobal(_ message: Message) {
        for handler in globalSubscribers.values {
            handler(message)
        }
    }

    private func unsubscribe(sessionID: String, id: UUID) {
        guard var handlers = sessionSubscribers[sessionID] else { return }
        handlers.removeValue(forKey: id)
        if handlers.isEmpty {
            sessionSubscribers.removeValue(forKey: sessionID)
        } else {
            sessionSubscribers[sessionID] = handlers
        }
    }

    private func unsubscribeGlobal(id: UUID) {
        globalSubscribers.removeValue(forKey: id)
    }
}

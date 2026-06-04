import Foundation

enum AppServerConnectionState: Equatable {
    case disconnected
    case connecting
    case connected
    case reconnecting
}

protocol AppServerWebSocketTask: AnyObject {
    func resume()
    func cancel(with closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?)
    func send(
        _ message: URLSessionWebSocketTask.Message,
        completionHandler: @escaping @Sendable (Error?) -> Void
    )
    func receive(
        completionHandler: @escaping @Sendable (Result<URLSessionWebSocketTask.Message, Error>) -> Void
    )
}

extension URLSessionWebSocketTask: AppServerWebSocketTask {}

protocol AppServerConnectionTransport {
    func makeWebSocketTask(with url: URL) -> any AppServerWebSocketTask
}

final class URLSessionAppServerConnectionTransport: AppServerConnectionTransport {
    private let session: URLSession

    init(session: URLSession = .shared) {
        self.session = session
    }

    func makeWebSocketTask(with url: URL) -> any AppServerWebSocketTask {
        session.webSocketTask(with: url)
    }
}

final class AppServerConnection: @unchecked Sendable {
    typealias State = AppServerConnectionState

    var onStateChange: ((State) -> Void)?
    var onTextMessage: ((String) -> Void)?

    private let serverURL: URL?
    private let transport: any AppServerConnectionTransport
    private let reconnectDelay: TimeInterval

    private var socketTask: (any AppServerWebSocketTask)?
    private var reconnectWorkItem: DispatchWorkItem?
    private var userRequestedDisconnect = false
    private var state: State = .disconnected

    init(serverURL: URL?, session: URLSession = .shared) {
        self.serverURL = serverURL
        self.transport = URLSessionAppServerConnectionTransport(session: session)
        self.reconnectDelay = 2
    }

    init(
        serverURL: URL?,
        transport: any AppServerConnectionTransport,
        reconnectDelay: TimeInterval = 2
    ) {
        self.serverURL = serverURL
        self.transport = transport
        self.reconnectDelay = reconnectDelay
    }

    func connect() {
        userRequestedDisconnect = false
        guard let serverURL, socketTask == nil else { return }
        openSocket(serverURL: serverURL, state: .connecting)
    }

    func disconnect() {
        userRequestedDisconnect = true
        reconnectWorkItem?.cancel()
        reconnectWorkItem = nil
        socketTask?.cancel(with: .goingAway, reason: nil)
        socketTask = nil
        emitState(.disconnected)
    }

    func send(text: String) {
        guard let socketTask else { return }
        socketTask.send(.string(text)) { _ in }
    }

    private func openSocket(serverURL: URL, state: State) {
        reconnectWorkItem?.cancel()
        reconnectWorkItem = nil

        if self.state != state {
            emitState(state)
        }

        let socketTask = transport.makeWebSocketTask(with: serverURL)
        self.socketTask = socketTask
        socketTask.resume()
        receiveNextMessage()
        emitState(.connected)
    }

    private func receiveNextMessage() {
        guard let socketTask else { return }
        let taskID = ObjectIdentifier(socketTask)

        socketTask.receive { [weak self, taskID] result in
            guard let self else { return }

            switch result {
            case .success(.string(let text)):
                self.onTextMessage?(text)
                self.receiveNextMessage()
            case .success:
                self.receiveNextMessage()
            case .failure:
                self.handleReceiveFailure(taskID: taskID)
            }
        }
    }

    private func handleReceiveFailure(taskID: ObjectIdentifier) {
        guard isCurrentSocketTask(taskID), !userRequestedDisconnect else { return }

        socketTask = nil
        scheduleReconnect()
    }

    private func scheduleReconnect() {
        if state != .reconnecting {
            emitState(.reconnecting)
        }

        guard let serverURL else {
            emitState(.disconnected)
            return
        }

        let workItem = DispatchWorkItem { [weak self] in
            guard let self, !self.userRequestedDisconnect, self.socketTask == nil else { return }
            self.openSocket(serverURL: serverURL, state: .reconnecting)
        }
        reconnectWorkItem = workItem

        if reconnectDelay == 0 {
            workItem.perform()
        } else {
            DispatchQueue.main.asyncAfter(deadline: .now() + reconnectDelay, execute: workItem)
        }
    }

    private func emitState(_ newState: State) {
        state = newState
        onStateChange?(newState)
    }

    private func isCurrentSocketTask(_ taskID: ObjectIdentifier) -> Bool {
        guard let socketTask else { return false }
        return ObjectIdentifier(socketTask) == taskID
    }
}

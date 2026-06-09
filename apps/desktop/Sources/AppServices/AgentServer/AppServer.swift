import Foundation

@MainActor
protocol AppServerManaging: AnyObject {
    var isAvailable: Bool { get }
    var startupErrorMessage: String? { get }
    var onAvailabilityChange: ((Bool) -> Void)? { get set }
    var onFatalError: ((String) -> Void)? { get set }
    var onHostTerminationRequest: (() -> Void)? { get set }

    func start()
    func stop()
}

@MainActor
final class PlatformBridgeConnectionClient {
    private let connection: AppServerConnection
    private let platformBridge: PlatformBridgeService
    private let retryHelloDelayNanoseconds: UInt64
    private var helloRetryTask: Task<Void, Never>?

    init(
        connection: AppServerConnection,
        platformBridge: PlatformBridgeService,
        retryHelloDelayNanoseconds: UInt64 = 250_000_000
    ) {
        self.connection = connection
        self.platformBridge = platformBridge
        self.retryHelloDelayNanoseconds = retryHelloDelayNanoseconds
        connection.onStateChange = { [weak self] state in
            Task { @MainActor in
                guard state == .connected, let self else { return }
                self.sendHello()
                self.scheduleHelloRetry()
            }
        }
        connection.onTextMessage = { [weak self] text in
            Task { @MainActor in
                await self?.platformBridge.handleIncoming(raw: text) { [weak self] response in
                    self?.connection.send(text: response)
                }
            }
        }
    }

    func connect() {
        connection.connect()
    }

    func disconnect() {
        helloRetryTask?.cancel()
        helloRetryTask = nil
        connection.disconnect()
    }

    private func sendHello() {
        connection.send(text: platformBridge.makeHelloMessage())
    }

    private func scheduleHelloRetry() {
        helloRetryTask?.cancel()
        let delay = retryHelloDelayNanoseconds
        helloRetryTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: delay)
            guard !Task.isCancelled else { return }
            await MainActor.run {
                self?.sendHello()
            }
        }
    }
}

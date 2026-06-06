import ComposableArchitecture

@Reducer
struct AppFeature {
    @ObservableState
    struct State: Equatable {
        var isAppServerAvailable = false
        var threadConnectionState: AppServerConnectionState = .disconnected
        var openThreadWindowCount = 0
    }

    enum Action: Equatable {
        case appServerAvailabilityChanged(Bool)
        case threadConnectionStateChanged(AppServerConnectionState)
        case threadWindowOpened
        case threadWindowClosed
    }

    var body: some ReducerOf<Self> {
        Reduce { state, action in
            switch action {
            case .appServerAvailabilityChanged(let available):
                state.isAppServerAvailable = available
                return .none
            case .threadConnectionStateChanged(let connectionState):
                state.threadConnectionState = connectionState
                return .none
            case .threadWindowOpened:
                state.openThreadWindowCount += 1
                return .none
            case .threadWindowClosed:
                state.openThreadWindowCount = max(0, state.openThreadWindowCount - 1)
                return .none
            }
        }
    }
}

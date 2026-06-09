import Foundation

enum ActivityWindowCommandKind: Equatable {
    case show
}

struct ActivityWindowCommandResult: Equatable {
    let commandId: String
    let kind: ActivityWindowCommandKind
    let ok: Bool
    let error: String?
}

@MainActor
protocol ActivityWindowCommanding: AnyObject {
    var onActivityWindowCommandResult: ((ActivityWindowCommandResult) -> Void)? { get set }

    @discardableResult
    func showActivityWindow() throws -> String
}

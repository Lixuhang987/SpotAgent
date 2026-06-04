import XCTest
@testable import HandAgentDesktop

final class SessionWindowViewModelTests: XCTestCase {
    @MainActor
    private func makeModel(
        commandSink: UnsafeMutablePointer<[SessionProtocolClient.Command]>? = nil,
        responseSink: UnsafeMutablePointer<[SessionProtocolClient.Response]>? = nil,
        onTabClosed: @escaping @MainActor (SessionTabViewModel) -> Void = { _ in }
    ) -> (SessionWindowViewModel, SessionEventBus<SessionEvent>) {
        let bus = SessionEventBus<SessionEvent>()
        let model = SessionWindowViewModel(
            subscribeToSessionEvents: { sessionID, handler in
                bus.subscribe(sessionID: sessionID, handler: handler)
            },
            subscribeToGlobalEvents: { handler in
                bus.subscribeGlobal(handler: handler)
            },
            sendCommand: { command in
                commandSink?.pointee.append(command)
            },
            sendResponse: { response in
                responseSink?.pointee.append(response)
            },
            onTabClosed: onTabClosed
        )
        return (model, bus)
    }

    @MainActor
    func testInitializesHistoryListRequestWhenWindowModelIsCreated() {
        var commands: [SessionProtocolClient.Command] = []
        _ = withUnsafeMutablePointer(to: &commands) { pointer in
            makeModel(commandSink: pointer)
        }

        guard case .sessionsList? = commands.first else {
            return XCTFail("expected initial sessionsList command")
        }
    }

    @MainActor
    func testCreateSessionResponseOpensTabAndRefreshesHistoryList() {
        var commands: [SessionProtocolClient.Command] = []
        let (model, bus) = withUnsafeMutablePointer(to: &commands) { pointer in
            makeModel(commandSink: pointer)
        }
        let initialCommandCount = commands.count

        bus.publishGlobal(.createSessionResponse(sessionID: "session-1", title: nil, responseMessageID: "cmd-1"))

        XCTAssertEqual(model.activeTab?.sessionID, "session-1")
        XCTAssertEqual(model.tabs.map(\.sessionID), ["session-1"])
        XCTAssertEqual(commands.count, initialCommandCount + 2)
        guard case .sessionSubscribe(let sessionId, _, _) = commands[initialCommandCount] else {
            return XCTFail("expected sessionSubscribe")
        }
        XCTAssertEqual(sessionId, "session-1")
        guard case .sessionsList = commands[initialCommandCount + 1] else {
            return XCTFail("expected refresh sessionsList")
        }
    }

    @MainActor
    func testSuccessfulDeleteSessionResponseClosesOpenRunningTabAndRefreshesHistoryList() {
        var commands: [SessionProtocolClient.Command] = []
        var closedSessionIDs: [String] = []
        let (model, bus) = withUnsafeMutablePointer(to: &commands) { pointer in
            makeModel(commandSink: pointer, onTabClosed: { tab in
                closedSessionIDs.append(tab.sessionID)
            })
        }

        model.openHistorySession("finished-session")
        model.openHistorySession("running-session")
        let commandCountBeforeDelete = commands.count

        bus.publishGlobal(.deleteSessionResponse(targetSessionID: "running-session", status: "deleted"))

        XCTAssertEqual(model.tabs.map(\.sessionID), ["finished-session"])
        XCTAssertEqual(model.activeTab?.sessionID, "finished-session")
        XCTAssertEqual(closedSessionIDs, ["running-session"])
        XCTAssertEqual(commands.count, commandCountBeforeDelete + 2)
        guard case .sessionUnsubscribe(let sessionId, _, _) = commands[commandCountBeforeDelete] else {
            return XCTFail("expected sessionUnsubscribe for closed tab")
        }
        XCTAssertEqual(sessionId, "running-session")
        guard case .sessionsList = commands[commandCountBeforeDelete + 1] else {
            return XCTFail("expected sessionsList refresh after delete")
        }
    }

    @MainActor
    func testNonDeletedDeleteSessionResponseKeepsOpenTabAndRefreshesHistoryList() {
        var commands: [SessionProtocolClient.Command] = []
        var closedSessionIDs: [String] = []
        let (model, bus) = withUnsafeMutablePointer(to: &commands) { pointer in
            makeModel(commandSink: pointer, onTabClosed: { tab in
                closedSessionIDs.append(tab.sessionID)
            })
        }
        model.openHistorySession("target-session")
        let commandCountBeforeDelete = commands.count

        bus.publishGlobal(.deleteSessionResponse(targetSessionID: "target-session", status: "not_found"))

        XCTAssertEqual(model.tabs.map(\.sessionID), ["target-session"])
        XCTAssertEqual(model.activeTab?.sessionID, "target-session")
        XCTAssertTrue(closedSessionIDs.isEmpty)
        XCTAssertEqual(commands.count, commandCountBeforeDelete + 1)
        guard case .sessionsList = commands.last else {
            return XCTFail("expected sessionsList refresh")
        }
    }

    @MainActor
    func testOpenHistorySessionCreatesAndActivatesTab() {
        let (model, _) = makeModel()

        model.openHistorySession("session-1")

        XCTAssertEqual(model.tabs.map(\.sessionID), ["session-1"])
        XCTAssertEqual(model.activeTab?.sessionID, "session-1")
    }

    @MainActor
    func testOpenHistorySessionReusesExistingTab() {
        let (model, _) = makeModel()

        model.openHistorySession("session-1")
        model.openHistorySession("session-1")

        XCTAssertEqual(model.tabs.count, 1)
        XCTAssertEqual(model.activeTab?.sessionID, "session-1")
    }

    @MainActor
    func testHistoryActionDoesNotChangeActiveTab() {
        let (model, _) = makeModel()
        model.openHistorySession("session-1")
        model.openHistorySession("session-2")

        model.openOrFocusHistory()

        XCTAssertEqual(model.activeTab?.sessionID, "session-2")
    }

    @MainActor
    func testInvalidActiveTabClosesToEmptyState() {
        let (model, _) = makeModel()
        model.openHistorySession("session-1")

        model.activeTab?.handle(.sessionOpenFailed(reason: "not_found", message: "missing"))
        model.pruneInvalidTabs()

        XCTAssertTrue(model.tabs.isEmpty)
        XCTAssertNil(model.activeTab)
        XCTAssertEqual(model.noticeMessage, "missing")
    }

    @MainActor
    func testActiveTabExposesInputTarget() {
        let (model, _) = makeModel()

        XCTAssertNil(model.activeTab)
        model.openHistorySession("session-1")

        XCTAssertEqual(model.activeTab?.sessionID, "session-1")
    }

    @MainActor
    func testComposerSubmitFromEmptyWorkspaceCreatesTabThenSendsPromptThroughSharedConnection() {
        var commands: [SessionProtocolClient.Command] = []
        let (model, bus) = withUnsafeMutablePointer(to: &commands) { pointer in
            makeModel(commandSink: pointer)
        }

        model.sendPrompt("hello from panel")

        guard case let .sessionCreate(commandId, _, initialText, attachments, _, _)? = commands.last else {
            return XCTFail("expected sessionCreate")
        }
        XCTAssertNil(initialText)
        XCTAssertTrue(attachments.isEmpty)

        bus.publishGlobal(.createSessionResponse(
            sessionID: "session-created",
            title: nil,
            responseMessageID: commandId
        ))

        XCTAssertEqual(model.activeTab?.sessionID, "session-created")
        XCTAssertEqual(model.activeTab?.messages.map(\.text), ["hello from panel"])
        guard let turnStart = commands.last(where: {
            if case .turnStart = $0 { return true }
            return false
        }) else {
            return XCTFail("expected turnStart after create response")
        }
        guard case .turnStart(let sessionId, _, _, let text, _) = turnStart else {
            return XCTFail("expected turnStart after create response")
        }
        XCTAssertEqual(sessionId, "session-created")
        XCTAssertEqual(text, "hello from panel")
    }

    @MainActor
    func testCreateNewSessionSendsWorkspaceId() {
        var commands: [SessionProtocolClient.Command] = []
        let (model, _) = withUnsafeMutablePointer(to: &commands) { pointer in
            makeModel(commandSink: pointer)
        }

        model.createNewSession(workspaceId: "ws-abc")

        guard case let .sessionCreate(_, _, _, _, workspaceId, _)? = commands.last else {
            return XCTFail("expected sessionCreate")
        }
        XCTAssertEqual(workspaceId, "ws-abc")
    }

    @MainActor
    func testPromptPanelInitialSubmitCreatesNewSessionEvenWhenATabIsActive() {
        var commands: [SessionProtocolClient.Command] = []
        let (model, bus) = withUnsafeMutablePointer(to: &commands) { pointer in
            makeModel(commandSink: pointer)
        }
        model.openHistorySession("existing-session")
        let openExistingCount = commands.count

        model.createTabWithInitialPrompt("new prompt")

        XCTAssertEqual(model.activeTab?.sessionID, "existing-session")
        let createCommandIndex = openExistingCount
        guard case let .sessionCreate(commandId, _, _, _, _, _)? = commands[safe: createCommandIndex] else {
            return XCTFail("expected sessionCreate for new prompt")
        }

        bus.publishGlobal(.createSessionResponse(
            sessionID: "new-session",
            title: nil,
            responseMessageID: commandId
        ))

        XCTAssertEqual(model.activeTab?.sessionID, "new-session")
        XCTAssertEqual(model.tabs.map(\.sessionID), ["existing-session", "new-session"])
        XCTAssertEqual(model.activeTab?.messages.map(\.text), ["new prompt"])
    }

    @MainActor
    func testConsecutiveInitialPromptsAreMatchedToTheirCreateSessionResponses() {
        var commands: [SessionProtocolClient.Command] = []
        let (model, bus) = withUnsafeMutablePointer(to: &commands) { pointer in
            makeModel(commandSink: pointer)
        }

        model.createTabWithInitialPrompt("prompt A")
        model.createTabWithInitialPrompt("prompt B")

        guard case let .sessionCreate(requestA, _, _, _, _, _) = commands[1],
              case let .sessionCreate(requestB, _, _, _, _, _) = commands[2] else {
            return XCTFail("expected consecutive sessionCreate commands")
        }

        bus.publishGlobal(.createSessionResponse(sessionID: "session-A", title: nil, responseMessageID: requestA))
        bus.publishGlobal(.createSessionResponse(sessionID: "session-B", title: nil, responseMessageID: requestB))

        XCTAssertEqual(model.tabs.map(\.sessionID), ["session-A", "session-B"])
        XCTAssertEqual(model.tabs.first(where: { $0.sessionID == "session-A" })?.messages.map(\.text), ["prompt A"])
        XCTAssertEqual(model.tabs.first(where: { $0.sessionID == "session-B" })?.messages.map(\.text), ["prompt B"])
    }

    @MainActor
    func testCreateSessionFailureClearsOnlyMatchingPendingInitialPrompt() {
        var commands: [SessionProtocolClient.Command] = []
        let (model, bus) = withUnsafeMutablePointer(to: &commands) { pointer in
            makeModel(commandSink: pointer)
        }

        model.createTabWithInitialPrompt("prompt A")
        model.createTabWithInitialPrompt("prompt B")

        guard case let .sessionCreate(requestA, _, _, _, _, _) = commands[1],
              case let .sessionCreate(requestB, _, _, _, _, _) = commands[2] else {
            return XCTFail("expected consecutive sessionCreate commands")
        }

        bus.publishGlobal(.userMessageFailed(
            reason: "invalid_request",
            message: "Action binding resolver is not configured",
            responseMessageID: requestA
        ))
        bus.publishGlobal(.createSessionResponse(
            sessionID: "session-A-stale",
            title: nil,
            responseMessageID: requestA
        ))
        bus.publishGlobal(.createSessionResponse(
            sessionID: "session-B",
            title: nil,
            responseMessageID: requestB
        ))

        XCTAssertEqual(model.noticeMessage, "Action binding resolver is not configured")
        XCTAssertEqual(model.tabs.map(\.sessionID), ["session-A-stale", "session-B"])
        XCTAssertEqual(model.tabs.first(where: { $0.sessionID == "session-A-stale" })?.messages, [])
        XCTAssertEqual(model.activeTab?.messages.map(\.text), ["prompt B"])
    }
}

private extension Collection {
    subscript(safe index: Index) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}

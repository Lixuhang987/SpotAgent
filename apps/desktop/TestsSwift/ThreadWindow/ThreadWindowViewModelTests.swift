import XCTest
@testable import HandAgentDesktop

final class ThreadWindowViewModelTests: XCTestCase {
    @MainActor
    private func makeModel(
        commandSink: UnsafeMutablePointer<[ThreadProtocolClient.Command]>? = nil,
        responseSink: UnsafeMutablePointer<[ThreadProtocolClient.Response]>? = nil,
        onTabClosed: @escaping @MainActor (ThreadTabViewModel) -> Void = { _ in }
    ) -> (ThreadWindowViewModel, ThreadEventBus<ThreadEvent>) {
        let bus = ThreadEventBus<ThreadEvent>()
        let model = ThreadWindowViewModel(
            subscribeToThreadEvents: { threadID, handler in
                bus.subscribe(threadID: threadID, handler: handler)
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
        var commands: [ThreadProtocolClient.Command] = []
        _ = withUnsafeMutablePointer(to: &commands) { pointer in
            makeModel(commandSink: pointer)
        }

        guard case .threadList? = commands.first else {
            return XCTFail("expected initial threadList command")
        }
    }

    @MainActor
    func testCreateThreadResponseOpensTabAndRefreshesHistoryList() {
        var commands: [ThreadProtocolClient.Command] = []
        let (model, bus) = withUnsafeMutablePointer(to: &commands) { pointer in
            makeModel(commandSink: pointer)
        }
        let initialCommandCount = commands.count

        bus.publishGlobal(.threadStarted(threadID: "thread-1", title: nil, responseMessageID: "cmd-1"))

        XCTAssertEqual(model.activeTab?.threadID, "thread-1")
        XCTAssertEqual(model.tabs.map(\.threadID), ["thread-1"])
        XCTAssertEqual(commands.count, initialCommandCount + 2)
        guard case .threadResume(let threadId, _, _) = commands[initialCommandCount] else {
            return XCTFail("expected threadResume")
        }
        XCTAssertEqual(threadId, "thread-1")
        guard case .threadList = commands[initialCommandCount + 1] else {
            return XCTFail("expected refresh threadList")
        }
    }

    @MainActor
    func testSuccessfulDeleteThreadResponseClosesOpenRunningTabAndRefreshesHistoryList() {
        var commands: [ThreadProtocolClient.Command] = []
        var closedThreadIDs: [String] = []
        let (model, bus) = withUnsafeMutablePointer(to: &commands) { pointer in
            makeModel(commandSink: pointer, onTabClosed: { tab in
                closedThreadIDs.append(tab.threadID)
            })
        }

        model.openHistoryThread("finished-thread")
        model.openHistoryThread("running-thread")
        let commandCountBeforeDelete = commands.count

        bus.publishGlobal(.threadDeleted(targetThreadID: "running-thread", status: "deleted"))

        XCTAssertEqual(model.tabs.map(\.threadID), ["finished-thread"])
        XCTAssertEqual(model.activeTab?.threadID, "finished-thread")
        XCTAssertEqual(closedThreadIDs, ["running-thread"])
        XCTAssertEqual(commands.count, commandCountBeforeDelete + 1)
        guard case .threadList = commands[commandCountBeforeDelete] else {
            return XCTFail("expected threadList refresh after delete")
        }
    }

    @MainActor
    func testNonDeletedDeleteThreadResponseKeepsOpenTabAndRefreshesHistoryList() {
        var commands: [ThreadProtocolClient.Command] = []
        var closedThreadIDs: [String] = []
        let (model, bus) = withUnsafeMutablePointer(to: &commands) { pointer in
            makeModel(commandSink: pointer, onTabClosed: { tab in
                closedThreadIDs.append(tab.threadID)
            })
        }
        model.openHistoryThread("target-thread")
        let commandCountBeforeDelete = commands.count

        bus.publishGlobal(.threadDeleted(targetThreadID: "target-thread", status: "not_found"))

        XCTAssertEqual(model.tabs.map(\.threadID), ["target-thread"])
        XCTAssertEqual(model.activeTab?.threadID, "target-thread")
        XCTAssertTrue(closedThreadIDs.isEmpty)
        XCTAssertEqual(commands.count, commandCountBeforeDelete + 1)
        guard case .threadList = commands.last else {
            return XCTFail("expected threadList refresh")
        }
    }

    @MainActor
    func testOpenHistoryThreadCreatesAndActivatesTab() {
        let (model, _) = makeModel()

        model.openHistoryThread("thread-1")

        XCTAssertEqual(model.tabs.map(\.threadID), ["thread-1"])
        XCTAssertEqual(model.activeTab?.threadID, "thread-1")
    }

    @MainActor
    func testOpenHistoryThreadReusesExistingTab() {
        let (model, _) = makeModel()

        model.openHistoryThread("thread-1")
        model.openHistoryThread("thread-1")

        XCTAssertEqual(model.tabs.count, 1)
        XCTAssertEqual(model.activeTab?.threadID, "thread-1")
    }

    @MainActor
    func testHistoryActionDoesNotChangeActiveTab() {
        let (model, _) = makeModel()
        model.openHistoryThread("thread-1")
        model.openHistoryThread("thread-2")

        model.openOrFocusHistory()

        XCTAssertEqual(model.activeTab?.threadID, "thread-2")
    }

    @MainActor
    func testInvalidActiveTabClosesToEmptyState() {
        let (model, _) = makeModel()
        model.openHistoryThread("thread-1")

        model.activeTab?.handle(.threadOpenFailed(reason: "not_found", message: "missing"))
        model.pruneInvalidTabs()

        XCTAssertTrue(model.tabs.isEmpty)
        XCTAssertNil(model.activeTab)
        XCTAssertEqual(model.noticeMessage, "missing")
    }

    @MainActor
    func testActiveTabExposesInputTarget() {
        let (model, _) = makeModel()

        XCTAssertNil(model.activeTab)
        model.openHistoryThread("thread-1")

        XCTAssertEqual(model.activeTab?.threadID, "thread-1")
    }

    @MainActor
    func testComposerSubmitFromEmptyWorkspaceCreatesTabThenSendsPromptThroughSharedConnection() {
        var commands: [ThreadProtocolClient.Command] = []
        let (model, bus) = withUnsafeMutablePointer(to: &commands) { pointer in
            makeModel(commandSink: pointer)
        }

        model.sendPrompt("hello from panel")

        guard case let .threadStart(commandId, _, workspaceId, _)? = commands.last else {
            return XCTFail("expected threadStart")
        }
        XCTAssertNil(workspaceId)

        bus.publishGlobal(.threadStarted(
            threadID: "thread-created",
            title: nil,
            responseMessageID: commandId
        ))

        XCTAssertEqual(model.activeTab?.threadID, "thread-created")
        XCTAssertEqual(model.activeTab?.messages.map(\.text), ["hello from panel"])
        guard let turnStart = commands.last(where: {
            if case .turnStart = $0 { return true }
            return false
        }) else {
            return XCTFail("expected turnStart after create response")
        }
        guard case .turnStart(let threadId, _, _, let text, _) = turnStart else {
            return XCTFail("expected turnStart after create response")
        }
        XCTAssertEqual(threadId, "thread-created")
        XCTAssertEqual(text, "hello from panel")
    }

    @MainActor
    func testCreateNewThreadSendsWorkspaceId() {
        var commands: [ThreadProtocolClient.Command] = []
        let (model, _) = withUnsafeMutablePointer(to: &commands) { pointer in
            makeModel(commandSink: pointer)
        }

        model.createNewThread(workspaceId: "ws-abc")

        guard case let .threadStart(_, _, workspaceId, _)? = commands.last else {
            return XCTFail("expected threadStart")
        }
        XCTAssertEqual(workspaceId, "ws-abc")
    }

    @MainActor
    func testPromptPanelInitialSubmitCreatesNewThreadEvenWhenATabIsActive() {
        var commands: [ThreadProtocolClient.Command] = []
        let (model, bus) = withUnsafeMutablePointer(to: &commands) { pointer in
            makeModel(commandSink: pointer)
        }
        model.openHistoryThread("existing-thread")
        let openExistingCount = commands.count

        model.createTabWithInitialPrompt("new prompt")

        XCTAssertEqual(model.activeTab?.threadID, "existing-thread")
        let createCommandIndex = openExistingCount
        guard case let .threadStart(commandId, _, _, _)? = commands[safe: createCommandIndex] else {
            return XCTFail("expected threadStart for new prompt")
        }

        bus.publishGlobal(.threadStarted(
            threadID: "new-thread",
            title: nil,
            responseMessageID: commandId
        ))

        XCTAssertEqual(model.activeTab?.threadID, "new-thread")
        XCTAssertEqual(model.tabs.map(\.threadID), ["existing-thread", "new-thread"])
        XCTAssertEqual(model.activeTab?.messages.map(\.text), ["new prompt"])
    }

    @MainActor
    func testConsecutiveInitialPromptsAreMatchedToTheirCreateThreadResponses() {
        var commands: [ThreadProtocolClient.Command] = []
        let (model, bus) = withUnsafeMutablePointer(to: &commands) { pointer in
            makeModel(commandSink: pointer)
        }

        model.createTabWithInitialPrompt("prompt A")
        model.createTabWithInitialPrompt("prompt B")

        guard case let .threadStart(requestA, _, _, _) = commands[1],
              case let .threadStart(requestB, _, _, _) = commands[2] else {
            return XCTFail("expected consecutive threadStart commands")
        }

        bus.publishGlobal(.threadStarted(threadID: "thread-A", title: nil, responseMessageID: requestA))
        bus.publishGlobal(.threadStarted(threadID: "thread-B", title: nil, responseMessageID: requestB))

        XCTAssertEqual(model.tabs.map(\.threadID), ["thread-A", "thread-B"])
        XCTAssertEqual(model.tabs.first(where: { $0.threadID == "thread-A" })?.messages.map(\.text), ["prompt A"])
        XCTAssertEqual(model.tabs.first(where: { $0.threadID == "thread-B" })?.messages.map(\.text), ["prompt B"])
    }

    @MainActor
    func testCreateThreadFailureClearsOnlyMatchingPendingInitialPrompt() {
        var commands: [ThreadProtocolClient.Command] = []
        let (model, bus) = withUnsafeMutablePointer(to: &commands) { pointer in
            makeModel(commandSink: pointer)
        }

        model.createTabWithInitialPrompt("prompt A")
        model.createTabWithInitialPrompt("prompt B")

        guard case let .threadStart(requestA, _, _, _) = commands[1],
              case let .threadStart(requestB, _, _, _) = commands[2] else {
            return XCTFail("expected consecutive threadStart commands")
        }

        bus.publishGlobal(.threadStartFailed(
            reason: "invalid_request",
            message: "Action binding resolver is not configured",
            responseMessageID: requestA
        ))
        bus.publishGlobal(.threadStarted(
            threadID: "thread-A-stale",
            title: nil,
            responseMessageID: requestA
        ))
        bus.publishGlobal(.threadStarted(
            threadID: "thread-B",
            title: nil,
            responseMessageID: requestB
        ))

        XCTAssertEqual(model.noticeMessage, "Action binding resolver is not configured")
        XCTAssertEqual(model.tabs.map(\.threadID), ["thread-A-stale", "thread-B"])
        XCTAssertEqual(model.tabs.first(where: { $0.threadID == "thread-A-stale" })?.messages, [])
        XCTAssertEqual(model.activeTab?.messages.map(\.text), ["prompt B"])
    }
}

private extension Collection {
    subscript(safe index: Index) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}

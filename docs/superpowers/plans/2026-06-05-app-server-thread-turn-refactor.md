# AppServer Thread/Turn Refactor Implementation Plan

> **状态：历史实施计划。**
> 本文记录旧 `Session*` 主路径到 `Thread*` / `Turn*` 语义的迁移步骤，不作为当前代码结构的直接依据。当前开发请沿目录文档读取最新边界。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all front-end and back-end `session` semantics with `thread`/`turn`, introduce a single Swift `AppServer` kernel plus TCA stores, and delete the legacy `Session*` runtime path.

**Architecture:** Implement the refactor in vertical slices. First rename core protocol and storage primitives to `Thread*`, then switch `apps/agent-server` onto the new protocol and thread runtime modules, then add a shared Swift `AppServer`/`AppServerClient` kernel and TCA thread stores, then rewire the window/prompt/status flows to the new stores, and finally delete the legacy `Session*` path and update docs/QA. The final system uses one shared client/connection path, routes platform RPC through `PlatformBridgeService`, and stores thread snapshot state separately from thread event cache.

**Tech Stack:** TypeScript, Vitest, Swift 6, SwiftUI, The Composable Architecture, URLSessionWebSocketTask, Node WebSocket bridge

---

### Task 1: Rename Core Protocol and Storage to `Thread*`

**Files:**
- Create: `packages/core/src/protocol/ThreadCommand.ts`
- Create: `packages/core/src/protocol/ThreadNotification.ts`
- Create: `packages/core/src/protocol/ThreadProtocolShared.ts`
- Create: `packages/core/src/storage/ThreadRecord.ts`
- Create: `packages/core/src/storage/ThreadStore.ts`
- Create: `packages/core/src/storage/FileThreadStore.ts`
- Create: `packages/core/src/storage/InMemoryThreadStore.ts`
- Modify: `packages/core/src/runtime/AgentSessionHandle.ts`
- Modify: `packages/core/src/conversation/ConversationMessage.ts`
- Modify: `packages/core/src/protocol/ServerRequest.ts`
- Modify: `packages/core/src/protocol/ClientResponse.ts`
- Modify: `packages/core/src/protocol/protocol.md`
- Modify: `packages/core/src/storage/storage.md`
- Modify: `packages/core/core.md`
- Delete: `packages/core/src/protocol/SessionCommand.ts`
- Delete: `packages/core/src/protocol/SessionEvent.ts`
- Delete: `packages/core/src/protocol/SessionProtocolShared.ts`
- Delete: `packages/core/src/storage/SessionRecord.ts`
- Delete: `packages/core/src/storage/SessionStore.ts`
- Delete: `packages/core/src/storage/FileSessionStore.ts`
- Delete: `packages/core/src/storage/InMemorySessionStore.ts`
- Test: `apps/agent-server/tests/server/server.test.ts`
- Test: `apps/agent-server/tests/session/SessionCommandRouter.test.ts`

- [ ] **Step 1: Write the failing protocol/storage rename tests**

```ts
import { describe, expect, it } from "vitest";
import type { ThreadCommand } from "@handagent/core/protocol/ThreadCommand";
import { FileThreadStore } from "@handagent/core/storage/FileThreadStore";

describe("thread protocol naming", () => {
  it("exposes thread.start and turn.start commands", () => {
    const command: ThreadCommand = {
      type: "thread.start",
      commandId: "cmd-1",
      timestamp: "2026-06-05T00:00:00.000Z",
      payload: {
        workspaceId: null,
        actionBinding: null,
      },
    };
    expect(command.type).toBe("thread.start");
  });

  it("persists thread records through ThreadStore naming", async () => {
    const store = new FileThreadStore("/tmp/handagent-thread-store");
    await expect(store.list()).resolves.toEqual([]);
  });
});
```

- [ ] **Step 2: Run the targeted TypeScript tests to confirm they fail before the rename**

Run: `pnpm exec vitest run apps/agent-server/tests/server/server.test.ts apps/agent-server/tests/session/SessionCommandRouter.test.ts`

Expected: FAIL with import/type errors referencing missing `ThreadCommand` / `ThreadStore` symbols.

- [ ] **Step 3: Rename the core protocol types and the storage API**

```ts
// packages/core/src/protocol/ThreadCommand.ts
import type { ActionBinding } from "../actions/ActionBinding";
import type { ThreadAttachment } from "./ThreadProtocolShared";

export type ThreadCommand =
  | {
      type: "thread.start";
      commandId: string;
      timestamp: string;
      payload: {
        workspaceId: string | null;
        actionBinding: ActionBinding | null;
      };
    }
  | {
      type: "thread.resume";
      threadId: string;
      commandId: string;
      timestamp: string;
    }
  | {
      type: "thread.list";
      commandId: string;
      timestamp: string;
    }
  | {
      type: "thread.delete";
      commandId: string;
      timestamp: string;
      payload: { targetThreadId: string };
    }
  | {
      type: "turn.start";
      threadId: string;
      commandId: string;
      timestamp: string;
      payload: {
        text: string;
        attachments?: ThreadAttachment[];
      };
    }
  | {
      type: "turn.interrupt";
      threadId: string;
      commandId: string;
      timestamp: string;
    };
```

```ts
// packages/core/src/storage/ThreadStore.ts
import type { PersistedThread, ThreadMetadata, ThreadAuditEvent } from "./ThreadRecord";

export interface ThreadStore {
  create(thread: PersistedThread): Promise<void>;
  get(threadId: string): Promise<PersistedThread | null>;
  delete(threadId: string): Promise<void>;
  list(): Promise<ThreadMetadata[]>;
  updatePreview(threadId: string, preview: string | null, timestamp: string): Promise<void>;
  appendMessages(threadId: string, messages: PersistedThread["messages"], timestamp: string): Promise<void>;
  setMessages(threadId: string, messages: PersistedThread["messages"], timestamp: string): Promise<void>;
  appendEvents(threadId: string, events: ThreadAuditEvent[], timestamp: string): Promise<void>;
}
```

```ts
// packages/core/src/runtime/AgentSessionHandle.ts
import type { ThreadCommand } from "../protocol/ThreadCommand";
import type { ThreadNotification } from "../protocol/ThreadNotification";

export interface AgentThreadHandle {
  submit(command: Extract<ThreadCommand, { type: "turn.start" | "turn.interrupt" }>): Promise<void>;
  nextEvent(): Promise<ThreadNotification>;
}
```

- [ ] **Step 4: Update conversation/protocol docs and on-disk thread directory naming**

```md
`packages/core/src/protocol` defines `ThreadCommand`, `ThreadNotification`,
`ServerRequest`, `ClientResponse`, and `PlatformBridgeMessage`.

`packages/core/src/storage` persists `PersistedThread` to `~/.spotAgent/threads/`.
There is no remaining `session_*` contract in core after this task.
```

- [ ] **Step 5: Re-run the targeted tests and the full TypeScript suite**

Run: `pnpm exec vitest run apps/agent-server/tests/server/server.test.ts apps/agent-server/tests/session/SessionCommandRouter.test.ts`

Expected: PASS

Run: `bash ./scripts/test.sh`

Expected: PASS with Vitest exiting `0`.

- [ ] **Step 6: Commit the core rename slice**

```bash
git add packages/core apps/agent-server/tests/server/server.test.ts apps/agent-server/tests/session/SessionCommandRouter.test.ts
git commit -m "refactor: rename core session protocol to thread"
```

### Task 2: Replace `apps/agent-server/src/session` with `src/thread`

**Files:**
- Create: `apps/agent-server/src/thread/ThreadCommandRouter.ts`
- Create: `apps/agent-server/src/thread/ThreadNotificationPublisher.ts`
- Create: `apps/agent-server/src/thread/ThreadRuntimeOrchestrator.ts`
- Create: `apps/agent-server/src/thread/ThreadPersistence.ts`
- Create: `apps/agent-server/src/thread/thread.md`
- Modify: `apps/agent-server/src/server/server.ts`
- Modify: `apps/agent-server/src/server/server.md`
- Modify: `apps/agent-server/src/src.md`
- Modify: `apps/agent-server/agent-server.md`
- Modify: `apps/agent-server/src/protocol/MessageTranslator.ts`
- Modify: `apps/agent-server/src/protocol/protocol.md`
- Modify: `apps/agent-server/src/actions/SessionScopedToolRegistry.ts`
- Modify: `apps/agent-server/src/actions/actions.md`
- Modify: `apps/agent-server/src/bridges/SessionPermissionBridge.ts`
- Modify: `apps/agent-server/src/bridges/SessionWorkspaceAskBridge.ts`
- Modify: `apps/agent-server/src/bridges/WebSocketPlatformBridge.ts`
- Modify: `apps/agent-server/src/bridges/bridges.md`
- Delete: `apps/agent-server/src/session/SessionCommandRouter.ts`
- Delete: `apps/agent-server/src/session/SessionEventPublisher.ts`
- Delete: `apps/agent-server/src/session/SessionRuntimeOrchestrator.ts`
- Delete: `apps/agent-server/src/session/SessionPersistence.ts`
- Delete: `apps/agent-server/src/session/session.md`
- Test: `apps/agent-server/tests/session/SessionCommandRouter.test.ts`
- Test: `apps/agent-server/tests/session/SessionEventPublisher.test.ts`
- Test: `apps/agent-server/tests/session/SessionPersistence.test.ts`
- Test: `apps/agent-server/tests/session/SessionRuntimeOrchestrator.test.ts`
- Test: `apps/agent-server/tests/server/server.test.ts`

- [ ] **Step 1: Write the failing thread-module tests**

```ts
import { describe, expect, it } from "vitest";
import { ThreadCommandRouter } from "../../src/thread/ThreadCommandRouter";

describe("ThreadCommandRouter", () => {
  it("handles thread.resume by publishing a thread snapshot", async () => {
    const sent: string[] = [];
    const router = new ThreadCommandRouter({
      publish: (notification) => sent.push(notification.type),
    } as never);

    await expect(
      router.handle({
        type: "thread.resume",
        threadId: "thread-1",
        commandId: "cmd-1",
        timestamp: "2026-06-05T00:00:00.000Z",
      })
    ).resolves.toBeUndefined();

    expect(sent).toContain("thread.snapshot");
  });
});
```

- [ ] **Step 2: Run the focused thread/server tests to confirm the old `Session*` modules fail the new contract**

Run: `pnpm exec vitest run apps/agent-server/tests/session/SessionCommandRouter.test.ts apps/agent-server/tests/session/SessionRuntimeOrchestrator.test.ts apps/agent-server/tests/server/server.test.ts`

Expected: FAIL with missing `ThreadCommandRouter` / mismatched `thread.*` message shapes.

- [ ] **Step 3: Create the new thread modules and update the server composition root**

```ts
// apps/agent-server/src/thread/ThreadCommandRouter.ts
import type { ThreadCommand } from "@handagent/core/protocol/ThreadCommand";
import type { ThreadNotification } from "@handagent/core/protocol/ThreadNotification";
import { ThreadPersistence } from "./ThreadPersistence";
import { ThreadRuntimeOrchestrator } from "./ThreadRuntimeOrchestrator";
import { ThreadNotificationPublisher } from "./ThreadNotificationPublisher";

export class ThreadCommandRouter {
  constructor(
    private readonly persistence: ThreadPersistence,
    private readonly orchestrator: ThreadRuntimeOrchestrator,
    private readonly publisher: ThreadNotificationPublisher
  ) {}

  async handle(command: ThreadCommand): Promise<void> {
    switch (command.type) {
      case "thread.start":
        await this.handleThreadStart(command);
        return;
      case "thread.resume":
        await this.handleThreadResume(command);
        return;
      case "thread.list":
        await this.handleThreadList(command);
        return;
      case "thread.delete":
        await this.handleThreadDelete(command);
        return;
      case "turn.start":
        await this.orchestrator.handleTurnStart(command, (notification) => this.publisher.publish(notification));
        return;
      case "turn.interrupt":
        await this.orchestrator.handleTurnInterrupt(command, (notification) => this.publisher.publish(notification));
        return;
    }
  }

  private async handleThreadResume(command: Extract<ThreadCommand, { type: "thread.resume" }>) {
    const snapshot = await this.persistence.loadThreadSnapshot(command.threadId);
    this.publisher.publishToThread(command.threadId, {
      type: "thread.snapshot",
      threadId: command.threadId,
      commandId: command.commandId,
      timestamp: command.timestamp,
      payload: snapshot,
    } satisfies ThreadNotification);
  }
}
```

```ts
// apps/agent-server/src/server/server.ts
if (isThreadCommand(message)) {
  await threadCommandRouter.handle(message);
  return;
}

if (isClientResponse(message)) {
  await responseRouter.handle(message);
  return;
}

if (isPlatformBridgeMessage(message)) {
  await platformBridge.handle(message);
  return;
}
```

- [ ] **Step 4: Rename server-side thread-bound bridges and their docs**

```ts
// apps/agent-server/src/bridges/ThreadPermissionBridge.ts
export class ThreadPermissionBridge {
  bindThread(connectionId: string, threadId: string): void {
    this.connectionByThread.set(threadId, connectionId);
  }
}
```

```md
The `thread/` directory owns thread lifecycle, thread resume, thread list, and turn orchestration.
No `session/` runtime directory remains after this task.
```

- [ ] **Step 5: Run the full agent-server tests**

Run: `pnpm exec vitest run apps/agent-server/tests/session apps/agent-server/tests/server apps/agent-server/tests/bridges apps/agent-server/tests/protocol`

Expected: PASS

Run: `bash ./scripts/test.sh`

Expected: PASS with no references to `session_*` protocol types.

- [ ] **Step 6: Commit the agent-server thread runtime slice**

```bash
git add apps/agent-server
git commit -m "refactor: replace agent-server session runtime with thread runtime"
```

### Task 3: Add Swift `AppServer` Kernel and Shared `AppServerClient`

**Files:**
- Modify: `Package.swift`
- Create: `apps/desktop/Sources/AppServices/AppServer/AppServer.swift`
- Create: `apps/desktop/Sources/AppServices/AppServer/AppServerClient.swift`
- Create: `apps/desktop/Sources/AppServices/AppServer/AppServerMessage.swift`
- Create: `apps/desktop/Sources/AppServices/AppServer/app-server.md`
- Modify: `apps/desktop/Sources/AppServices/AppServices.swift`
- Modify: `apps/desktop/Sources/AppServices/AppServicesProductionImpls.swift`
- Modify: `apps/desktop/Sources/AppServices/AgentServer/AgentServerService.swift`
- Modify: `apps/desktop/Sources/AppServices/AgentServer/agent-server.md`
- Modify: `apps/desktop/Sources/AppServices/PlatformBridge/PlatformBridgeService.swift`
- Modify: `apps/desktop/Sources/AppServices/PlatformBridge/platform-bridge.md`
- Delete: `apps/desktop/Sources/AppServices/AgentServer/AppServerConnection.swift`
- Delete: `apps/desktop/Sources/AppServices/AgentServer/SessionEventBus.swift`
- Test: `apps/desktop/TestsSwift/AppServices/AgentServer/AppServerConnectionTests.swift`
- Test: `apps/desktop/TestsSwift/AppServices/AgentServer/SessionEventBusTests.swift`
- Test: `apps/desktop/TestsSwift/AppServices/PlatformBridge/PlatformBridgeServiceTests.swift`

- [ ] **Step 1: Add the TCA dependency and create failing Swift tests for the new client/kernel**

```swift
// Package.swift
.package(url: "https://github.com/pointfreeco/swift-composable-architecture", from: "1.25.5"),
```

```swift
import ComposableArchitecture
import Testing
@testable import HandAgentDesktop

struct AppServerClientTests {
    @Test func decodesThreadSnapshotNotification() throws {
        let json = """
        {"type":"thread.snapshot","threadId":"thread-1","timestamp":"2026-06-05T00:00:00.000Z","payload":{"status":"idle","messages":[]}}
        """
        let inbound = try AppServerClient.decodeInboundMessage(from: json)
        #expect(inbound == .notification(.threadSnapshot(threadID: "thread-1", status: .idle, messages: [])))
    }
}
```

- [ ] **Step 2: Run Swift tests to confirm the new kernel/client types are missing**

Run: `bash ./scripts/swiftw test`

Expected: FAIL with missing `ComposableArchitecture` dependency and missing `AppServerClient` types.

- [ ] **Step 3: Implement the shared client and the top-level `AppServer` facade**

```swift
// apps/desktop/Sources/AppServices/AppServer/AppServerClient.swift
import Foundation

final class AppServerClient: @unchecked Sendable {
    enum ConnectionState: Equatable {
        case disconnected
        case connecting
        case connected
        case reconnecting
    }

    var onConnectionStateChanged: (@Sendable (ConnectionState) -> Void)?
    var onInboundMessage: (@Sendable (AppServerInboundMessage) -> Void)?

    func connect() { /* open one shared socket */ }
    func disconnect() { /* close socket and cancel reconnect */ }
    func send(_ message: AppServerOutboundMessage) throws { /* encode thread/turn/platform messages */ }
}
```

```swift
// apps/desktop/Sources/AppServices/AppServer/AppServer.swift
import Foundation

@MainActor
final class AppServer {
    private let processService: any AgentServerStarting
    private let client: AppServerClient
    private let platformBridgeService: PlatformBridgeService

    init(
        processService: any AgentServerStarting,
        client: AppServerClient,
        platformBridgeService: PlatformBridgeService
    ) {
        self.processService = processService
        self.client = client
        self.platformBridgeService = platformBridgeService
    }

    func startThread(workspaceID: String?, actionBinding: ActionBindingPayload?) throws { /* send thread.start */ }
    func resumeThread(threadID: String) throws { /* send thread.resume */ }
    func listThreads() throws { /* send thread.list */ }
    func deleteThread(threadID: String) throws { /* send thread.delete */ }
    func startTurn(threadID: String, text: String, attachments: [ThreadAttachmentPayload]) throws { /* send turn.start */ }
    func interruptTurn(threadID: String) throws { /* send turn.interrupt */ }
}
```

- [ ] **Step 4: Move platform RPC handling onto the shared client**

```swift
// apps/desktop/Sources/AppServices/PlatformBridge/PlatformBridgeService.swift
@MainActor
final class PlatformBridgeService {
    private let provider: PlatformProvider

    func handle(_ request: AppServerInboundMessage.PlatformRequest, reply: @escaping (AppServerOutboundMessage) -> Void) async {
        do {
            let result = try await provider.handle(method: request.method, args: request.args)
            reply(.platformResponse(requestID: request.requestID, status: .ok, result: result))
        } catch let error as PlatformBridgeError {
            reply(.platformResponse(requestID: request.requestID, status: .error(code: error.code, message: error.message)))
        } catch {
            reply(.platformResponse(requestID: request.requestID, status: .error(code: "unknown", message: error.localizedDescription)))
        }
    }
}
```

- [ ] **Step 5: Replace the old connection/event-bus tests with new kernel/client tests**

Run: `bash ./scripts/swiftw test`

Expected: PASS with `AppServerClientTests`, `AppServerTests`, and `PlatformBridgeServiceTests` replacing the deleted `AppServerConnection` / `SessionEventBus` tests.

Run: `bash ./scripts/swiftw build`

Expected: PASS

- [ ] **Step 6: Commit the Swift kernel slice**

```bash
git add Package.swift apps/desktop/Sources/AppServices apps/desktop/TestsSwift/AppServices
git commit -m "refactor: add shared swift app server kernel"
```

### Task 4: Introduce TCA `ThreadState`, `EventStore`, and Window Features

**Files:**
- Create: `apps/desktop/Sources/ThreadWindow/ThreadFeature.swift`
- Create: `apps/desktop/Sources/ThreadWindow/ThreadState.swift`
- Create: `apps/desktop/Sources/ThreadWindow/EventStore.swift`
- Create: `apps/desktop/Sources/ThreadWindow/ThreadWindowFeature.swift`
- Create: `apps/desktop/Sources/ThreadWindow/ThreadEventTypes.swift`
- Create: `apps/desktop/Sources/ThreadWindow/ThreadRunStatus.swift`
- Create: `apps/desktop/Sources/ThreadWindow/thread-window.md`
- Modify: `apps/desktop/Sources/AppServices/AppServices.swift`
- Modify: `apps/desktop/Sources/AppServices/app-services.md`
- Delete: `apps/desktop/Sources/SessionWindow/SessionViewModel.swift`
- Delete: `apps/desktop/Sources/SessionWindow/SessionWindowViewModel.swift`
- Delete: `apps/desktop/Sources/SessionWindow/SessionTabViewModel.swift`
- Delete: `apps/desktop/Sources/SessionWindow/SessionRunStatus.swift`
- Test: `apps/desktop/TestsSwift/SessionWindow/SessionViewModelTests.swift`
- Test: `apps/desktop/TestsSwift/SessionWindow/SessionWindowViewModelTests.swift`
- Test: `apps/desktop/TestsSwift/SessionWindow/SessionTabViewModelTests.swift`

- [ ] **Step 1: Write failing reducer tests for thread snapshot state and event cache**

```swift
import ComposableArchitecture
import Testing
@testable import HandAgentDesktop

struct ThreadFeatureTests {
    @Test func threadSnapshotUpdatesThreadStateWithoutOverwritingEventCache() async {
        let store = TestStore(
            initialState: ThreadFeature.State(
                thread: ThreadState(threadID: "thread-1"),
                events: EventStore(messages: [.user(id: "u1", text: "hello")])
            )
        ) {
            ThreadFeature()
        }

        await store.send(.notification(.threadSnapshot(
            threadID: "thread-1",
            snapshot: .init(status: .idle, preview: "hello", messages: [])
        ))) {
            $0.thread.preview = "hello"
            $0.thread.status = .idle
            $0.events.messages = [.user(id: "u1", text: "hello")]
        }
    }
}
```

- [ ] **Step 2: Run Swift tests to confirm the TCA feature types are missing**

Run: `bash ./scripts/swiftw test`

Expected: FAIL with missing `ThreadFeature`, `ThreadState`, and `EventStore` symbols.

- [ ] **Step 3: Implement the reducers and state split**

```swift
// apps/desktop/Sources/ThreadWindow/ThreadState.swift
import Foundation

struct ThreadState: Equatable, Identifiable {
    let id: String
    var preview: String?
    var title: String?
    var status: ThreadRunStatus
    var createdAt: Date?
    var updatedAt: Date?
    var workspaceID: String?
    var actionBinding: ActionBindingPayload?
    var isInvalid: Bool
    var invalidReason: String?

    init(threadID: String) {
        self.id = threadID
        self.status = .idle
        self.isInvalid = false
    }
}
```

```swift
// apps/desktop/Sources/ThreadWindow/EventStore.swift
import Foundation

struct EventStore: Equatable {
    var messages: [ThreadMessage] = []
    var activeTurnID: String?
    var pendingPermissionRequests: [ThreadPermissionRequest] = []
    var pendingWorkspaceRequests: [ThreadWorkspaceRequest] = []
    var pendingOptimisticTurnMessageID: String?
    var errorMessage: String?
}
```

```swift
// apps/desktop/Sources/ThreadWindow/ThreadFeature.swift
import ComposableArchitecture

@Reducer
struct ThreadFeature {
    struct State: Equatable, Identifiable {
        var id: String { thread.id }
        var thread: ThreadState
        var events: EventStore
    }

    enum Action: Equatable {
        case notification(ThreadNotificationPayload)
        case permissionResolved(requestID: String, decision: ThreadPermissionDecision, scope: ThreadPermissionScope?)
        case workspaceResolved(requestID: String, workspaceID: String?)
        case startTurn(text: String, attachments: [ThreadAttachmentPayload])
        case interruptTurn
    }

    var body: some ReducerOf<Self> {
        Reduce { state, action in
            switch action {
            case .notification(.threadSnapshot(_, let snapshot)):
                state.thread.preview = snapshot.preview
                state.thread.status = snapshot.status
                if state.events.messages.isEmpty {
                    state.events.messages = snapshot.messages
                }
                return .none
            default:
                return .none
            }
        }
    }
}
```

- [ ] **Step 4: Replace view-model tests with reducer tests**

Run: `bash ./scripts/swiftw test`

Expected: PASS with new reducer tests replacing `SessionViewModelTests`, `SessionWindowViewModelTests`, and `SessionTabViewModelTests`.

- [ ] **Step 5: Commit the TCA state split**

```bash
git add apps/desktop/Sources/ThreadWindow apps/desktop/TestsSwift/ThreadWindow apps/desktop/Sources/AppServices/app-services.md
git commit -m "refactor: move thread window state to tca reducers"
```

### Task 5: Rename `SessionWindow`/`SessionRegistry` UI and Rewire Coordinator, PromptPanel, StatusBubble

**Files:**
- Create: `apps/desktop/Sources/ThreadWindow/ThreadWindowView.swift`
- Create: `apps/desktop/Sources/ThreadWindow/ThreadContentView.swift`
- Create: `apps/desktop/Sources/ThreadWindow/ThreadHistorySidebarView.swift`
- Create: `apps/desktop/Sources/ThreadWindow/ThreadRequestBubbleViews.swift`
- Create: `apps/desktop/Sources/ThreadWindow/ThreadTabBarView.swift`
- Create: `apps/desktop/Sources/ThreadWindow/ThreadWorkspaceView.swift`
- Create: `apps/desktop/Sources/AppServices/Thread/ThreadRegistry.swift`
- Create: `apps/desktop/Sources/AppServices/Thread/ThreadHistoryStore.swift`
- Create: `apps/desktop/Sources/AppServices/Thread/thread.md`
- Modify: `apps/desktop/Sources/Coordinator/AppCoordinator.swift`
- Modify: `apps/desktop/Sources/Coordinator/SessionWindowLifecycle.swift`
- Modify: `apps/desktop/Sources/Coordinator/PromptSubmission.swift`
- Modify: `apps/desktop/Sources/Coordinator/coordinator.md`
- Modify: `apps/desktop/Sources/PromptPanel/PromptPanelViewModel.swift`
- Modify: `apps/desktop/Sources/PromptPanel/prompt-panel.md`
- Modify: `apps/desktop/Sources/StatusBubble/StatusBubbleViewModel.swift`
- Modify: `apps/desktop/Sources/StatusBubble/status-bubble.md`
- Modify: `apps/desktop/Sources/AppServices/AppServices.swift`
- Modify: `apps/desktop/Sources/AppServices/app-services.md`
- Delete: `apps/desktop/Sources/SessionWindow/SessionWindowView.swift`
- Delete: `apps/desktop/Sources/SessionWindow/SessionContentView.swift`
- Delete: `apps/desktop/Sources/SessionWindow/SessionHistorySidebarView.swift`
- Delete: `apps/desktop/Sources/SessionWindow/SessionRequestBubbleViews.swift`
- Delete: `apps/desktop/Sources/SessionWindow/SessionTabBarView.swift`
- Delete: `apps/desktop/Sources/AppServices/Session/SessionRegistry.swift`
- Delete: `apps/desktop/Sources/AppServices/Session/SessionHistoryStore.swift`
- Test: `apps/desktop/TestsSwift/Coordinator/AppCoordinatorTests.swift`
- Test: `apps/desktop/TestsSwift/PromptPanel/PromptPanelViewModelTests.swift`
- Test: `apps/desktop/TestsSwift/StatusBubble/StatusBubbleViewModelTests.swift`
- Test: `apps/desktop/TestsSwift/SessionWindow/SessionWindowViewTests.swift`

- [ ] **Step 1: Write failing coordinator/UI tests using thread terminology**

```swift
import Testing
@testable import HandAgentDesktop

struct AppCoordinatorThreadTests {
    @Test func submitPromptStartsNewThread() async throws {
        let services = AppServices.testing()
        let coordinator = await MainActor.run { AppCoordinator(services: services) }

        await MainActor.run {
            coordinator.send(.submitPrompt("hello", attachments: []))
        }

        #expect(services.appServerRecorder.startedThreads.count == 1)
        #expect(services.threadWindowPresenter.presentedStore != nil)
    }
}
```

- [ ] **Step 2: Run Swift tests to confirm the coordinator and views still depend on `Session*`**

Run: `bash ./scripts/swiftw test`

Expected: FAIL with references to `SessionWindowLifecycle`, `SessionRegistry`, and `SessionWindowViewModel`.

- [ ] **Step 3: Rename the UI surface and rewire Coordinator/AppServices to `Thread*`**

```swift
// apps/desktop/Sources/Coordinator/ThreadWindowLifecycle.swift
@Observable
@MainActor
final class ThreadWindowLifecycle {
    private(set) var store: StoreOf<ThreadWindowFeature>?

    func createThreadWithInitialPrompt(_ prompt: PromptSubmission, onClosed: @escaping @MainActor () -> Void) {
        let store = ensureWindow(onClosed: onClosed)
        store.send(.startNewThread(prompt.composed, attachments: prompt.threadAttachments, actionBinding: prompt.actionBinding))
    }
}
```

```swift
// apps/desktop/Sources/AppServices/Thread/ThreadRegistry.swift
@Observable
@MainActor
final class ThreadRegistry {
    private(set) var summaries: [ThreadSummary] = []

    func upsert(_ summary: ThreadSummary) {
        summaries.removeAll { $0.threadID == summary.threadID }
        summaries.append(summary)
        summaries.sort { $0.lastActiveAt > $1.lastActiveAt }
    }
}
```

```swift
// apps/desktop/Sources/PromptPanel/PromptPanelViewModel.swift
var canSubmitPrompt: Bool {
    agentServerHealth.isAvailable && !trimmedPrompt.isEmpty
}
```

- [ ] **Step 4: Update status bubble and prompt panel tests to consume thread summaries**

Run: `bash ./scripts/swiftw test`

Expected: PASS

Run: `bash ./scripts/swiftw build`

Expected: PASS

- [ ] **Step 5: Commit the UI rename slice**

```bash
git add apps/desktop/Sources/Coordinator apps/desktop/Sources/PromptPanel apps/desktop/Sources/StatusBubble apps/desktop/Sources/ThreadWindow apps/desktop/Sources/AppServices/Thread apps/desktop/TestsSwift
git commit -m "refactor: rename session window ui to thread window"
```

### Task 6: Delete Legacy `Session*` Artifacts, Update TODO/Docs/QA, and Run Full Verification

**Files:**
- Modify: `docs/TODO.md`
- Modify: `docs/manual-qa.md`
- Modify: `handAgent.md`
- Modify: `apps/apps.md`
- Modify: `apps/desktop/desktop.md`
- Modify: `apps/desktop/Sources/AppServices/app-services.md`
- Modify: `apps/desktop/Sources/AppServices/AgentServer/agent-server.md`
- Modify: `apps/desktop/Sources/AppServices/PlatformBridge/platform-bridge.md`
- Modify: `apps/desktop/Sources/Coordinator/coordinator.md`
- Modify: `apps/agent-server/agent-server.md`
- Modify: `apps/agent-server/src/src.md`
- Modify: `apps/agent-server/src/thread/thread.md`
- Modify: `packages/core/core.md`
- Modify: `packages/core/src/protocol/protocol.md`
- Modify: `packages/core/src/storage/storage.md`
- Delete: `apps/desktop/Sources/SessionWindow/session-window.md`
- Delete: `apps/desktop/Sources/AppServices/Session/session.md`
- Delete: `apps/agent-server/src/session/session.md`
- Delete: any remaining `Session*` Swift/TS source and tests that are no longer referenced
- Test: `bash ./scripts/test.sh`
- Test: `bash ./scripts/swiftw test`
- Test: `bash ./scripts/swiftw build`

- [ ] **Step 1: Add the remaining thread-only TODO entries before code cleanup completes**

```md
## Thread protocol follow-ups

- `thread.archive / unarchive`
- `thread.read`
- `thread.fork`
- `thread.rollback`
- thread metadata/title update
- thread settings update / notification
- goal / budget
- realtime
- codex-style unified `item.*` thread event model
- archived/list/search thread management semantics
```

- [ ] **Step 2: Remove any leftover `Session*` runtime/documentation references**

```bash
rg -n "Session|session_" apps/desktop apps/agent-server packages/core handAgent.md docs
```

Expected: only historical migration notes, fixture data, or user-facing references that are intentionally unchanged. No runtime file, type, protocol, directory, or doc section should describe the new implementation as `Session*`.

- [ ] **Step 3: Update manual QA to the new thread terminology**

```md
### 2026-06-05 Thread/Turn destructive refactor

- 完成日期：2026-06-05
- 关键 commit：执行 `git rev-parse --short HEAD`，记录最终实现提交号
- 实现位置：Swift `AppServer` + TCA thread window, TS `thread/` runtime, core `Thread*` protocol/storage
- 验收结果：
  - 新建 thread 成功
  - 恢复 thread 成功
  - turn 中断成功
  - server 重启后 thread resume 恢复成功
```

- [ ] **Step 4: Run the full verification suite**

Run: `bash ./scripts/test.sh`

Expected: PASS

Run: `bash ./scripts/swiftw test`

Expected: PASS

Run: `bash ./scripts/swiftw build`

Expected: PASS

- [ ] **Step 5: Commit the cleanup/docs/QA slice**

```bash
git add handAgent.md apps packages docs
git commit -m "docs: finalize thread-only refactor docs and qa"
```

## Self-Review

- Spec coverage:
  - `Thread` 统一命名：Task 1, 2, 5, 6 覆盖。
  - 破坏性重构、删除旧实现：Task 3, 4, 5, 6 覆盖。
  - Swift `AppServer` + `AppServerClient`：Task 3 覆盖。
  - TCA `ThreadState` + `EventStore`：Task 4 覆盖。
  - `PlatformBridgeService` 走共享连接：Task 3 覆盖。
  - 最小 `thread.start / resume / list / delete` 与 `turn.start / interrupt`：Task 1, 2, 3, 4 覆盖。
  - TODO / manual QA / 文档同步：Task 6 覆盖。
- Placeholder scan: no `TBD` / `TODO` / “similar to task N” placeholders remain inside execution steps.
- Type consistency: plan统一使用 `Thread*`、`EventStore`、`AppServer*` 命名，不再把新实现命名为 `Session*`。

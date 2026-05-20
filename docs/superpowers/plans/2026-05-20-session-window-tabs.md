# SessionWindow Single-Window Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor HandAgent session history into one global SessionWindow where the window owns tabs, each tab owns one complete session lifecycle, and history clicks open or activate tabs.

**Architecture:** The implementation first makes the WebSocket protocol explicit: opening a missing session fails structurally, new sessions are created only through `create_session_request`, and deletion serializes interrupt plus delete. Then the desktop layer splits current session state into `SessionTabViewModel` and a window-level `SessionWindowViewModel`, with `SessionWindowLifecycle` owning one NSWindow. UI and entrypoints are updated last so each lower layer is already testable.

**Tech Stack:** TypeScript, Vitest, Swift, XCTest, SwiftUI, WebSocket `SessionMessage`, existing `bash ./scripts/test.sh` and `bash ./scripts/swiftw test/build`.

---

## File Structure

Create or modify these files:

- `packages/core/src/protocol/SessionMessage.ts`: add explicit create/open/user/delete response frames.
- `apps/agent-server/src/SessionRouter.ts`: implement explicit protocol semantics and route create/delete.
- `apps/agent-server/src/SessionRuntimeOrchestrator.ts`: add existence-safe user-message handling helpers and interrupt waiting for delete.
- `apps/agent-server/src/SessionRouter.test.ts`: cover protocol routing, missing session failures, create session, delete response.
- `apps/agent-server/src/SessionRuntimeOrchestrator.test.ts`: cover interrupt waiting and no write-after-delete behavior.
- `apps/desktop/Sources/SessionWindow/SessionSocketClient.swift`: decode/send new frames.
- `apps/desktop/Sources/SessionWindow/SessionTabViewModel.swift`: new per-session state owner, extracted from current `SessionViewModel`.
- `apps/desktop/Sources/SessionWindow/SessionWindowViewModel.swift`: new window-level state owner for history, tabs, active tab and delete confirmation.
- `apps/desktop/Sources/SessionWindow/SessionWindowView.swift`: bind to `SessionWindowViewModel`, render history, tabs, active tab, empty state.
- `apps/desktop/Sources/Coordinator/SessionWindowLifecycle.swift`: new single-window lifecycle replacing session-id keyed windows.
- `apps/desktop/Sources/Coordinator/AppCoordinator.swift`: remove restore/history window entrypoints; route prompt/history actions to the single window.
- `apps/desktop/Sources/AppServices/AppServices.swift`: update presenter protocols and testing nop types.
- `apps/desktop/Sources/AppServices/AppServicesProductionImpls.swift`: update `ProductionSessionWindowPresenter`; remove HistoryWindow presenter.
- `apps/desktop/Sources/AppServices/Session/SessionRegistry.swift`: derive status from open tabs rather than open session windows.
- `apps/desktop/TestsSwift/SessionSocketClientTests.swift`: cover new frame encoding/decoding.
- `apps/desktop/TestsSwift/SessionTabViewModelTests.swift`: new per-session behavior tests.
- `apps/desktop/TestsSwift/SessionWindowViewModelTests.swift`: new window/tab coordination tests.
- `apps/desktop/TestsSwift/AppCoordinatorTests.swift`: update PromptPanel and single-window expectations.
- Remove after callers are gone: `apps/desktop/Sources/SessionWindow/SessionHistoryWindowView.swift`, `apps/desktop/Sources/SessionWindow/SessionHistoryViewModel.swift`, `apps/desktop/Sources/Coordinator/HistoryLifecycle.swift`, `apps/desktop/TestsSwift/SessionHistoryViewModelTests.swift`.
- Docs to update near the end: `handAgent.md`, `apps/desktop/desktop.md`, `apps/desktop/Sources/SessionWindow/session-window.md`, `apps/desktop/Sources/Coordinator/coordinator.md`, `docs/manual-qa.md`.

## Before Starting Execution

- [ ] **Step 1: Create an implementation worktree**

Run from `/Users/mu9/proj/handAgent`:

```bash
git worktree add .worktrees/session-window-tabs -b codex/session-window-tabs
cd .worktrees/session-window-tabs
```

Expected: new worktree on branch `codex/session-window-tabs`.

- [ ] **Step 2: Initialize and verify baseline**

Run:

```bash
pnpm install
bash ./scripts/test.sh
bash ./scripts/swiftw build
```

Expected: TypeScript tests pass and Swift build succeeds before changes.

---

### Task 1: Protocol Types and Router Failure Semantics

**Files:**
- Modify: `packages/core/src/protocol/SessionMessage.ts`
- Modify: `apps/agent-server/src/SessionRouter.ts`
- Modify: `apps/agent-server/src/SessionRouter.test.ts`

- [ ] **Step 1: Write failing protocol/router tests**

Add tests to `apps/agent-server/src/SessionRouter.test.ts`:

```ts
it("returns session_open_failed when open_session targets missing history", async () => {
  const persistence = new SessionPersistence(
    new InMemorySessionStore(),
    () => "2026-05-20T00:00:00.000Z",
  );
  const router = new SessionRouter(
    { async handleUserMessage() {}, interruptSession() {} },
    persistence,
    () => "2026-05-20T00:01:00.000Z",
  );
  const pushed: SessionMessage[] = [];

  await router.receive(
    {
      type: "open_session",
      sessionId: "missing-session",
      messageId: "open-1",
      timestamp: "2026-05-20T00:01:00.000Z",
      payload: {},
    },
    (message) => pushed.push(message),
  );

  expect(pushed).toEqual([
    {
      type: "session_open_failed",
      sessionId: "missing-session",
      messageId: "open-1",
      timestamp: "2026-05-20T00:01:00.000Z",
      payload: {
        reason: "not_found",
        message: "Session not found: missing-session",
      },
    },
  ]);
  expect(await persistence.getSession("missing-session")).toBeNull();
});

it("rejects user_message for missing session without creating it", async () => {
  const persistence = new SessionPersistence(
    new InMemorySessionStore(),
    () => "2026-05-20T00:00:00.000Z",
  );
  const handled: SessionMessage[] = [];
  const router = new SessionRouter(
    {
      async handleUserMessage(message) {
        handled.push(message);
      },
      interruptSession() {},
    },
    persistence,
    () => "2026-05-20T00:01:00.000Z",
  );
  const pushed: SessionMessage[] = [];

  await router.receive(
    createUserMessage("missing-session", "hello", "user-1"),
    (message) => pushed.push(message),
  );

  expect(handled).toEqual([]);
  expect(pushed).toEqual([
    {
      type: "user_message_failed",
      sessionId: "missing-session",
      messageId: "user-1",
      timestamp: "2026-05-20T00:01:00.000Z",
      payload: {
        reason: "session_not_found",
        message: "Session not found: missing-session",
      },
    },
  ]);
  expect(await persistence.getSession("missing-session")).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
pnpm vitest apps/agent-server/src/SessionRouter.test.ts --run
```

Expected: FAIL because `session_open_failed` and `user_message_failed` are not in `SessionMessage`, and router still silently ignores missing `open_session`.

- [ ] **Step 3: Add protocol union cases**

In `packages/core/src/protocol/SessionMessage.ts`, add these union members after `session_snapshot` and near `user_message`:

```ts
  | {
      type: "session_open_failed";
      sessionId: string;
      messageId: string;
      timestamp: string;
      payload: {
        reason: "not_found" | "unavailable";
        message: string;
      };
    }
  | {
      type: "user_message_failed";
      sessionId: string;
      messageId: string;
      timestamp: string;
      payload: {
        reason: "session_not_found" | "invalid_request";
        message: string;
      };
    }
```

- [ ] **Step 4: Implement router failure responses**

Change `apps/agent-server/src/SessionRouter.ts`:

```ts
  private async handleOpenSession(
    message: Extract<SessionMessage, { type: "open_session" }>,
    push: PushMessage,
  ): Promise<void> {
    const session = await this.persistence.getSession(message.sessionId);
    if (!session) {
      push({
        type: "session_open_failed",
        sessionId: message.sessionId,
        messageId: message.messageId,
        timestamp: this.now(),
        payload: {
          reason: "not_found",
          message: `Session not found: ${message.sessionId}`,
        },
      });
      return;
    }

    const messages = await this.persistence.getConversationMessages(message.sessionId);
    push({
      type: "session_snapshot",
      sessionId: message.sessionId,
      messageId: message.messageId,
      timestamp: this.now(),
      payload: {
        messages,
        status: "idle",
      },
    });
  }
```

Add a private handler and route `user_message` through it:

```ts
      case "user_message":
        return this.handleUserMessage(message, push);
```

```ts
  private async handleUserMessage(
    message: Extract<SessionMessage, { type: "user_message" }>,
    push: PushMessage,
  ): Promise<void> {
    const session = await this.persistence.getSession(message.sessionId);
    if (!session) {
      push({
        type: "user_message_failed",
        sessionId: message.sessionId,
        messageId: message.messageId,
        timestamp: this.now(),
        payload: {
          reason: "session_not_found",
          message: `Session not found: ${message.sessionId}`,
        },
      });
      return;
    }

    return this.orchestrator.handleUserMessage(message, push);
  }
```

- [ ] **Step 5: Run tests**

Run:

```bash
pnpm vitest apps/agent-server/src/SessionRouter.test.ts --run
```

Expected: new tests pass. Existing test named `does not create a session when open_session targets missing history` must be updated to expect `session_open_failed`.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/protocol/SessionMessage.ts apps/agent-server/src/SessionRouter.ts apps/agent-server/src/SessionRouter.test.ts
git commit -m "feat: add explicit session open and user message failures"
```

---

### Task 2: Explicit Session Creation

**Files:**
- Modify: `packages/core/src/protocol/SessionMessage.ts`
- Modify: `apps/agent-server/src/SessionRouter.ts`
- Modify: `apps/agent-server/src/SessionRuntimeOrchestrator.ts`
- Modify: `apps/agent-server/src/SessionRouter.test.ts`

- [ ] **Step 1: Write failing create-session test**

Add to `apps/agent-server/src/SessionRouter.test.ts`:

```ts
it("creates a session explicitly and starts the initial prompt", async () => {
  const persistence = new SessionPersistence(
    new InMemorySessionStore(),
    () => "2026-05-20T00:00:00.000Z",
  );
  const handled: SessionMessage[] = [];
  const router = new SessionRouter(
    {
      async handleUserMessage(message, push) {
        handled.push(message);
        push({
          type: "status",
          sessionId: message.sessionId,
          messageId: `${message.sessionId}-status`,
          timestamp: "2026-05-20T00:01:00.000Z",
          payload: { value: "running" },
        });
      },
      interruptSession() {},
    },
    persistence,
    () => "2026-05-20T00:01:00.000Z",
  );
  const pushed: SessionMessage[] = [];

  await router.receive(
    {
      type: "create_session_request",
      sessionId: "",
      messageId: "create-1",
      timestamp: "2026-05-20T00:01:00.000Z",
      payload: { initialText: "hello" },
    },
    (message) => pushed.push(message),
  );

  expect(pushed[0]?.type).toBe("create_session_response");
  expect(pushed[0]?.messageId).toBe("create-1");
  const createdSessionId = pushed[0]?.sessionId;
  expect(createdSessionId).toMatch(/^session-/);
  expect(await persistence.getSession(createdSessionId!)).not.toBeNull();
  expect(handled).toEqual([
    {
      type: "user_message",
      sessionId: createdSessionId,
      messageId: "create-1-initial-user",
      timestamp: "2026-05-20T00:01:00.000Z",
      payload: { text: "hello", attachments: undefined },
    },
  ]);
  expect(pushed[1]).toEqual({
    type: "status",
    sessionId: createdSessionId,
    messageId: `${createdSessionId}-status`,
    timestamp: "2026-05-20T00:01:00.000Z",
    payload: { value: "running" },
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
pnpm vitest apps/agent-server/src/SessionRouter.test.ts --run
```

Expected: FAIL because `create_session_request` and `create_session_response` are not defined or handled.

- [ ] **Step 3: Add protocol union cases**

In `packages/core/src/protocol/SessionMessage.ts`, add:

```ts
  | {
      type: "create_session_request";
      sessionId: "";
      messageId: string;
      timestamp: string;
      payload: {
        initialText?: string;
        attachments?: UserMessageAttachment[];
      };
    }
  | {
      type: "create_session_response";
      sessionId: string;
      messageId: string;
      timestamp: string;
      payload: {
        title: string | null;
      };
    }
```

- [ ] **Step 4: Implement create handler**

In `apps/agent-server/src/SessionRouter.ts`, route the new case:

```ts
      case "create_session_request":
        return this.handleCreateSession(message, push);
```

Add:

```ts
  private async handleCreateSession(
    message: Extract<SessionMessage, { type: "create_session_request" }>,
    push: PushMessage,
  ): Promise<void> {
    const session = await this.persistence.createSession();
    const sessionId = session.metadata.id;

    push({
      type: "create_session_response",
      sessionId,
      messageId: message.messageId,
      timestamp: this.now(),
      payload: {
        title: session.metadata.title ?? null,
      },
    });

    const initialText = message.payload.initialText?.trim();
    if (!initialText) return;

    await this.orchestrator.handleUserMessage(
      {
        type: "user_message",
        sessionId,
        messageId: `${message.messageId}-initial-user`,
        timestamp: this.now(),
        payload: {
          text: initialText,
          attachments: message.payload.attachments,
        },
      },
      push,
    );
  }
```

- [ ] **Step 5: Remove implicit creation from orchestrator**

In `apps/agent-server/src/SessionRuntimeOrchestrator.ts`, delete this line from `handleUserMessage`:

```ts
    await this.persistence.ensureSession(sessionId);
```

The router now guarantees normal `user_message` targets exist, and `create_session_request` creates before forwarding.

- [ ] **Step 6: Run focused tests**

Run:

```bash
pnpm vitest apps/agent-server/src/SessionRouter.test.ts apps/agent-server/src/SessionRuntimeOrchestrator.test.ts --run
```

Expected: PASS. If an existing test sends `user_message` without creating a session first, update that test to call `await persistence.ensureSession("session-id")` before `router.receive(...)`.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/protocol/SessionMessage.ts apps/agent-server/src/SessionRouter.ts apps/agent-server/src/SessionRuntimeOrchestrator.ts apps/agent-server/src/SessionRouter.test.ts apps/agent-server/src/SessionRuntimeOrchestrator.test.ts
git commit -m "feat: create sessions through explicit protocol"
```

---

### Task 3: Delete Response and Interrupt-Then-Delete

**Files:**
- Modify: `packages/core/src/protocol/SessionMessage.ts`
- Modify: `apps/agent-server/src/SessionRouter.ts`
- Modify: `apps/agent-server/src/SessionRuntimeOrchestrator.ts`
- Modify: `apps/agent-server/src/SessionRouter.test.ts`
- Modify: `apps/agent-server/src/SessionRuntimeOrchestrator.test.ts`

- [ ] **Step 1: Write failing delete-response router test**

Add to `apps/agent-server/src/SessionRouter.test.ts`:

```ts
it("returns delete_session_response after deleting existing session", async () => {
  const persistence = new SessionPersistence(
    new InMemorySessionStore(),
    () => "2026-05-20T00:00:00.000Z",
  );
  const router = new SessionRouter(
    { async handleUserMessage() {}, interruptSession() {}, async interruptAndWait() {} },
    persistence,
    () => "2026-05-20T00:01:00.000Z",
  );
  const pushed: SessionMessage[] = [];

  await persistence.ensureSession("session-delete");
  await router.receive(
    {
      type: "delete_session_request",
      sessionId: "request-session",
      messageId: "delete-1",
      timestamp: "2026-05-20T00:01:00.000Z",
      payload: { targetSessionId: "session-delete" },
    },
    (message) => pushed.push(message),
  );

  expect(await persistence.getSession("session-delete")).toBeNull();
  expect(pushed).toEqual([
    {
      type: "delete_session_response",
      sessionId: "request-session",
      messageId: "delete-1",
      timestamp: "2026-05-20T00:01:00.000Z",
      payload: {
        targetSessionId: "session-delete",
        status: "deleted",
      },
    },
  ]);
});

it("interrupts running session before deleting it", async () => {
  const persistence = new SessionPersistence(
    new InMemorySessionStore(),
    () => "2026-05-20T00:00:00.000Z",
  );
  const calls: string[] = [];
  const router = new SessionRouter(
    {
      async handleUserMessage() {},
      interruptSession() {},
      async interruptAndWait(sessionId: string) {
        calls.push(`interrupt:${sessionId}`);
      },
      isSessionRunning(sessionId: string) {
        return sessionId === "session-running";
      },
    },
    persistence,
    () => "2026-05-20T00:01:00.000Z",
  );
  const pushed: SessionMessage[] = [];

  await persistence.ensureSession("session-running");
  await router.receive(
    {
      type: "delete_session_request",
      sessionId: "request-session",
      messageId: "delete-1",
      timestamp: "2026-05-20T00:01:00.000Z",
      payload: { targetSessionId: "session-running" },
    },
    (message) => pushed.push(message),
  );

  expect(calls).toEqual(["interrupt:session-running"]);
  expect(await persistence.getSession("session-running")).toBeNull();
  expect(pushed[0]?.type).toBe("delete_session_response");
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
pnpm vitest apps/agent-server/src/SessionRouter.test.ts --run
```

Expected: FAIL because `delete_session_response`, `isSessionRunning`, and `interruptAndWait` are not defined.

- [ ] **Step 3: Add protocol type**

In `packages/core/src/protocol/SessionMessage.ts`, add:

```ts
  | {
      type: "delete_session_response";
      sessionId: string;
      messageId: string;
      timestamp: string;
      payload: {
        targetSessionId: string;
        status: "deleted" | "not_found";
      };
    }
```

- [ ] **Step 4: Extend orchestrator interface**

In `apps/agent-server/src/SessionRuntimeOrchestrator.ts`, add:

```ts
  isSessionRunning(sessionId: string): boolean {
    return this.activeRuns.has(sessionId);
  }

  async interruptAndWait(sessionId: string, push: PushMessage = () => {}): Promise<void> {
    const activeRun = this.activeRuns.get(sessionId);
    if (!activeRun) return;

    this.interruptSession(sessionId, push);

    while (this.activeRuns.has(sessionId)) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
```

This polling loop is intentionally simple. The active run is removed in `finally`, so delete waits for the same completion point used by normal runtime cleanup.

- [ ] **Step 5: Update router constructor type**

In `apps/agent-server/src/SessionRouter.ts`, change the orchestrator pick type:

```ts
private readonly orchestrator: Pick<
  SessionRuntimeOrchestrator,
  "handleUserMessage" | "interruptSession" | "interruptAndWait" | "isSessionRunning"
>
```

- [ ] **Step 6: Implement delete handler response**

Replace `handleDeleteSession` in `apps/agent-server/src/SessionRouter.ts`:

```ts
  private async handleDeleteSession(
    message: Extract<SessionMessage, { type: "delete_session_request" }>,
    push: PushMessage,
  ): Promise<void> {
    const targetSessionId = message.payload.targetSessionId;
    const existing = await this.persistence.getSession(targetSessionId);
    if (!existing) {
      push({
        type: "delete_session_response",
        sessionId: message.sessionId,
        messageId: message.messageId,
        timestamp: this.now(),
        payload: {
          targetSessionId,
          status: "not_found",
        },
      });
      return;
    }

    if (this.orchestrator.isSessionRunning?.(targetSessionId)) {
      await this.orchestrator.interruptAndWait?.(targetSessionId, push);
    }

    await this.persistence.deleteSession(targetSessionId);
    push({
      type: "delete_session_response",
      sessionId: message.sessionId,
      messageId: message.messageId,
      timestamp: this.now(),
      payload: {
        targetSessionId,
        status: "deleted",
      },
    });
  }
```

Update `receive`:

```ts
      case "delete_session_request":
        return this.handleDeleteSession(message, push);
```

- [ ] **Step 7: Run tests**

Run:

```bash
pnpm vitest apps/agent-server/src/SessionRouter.test.ts apps/agent-server/src/SessionRuntimeOrchestrator.test.ts --run
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/protocol/SessionMessage.ts apps/agent-server/src/SessionRouter.ts apps/agent-server/src/SessionRuntimeOrchestrator.ts apps/agent-server/src/SessionRouter.test.ts apps/agent-server/src/SessionRuntimeOrchestrator.test.ts
git commit -m "feat: serialize running session deletion"
```

---

### Task 4: Swift Socket Protocol Support

**Files:**
- Modify: `apps/desktop/Sources/SessionWindow/SessionSocketClient.swift`
- Modify: `apps/desktop/TestsSwift/SessionSocketClientTests.swift`

- [ ] **Step 1: Write failing Swift socket tests**

Add to `apps/desktop/TestsSwift/SessionSocketClientTests.swift`:

```swift
func testDecodesSessionOpenFailed() {
    let client = SessionSocketClient.noop
    var received: SessionEvent?
    client.onEvent = { received = $0 }

    client.handleIncomingTextForTesting("""
    {
      "type": "session_open_failed",
      "sessionId": "session-1",
      "messageId": "open-1",
      "timestamp": "2026-05-20T00:00:00.000Z",
      "payload": {
        "reason": "not_found",
        "message": "Session not found: session-1"
      }
    }
    """, currentSessionID: "session-1")

    XCTAssertEqual(
        received,
        .sessionOpenFailed(reason: "not_found", message: "Session not found: session-1")
    )
}

func testSendsCreateSessionRequestWithInitialText() {
    let transport = RecordingSessionSocketTransport()
    let client = SessionSocketClient(
        serverURL: URL(string: "ws://127.0.0.1:4317/api/session")!,
        transport: transport,
        reconnectDelay: 0
    )

    client.connect(sessionID: "")
    client.sendCreateSession(initialText: "hello", attachments: [])

    XCTAssertEqual(transport.tasks[0].sentTypes.suffix(1), ["create_session_request"])
}
```

If `handleIncomingTextForTesting` does not exist, add it in the implementation step below.

- [ ] **Step 2: Run Swift socket tests to verify failure**

Run:

```bash
bash ./scripts/swiftw test --filter SessionSocketClientTests
```

Expected: FAIL because new events and sender do not exist.

- [ ] **Step 3: Extend `SessionEvent`**

In `apps/desktop/Sources/SessionWindow/SessionSocketClient.swift`, add enum cases:

```swift
case sessionOpenFailed(reason: String, message: String)
case createSessionResponse(sessionID: String, title: String?)
case userMessageFailed(reason: String, message: String)
case deleteSessionResponse(targetSessionID: String, status: String)
```

Add matching branches to `static func ==`.

- [ ] **Step 4: Decode new incoming frames**

In `decodeEvent(from:)`, add:

```swift
case "session_open_failed":
    return .sessionOpenFailed(
        reason: envelope.payload.reason ?? "unavailable",
        message: envelope.payload.message ?? "Session open failed."
    )
case "create_session_response":
    return .createSessionResponse(
        sessionID: envelope.sessionId,
        title: envelope.payload.title ?? nil
    )
case "user_message_failed":
    return .userMessageFailed(
        reason: envelope.payload.reason ?? "invalid_request",
        message: envelope.payload.message ?? "User message failed."
    )
case "delete_session_response":
    return .deleteSessionResponse(
        targetSessionID: envelope.payload.targetSessionId ?? "",
        status: envelope.payload.status ?? "not_found"
    )
```

Extend `IncomingPayload` with:

```swift
let reason: String?
let targetSessionId: String?
```

- [ ] **Step 5: Add sender for create**

In `SessionSocketClient`:

```swift
func sendCreateSession(
    initialText: String,
    attachments: [UserMessageAttachmentPayload] = []
) {
    sendJSON([
        "type": "create_session_request",
        "sessionId": "",
        "messageId": UUID().uuidString,
        "timestamp": Self.timestamp(),
        "payload": [
            "initialText": initialText,
            "attachments": attachments.isEmpty ? nil : attachments.map { $0.jsonObject },
        ].compactMapValues { $0 },
    ])
}
```

Add a small extension for JSON attachment mapping:

```swift
private extension UserMessageAttachmentPayload {
    var jsonObject: [String: Any] {
        switch kind {
        case .textSelection:
            return ["kind": kind.rawValue, "id": id, "text": text ?? ""]
        case .image:
            return ["kind": kind.rawValue, "id": id, "mimeType": mimeType ?? "image/png", "base64": base64 ?? ""]
        }
    }
}
```

- [ ] **Step 6: Add test helper for decoding**

In `SessionSocketClient`, add internal testing helper:

```swift
func handleIncomingTextForTesting(_ text: String, currentSessionID: String?) {
    self.currentSessionID = currentSessionID
    if let event = decodeEvent(from: text) {
        onEvent?(event)
    }
}
```

- [ ] **Step 7: Run Swift socket tests**

Run:

```bash
bash ./scripts/swiftw test --filter SessionSocketClientTests
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/Sources/SessionWindow/SessionSocketClient.swift apps/desktop/TestsSwift/SessionSocketClientTests.swift
git commit -m "feat: support explicit session protocol in swift client"
```

---

### Task 5: Extract SessionTabViewModel

**Files:**
- Create: `apps/desktop/Sources/SessionWindow/SessionTabViewModel.swift`
- Create: `apps/desktop/TestsSwift/SessionTabViewModelTests.swift`
- Modify: `apps/desktop/Sources/SessionWindow/SessionViewModel.swift`
- Modify: `apps/desktop/TestsSwift/SessionViewModelTests.swift`

- [ ] **Step 1: Create failing tab tests by moving core session tests**

Create `apps/desktop/TestsSwift/SessionTabViewModelTests.swift`:

```swift
import XCTest
@testable import HandAgentDesktop

final class SessionTabViewModelTests: XCTestCase {
    @MainActor
    func testSnapshotFillsMessages() {
        let tab = SessionTabViewModel(
            tabID: "tab-1",
            sessionID: "session-1",
            socketClient: .noop
        )

        tab.handle(.sessionSnapshot(
            messages: [SessionBubble(id: "m1", role: "user", text: "hello")],
            status: "idle"
        ))

        XCTAssertEqual(tab.messages.map(\.text), ["hello"])
        XCTAssertEqual(tab.status, "idle")
    }

    @MainActor
    func testBackgroundTabKeepsRunningState() {
        let tab = SessionTabViewModel(
            tabID: "tab-1",
            sessionID: "session-1",
            socketClient: .noop
        )

        tab.handle(.assistantMessageStart(
            messageID: "a1",
            timestamp: "2026-05-20T00:00:00.000Z"
        ))
        tab.handle(.assistantMessageDelta(
            messageID: "a1",
            text: "hello",
            timestamp: "2026-05-20T00:00:00.100Z"
        ))

        XCTAssertEqual(tab.status, "running")
        XCTAssertEqual(tab.messages.last?.text, "hello")
    }

    @MainActor
    func testOpenFailedMarksTabInvalid() {
        let tab = SessionTabViewModel(
            tabID: "tab-1",
            sessionID: "session-1",
            socketClient: .noop
        )

        tab.handle(.sessionOpenFailed(reason: "not_found", message: "Session not found: session-1"))

        XCTAssertTrue(tab.isInvalid)
        XCTAssertEqual(tab.invalidReason, "Session not found: session-1")
    }
}
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
bash ./scripts/swiftw test --filter SessionTabViewModelTests
```

Expected: FAIL because `SessionTabViewModel` does not exist.

- [ ] **Step 3: Implement `SessionTabViewModel` by extracting current per-session state**

Create `apps/desktop/Sources/SessionWindow/SessionTabViewModel.swift`:

```swift
import Foundation

@Observable
@MainActor
final class SessionTabViewModel: Identifiable {
    let id: String
    let tabID: String
    let sessionID: String
    @ObservationIgnored let socketClient: SessionSocketClient
    @ObservationIgnored private let onStateChanged: @MainActor (SessionTabViewModel) -> Void

    private(set) var messages: [SessionBubble] = []
    private(set) var status: String = "idle"
    private(set) var error: String?
    private(set) var pendingPermissionRequests: [SessionPermissionRequest] = []
    private(set) var pendingWorkspaceAskRequests: [SessionWorkspaceAskRequest] = []
    private(set) var connectionState: SessionConnectionState = .disconnected
    private(set) var connectionMessage: String?
    private(set) var isInvalid = false
    private(set) var invalidReason: String?

    var canSendPrompt: Bool { connectionState == .connected && !isInvalid }
    var visibleWorkspaceAskRequest: SessionWorkspaceAskRequest? { pendingWorkspaceAskRequests.first }

    init(
        tabID: String,
        sessionID: String,
        socketClient: SessionSocketClient,
        onStateChanged: @escaping @MainActor (SessionTabViewModel) -> Void = { _ in }
    ) {
        self.id = tabID
        self.tabID = tabID
        self.sessionID = sessionID
        self.socketClient = socketClient
        self.onStateChanged = onStateChanged
    }

    func open() {
        socketClient.onEvent = { [weak self] event in
            Task { @MainActor in self?.handle(event) }
        }
        socketClient.connect(sessionID: sessionID)
    }

    func disconnect() {
        socketClient.disconnect()
    }

    func sendPrompt(_ text: String, attachments: [UserMessageAttachmentPayload] = []) {
        let trimmedText = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedText.isEmpty, !isInvalid else { return }
        let messageID = UUID().uuidString
        let timestamp = Self.timestamp()
        appendUserMessage(messageID: messageID, text: trimmedText, attachments: attachments)
        onStateChanged(self)
        socketClient.sendUserMessage(
            sessionID: sessionID,
            messageID: messageID,
            text: trimmedText,
            timestamp: timestamp,
            attachments: attachments
        )
    }

    func stop() {
        guard status == "running" else { return }
        status = "interrupted"
        socketClient.sendInterrupt(sessionID: sessionID)
        onStateChanged(self)
    }

    func resolvePermission(requestId: String, decision: String, scope: String?) {
        socketClient.sendPermissionResponse(
            sessionID: sessionID,
            requestId: requestId,
            decision: decision,
            scope: scope
        )
        pendingPermissionRequests.removeAll { $0.id == requestId }
    }

    func resolveWorkspaceAsk(requestId: String, workspaceId: String?) {
        socketClient.sendWorkspaceAskResponse(
            sessionID: sessionID,
            requestId: requestId,
            workspaceId: workspaceId,
            cancelled: workspaceId == nil
        )
        pendingWorkspaceAskRequests.removeAll { $0.id == requestId }
    }

    func handle(_ event: SessionEvent) {
        var shouldNotifyStateChanged = false
        switch event {
        case .userMessage(let messageID, let text, _):
            appendUserMessage(messageID: messageID, text: text, attachments: [])
            shouldNotifyStateChanged = true
        case .assistantMessageStart(let messageID, _):
            status = "running"
            error = nil
            messages.append(SessionBubble(id: messageID, role: "assistant", text: ""))
            shouldNotifyStateChanged = true
        case .assistantMessageDelta(let messageID, let text, _):
            guard let index = messages.firstIndex(where: { $0.id == messageID }) else { return }
            messages[index].text += text
            shouldNotifyStateChanged = true
        case .assistantMessageEnd(_, let status, _):
            self.status = status == "completed" ? "idle" : status
            shouldNotifyStateChanged = true
        case .toolMessage(let messageID, let name, let text, _, _):
            let displayText = "\(name): \(text)"
            if let index = messages.firstIndex(where: { $0.id == messageID && $0.role == "tool" }) {
                messages[index].text = displayText
            } else {
                messages.append(SessionBubble(id: messageID, role: "tool", text: displayText))
            }
            shouldNotifyStateChanged = true
        case .status(let value):
            status = value
            if value != "failed" { error = nil }
            shouldNotifyStateChanged = true
        case .error(let messageID, let message, _):
            status = "failed"
            error = message
            if messages.last?.role != "assistant" || messages.last?.text != message {
                messages.append(SessionBubble(id: messageID, role: "assistant", text: message))
            }
            shouldNotifyStateChanged = true
        case .sessionSnapshot(let messages, let status):
            self.messages = messages.map { $0.normalizedForDisplay() }
            self.status = status
            error = nil
            shouldNotifyStateChanged = true
        case .permissionRequest(let requestId, let toolName, let argumentsJSON):
            pendingPermissionRequests.append(
                SessionPermissionRequest(id: requestId, toolName: toolName, argumentsJSON: argumentsJSON)
            )
        case .workspaceAskRequest(let requestId, let prompt, let candidates):
            pendingWorkspaceAskRequests.append(
                SessionWorkspaceAskRequest(id: requestId, prompt: prompt, candidates: candidates)
            )
        case .connectionState(let state):
            connectionState = state
            switch state {
            case .connected: connectionMessage = nil
            case .connecting: connectionMessage = "正在连接 agent-server…"
            case .reconnecting: connectionMessage = "连接已断开，正在自动重连…"
            case .disconnected: connectionMessage = "连接已断开。"
            }
        case .sessionOpenFailed(_, let message), .userMessageFailed(_, let message):
            isInvalid = true
            invalidReason = message
            status = "failed"
            shouldNotifyStateChanged = true
        case .createSessionResponse, .deleteSessionResponse, .sessionList, .sessionLoaded:
            break
        }

        if shouldNotifyStateChanged { onStateChanged(self) }
    }

    private func appendUserMessage(
        messageID: String,
        text: String,
        attachments: [UserMessageAttachmentPayload]
    ) {
        status = "running"
        error = nil
        messages.append(SessionBubble.user(id: messageID, text: text, attachments: attachments))
    }

    private static func timestamp() -> String {
        ISO8601DateFormatter().string(from: Date())
    }
}
```

- [ ] **Step 4: Keep old tests passing through temporary compatibility**

Keep `SessionViewModel` in place for this task. Do not remove old files until `SessionWindowViewModel` is ready.

- [ ] **Step 5: Run Swift tab tests**

Run:

```bash
bash ./scripts/swiftw test --filter SessionTabViewModelTests
```

Expected: PASS.

- [ ] **Step 6: Run existing session tests**

Run:

```bash
bash ./scripts/swiftw test --filter SessionViewModelTests
```

Expected: PASS. This task should not regress current window behavior.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/Sources/SessionWindow/SessionTabViewModel.swift apps/desktop/TestsSwift/SessionTabViewModelTests.swift apps/desktop/Sources/SessionWindow/SessionViewModel.swift apps/desktop/TestsSwift/SessionViewModelTests.swift
git commit -m "feat: extract session tab view model"
```

---

### Task 6: Add SessionWindowViewModel Container

**Files:**
- Create: `apps/desktop/Sources/SessionWindow/SessionWindowViewModel.swift`
- Create: `apps/desktop/TestsSwift/SessionWindowViewModelTests.swift`
- Modify: `apps/desktop/Sources/SessionWindow/SessionSocketClient.swift`

- [ ] **Step 1: Write failing window-container tests**

Create `apps/desktop/TestsSwift/SessionWindowViewModelTests.swift`:

```swift
import XCTest
@testable import HandAgentDesktop

final class SessionWindowViewModelTests: XCTestCase {
    @MainActor
    func testOpenHistorySessionCreatesAndActivatesTab() {
        let model = SessionWindowViewModel(socketFactory: { _ in .noop })

        model.openHistorySession("session-1")

        XCTAssertEqual(model.tabs.map(\.sessionID), ["session-1"])
        XCTAssertEqual(model.activeTab?.sessionID, "session-1")
    }

    @MainActor
    func testOpenHistorySessionReusesExistingTab() {
        let model = SessionWindowViewModel(socketFactory: { _ in .noop })

        model.openHistorySession("session-1")
        model.openHistorySession("session-1")

        XCTAssertEqual(model.tabs.count, 1)
        XCTAssertEqual(model.activeTab?.sessionID, "session-1")
    }

    @MainActor
    func testHistoryActionDoesNotChangeActiveTab() {
        let model = SessionWindowViewModel(socketFactory: { _ in .noop })
        model.openHistorySession("session-1")
        model.openHistorySession("session-2")

        model.openOrFocusHistory()

        XCTAssertEqual(model.activeTab?.sessionID, "session-2")
    }

    @MainActor
    func testInvalidActiveTabClosesToEmptyState() {
        let model = SessionWindowViewModel(socketFactory: { _ in .noop })
        model.openHistorySession("session-1")

        model.activeTab?.handle(.sessionOpenFailed(reason: "not_found", message: "missing"))
        model.pruneInvalidTabs()

        XCTAssertTrue(model.tabs.isEmpty)
        XCTAssertNil(model.activeTab)
        XCTAssertEqual(model.noticeMessage, "missing")
    }
}
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
bash ./scripts/swiftw test --filter SessionWindowViewModelTests
```

Expected: FAIL because `SessionWindowViewModel` does not exist.

- [ ] **Step 3: Implement container model**

Create `apps/desktop/Sources/SessionWindow/SessionWindowViewModel.swift`:

```swift
import Foundation

@Observable
@MainActor
final class SessionWindowViewModel {
    typealias SocketFactory = (String) -> SessionSocketClient

    private(set) var tabs: [SessionTabViewModel] = []
    private(set) var activeTabID: String?
    private(set) var historyList: [SessionListItem] = []
    private(set) var pendingHistoryDeletionID: String?
    private(set) var noticeMessage: String?

    @ObservationIgnored private let socketFactory: SocketFactory
    @ObservationIgnored private let historySocketClient: SessionSocketClient

    var activeTab: SessionTabViewModel? {
        guard let activeTabID else { return nil }
        return tabs.first { $0.tabID == activeTabID }
    }

    init(
        socketFactory: @escaping SocketFactory,
        historySocketClient: SessionSocketClient = .noop
    ) {
        self.socketFactory = socketFactory
        self.historySocketClient = historySocketClient
        self.historySocketClient.onEvent = { [weak self] event in
            Task { @MainActor in self?.handleWindowEvent(event) }
        }
    }

    func openOrFocusHistory() {
        refreshHistory()
    }

    func openHistorySession(_ sessionID: String) {
        if let existing = tabs.first(where: { $0.sessionID == sessionID }) {
            activeTabID = existing.tabID
            return
        }

        let tab = makeTab(sessionID: sessionID)
        tabs.append(tab)
        activeTabID = tab.tabID
        tab.open()
    }

    func closeTab(_ tabID: String) {
        guard let index = tabs.firstIndex(where: { $0.tabID == tabID }) else { return }
        tabs[index].disconnect()
        tabs.remove(at: index)
        if activeTabID == tabID {
            activeTabID = tabs.last?.tabID
        }
    }

    func sendPrompt(_ text: String, attachments: [UserMessageAttachmentPayload] = []) {
        if let activeTab {
            activeTab.sendPrompt(text, attachments: attachments)
            return
        }

        historySocketClient.sendCreateSession(initialText: text, attachments: attachments)
    }

    func stopActiveTab() {
        activeTab?.stop()
    }

    func refreshHistory() {
        historySocketClient.sendListSessions(sessionID: "")
    }

    func requestDeleteSession(_ sessionID: String) {
        pendingHistoryDeletionID = sessionID
    }

    func cancelDeleteSession() {
        pendingHistoryDeletionID = nil
    }

    func confirmDeleteSession() {
        guard let target = pendingHistoryDeletionID else { return }
        pendingHistoryDeletionID = nil
        historySocketClient.sendDeleteSession(sessionID: "", targetSessionId: target)
    }

    func pruneInvalidTabs() {
        let invalidTabs = tabs.filter(\.isInvalid)
        guard !invalidTabs.isEmpty else { return }
        if let invalidActive = activeTab, invalidActive.isInvalid {
            noticeMessage = invalidActive.invalidReason
        }
        tabs.removeAll { $0.isInvalid }
        if let activeTabID, !tabs.contains(where: { $0.tabID == activeTabID }) {
            self.activeTabID = tabs.last?.tabID
        }
    }

    func handleWindowEvent(_ event: SessionEvent) {
        switch event {
        case .sessionList(let sessions):
            historyList = sessions
        case .createSessionResponse(let sessionID, _):
            let tab = makeTab(sessionID: sessionID)
            tabs.append(tab)
            activeTabID = tab.tabID
            tab.open()
        case .deleteSessionResponse:
            refreshHistory()
        default:
            break
        }
    }

    private func makeTab(sessionID: String) -> SessionTabViewModel {
        SessionTabViewModel(
            tabID: UUID().uuidString,
            sessionID: sessionID,
            socketClient: socketFactory(sessionID),
            onStateChanged: { [weak self] _ in
                self?.pruneInvalidTabs()
            }
        )
    }
}
```

- [ ] **Step 4: Run window model tests**

Run:

```bash
bash ./scripts/swiftw test --filter SessionWindowViewModelTests
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/Sources/SessionWindow/SessionWindowViewModel.swift apps/desktop/TestsSwift/SessionWindowViewModelTests.swift apps/desktop/Sources/SessionWindow/SessionSocketClient.swift
git commit -m "feat: add session window tab container model"
```

---

### Task 7: Single SessionWindow Lifecycle and Coordinator Entrypoints

**Files:**
- Create: `apps/desktop/Sources/Coordinator/SessionWindowLifecycle.swift`
- Modify: `apps/desktop/Sources/Coordinator/SessionLifecycle.swift`
- Modify: `apps/desktop/Sources/Coordinator/AppCoordinator.swift`
- Modify: `apps/desktop/Sources/AppServices/AppServices.swift`
- Modify: `apps/desktop/Sources/AppServices/AppServicesProductionImpls.swift`
- Modify: `apps/desktop/TestsSwift/AppCoordinatorTests.swift`
- Modify: `apps/desktop/TestsSwift/SessionLifecycleTests.swift`

- [ ] **Step 1: Write failing coordinator tests**

Update `apps/desktop/TestsSwift/AppCoordinatorTests.swift`:

```swift
@MainActor
func testHistoryActionOpensSingleSessionWindowWithoutChangingActiveTab() {
    let coordinator = AppCoordinator(services: AppServices.testing())

    coordinator.send(.submitPrompt("first", attachments: []))
    let firstActive = coordinator.sessionWindowViewModel?.activeTabID

    coordinator.send(.openHistory)

    XCTAssertNotNil(firstActive)
    XCTAssertEqual(coordinator.sessionWindowViewModel?.activeTabID, firstActive)
}

@MainActor
func testMultiplePromptsReuseSingleWindowAndCreateTabs() {
    let coordinator = AppCoordinator(services: AppServices.testing())

    coordinator.send(.submitPrompt("first", attachments: []))
    coordinator.send(.submitPrompt("second", attachments: []))

    XCTAssertEqual(coordinator.sessionWindowViewModel?.tabs.count, 2)
}
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
bash ./scripts/swiftw test --filter AppCoordinatorTests
```

Expected: FAIL because coordinator still exposes `sessionViewModels` keyed by session and creates one window per session.

- [ ] **Step 3: Update presenter protocol**

In `apps/desktop/Sources/AppServices/AppServices.swift`, change:

```swift
protocol SessionWindowPresenting {
    @MainActor
    func present(
        viewModel: SessionWindowViewModel,
        onClose: @escaping () -> Void
    ) -> NSWindow?
}
```

Update `NopSessionWindowPresenter` to store/present the new view model:

```swift
final class NopSessionWindowPresenter: SessionWindowPresenting {
    private(set) var presentedViewModel: SessionWindowViewModel?

    func present(
        viewModel: SessionWindowViewModel,
        onClose: @escaping () -> Void
    ) -> NSWindow? {
        presentedViewModel = viewModel
        return NSWindow()
    }
}
```

- [ ] **Step 4: Update production presenter**

In `apps/desktop/Sources/AppServices/AppServicesProductionImpls.swift`:

```swift
final class ProductionSessionWindowPresenter: SessionWindowPresenting {
    @MainActor
    func present(
        viewModel: SessionWindowViewModel,
        onClose: @escaping () -> Void
    ) -> NSWindow? {
        let hosting = NSHostingController(rootView: SessionWindowView(viewModel: viewModel))
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 920, height: 640),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.title = "HandAgent"
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.contentViewController = hosting
        window.center()
        WindowCloseObservation.observe(window: window, onClose: onClose)
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        return window
    }
}
```

Preserve the existing `WindowCloseObservation` ownership pattern used in the current file rather than dropping observer retention.

- [ ] **Step 5: Create lifecycle**

Create `apps/desktop/Sources/Coordinator/SessionWindowLifecycle.swift`:

```swift
import AppKit
import Foundation

@Observable
@MainActor
final class SessionWindowLifecycle {
    private(set) var viewModel: SessionWindowViewModel?

    @ObservationIgnored private let windowPresenter: any SessionWindowPresenting
    @ObservationIgnored private let agentServerURL: URL
    @ObservationIgnored private let activationPolicy: AppActivationPolicyCoordinator
    @ObservationIgnored private let setActivationPolicy: @MainActor (NSApplication.ActivationPolicy) -> Void
    @ObservationIgnored private var window: NSWindow?

    init(
        windowPresenter: any SessionWindowPresenting,
        agentServerURL: URL,
        activationPolicy: AppActivationPolicyCoordinator,
        setActivationPolicy: @escaping @MainActor (NSApplication.ActivationPolicy) -> Void
    ) {
        self.windowPresenter = windowPresenter
        self.agentServerURL = agentServerURL
        self.activationPolicy = activationPolicy
        self.setActivationPolicy = setActivationPolicy
        setActivationPolicy(activationPolicy.policyAfterUpdatingOpenSessionWindows(by: 0))
    }

    func openOrFocusHistory(onClosed: @escaping @MainActor () -> Void) {
        let model = ensureWindow(onClosed: onClosed)
        model.openOrFocusHistory()
    }

    func createTabWithInitialPrompt(
        _ prompt: PromptSubmission,
        onClosed: @escaping @MainActor () -> Void
    ) {
        let model = ensureWindow(onClosed: onClosed)
        model.sendPrompt(prompt.composed, attachments: prompt.socketAttachments)
    }

    func close() {
        viewModel?.tabs.forEach { $0.disconnect() }
        viewModel = nil
        if window != nil {
            window = nil
            setActivationPolicy(activationPolicy.policyAfterUpdatingOpenSessionWindows(by: -1))
        }
    }

    private func ensureWindow(onClosed: @escaping @MainActor () -> Void) -> SessionWindowViewModel {
        if let window, let viewModel {
            window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return viewModel
        }

        let model = SessionWindowViewModel(
            socketFactory: { [agentServerURL] _ in SessionSocketClient(serverURL: agentServerURL) },
            historySocketClient: SessionSocketClient(serverURL: agentServerURL)
        )
        viewModel = model
        window = windowPresenter.present(viewModel: model) {
            Task { @MainActor in onClosed() }
        }
        if window != nil {
            setActivationPolicy(activationPolicy.policyAfterUpdatingOpenSessionWindows(by: 1))
        }
        return model
    }
}
```

- [ ] **Step 6: Update coordinator actions**

In `AppCoordinator.Action`, remove `restoreSession(String)` and `historyWindowClosed`; keep `openHistory`.

Expose for tests:

```swift
var sessionWindowViewModel: SessionWindowViewModel? { sessionWindowLifecycle.viewModel }
```

Change `handleSubmitPrompt`:

```swift
sessionWindowLifecycle.createTabWithInitialPrompt(prompt) { [weak self] in
    self?.sessionWindowLifecycle.close()
}
```

Change `handleOpenHistory`:

```swift
sessionWindowLifecycle.openOrFocusHistory { [weak self] in
    self?.sessionWindowLifecycle.close()
}
```

Remove `handleRestoreSession`.

- [ ] **Step 7: Remove PromptPanel recent-session actions**

In `buildPromptActions()`, return only:

```swift
private func buildPromptActions() -> [PromptAction] {
    basePromptActions
}
```

- [ ] **Step 8: Run coordinator tests**

Run:

```bash
bash ./scripts/swiftw test --filter AppCoordinatorTests
```

Expected: PASS after updating old tests from `sessionViewModels` to `sessionWindowViewModel`.

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/Sources/Coordinator/SessionWindowLifecycle.swift apps/desktop/Sources/Coordinator/SessionLifecycle.swift apps/desktop/Sources/Coordinator/AppCoordinator.swift apps/desktop/Sources/AppServices/AppServices.swift apps/desktop/Sources/AppServices/AppServicesProductionImpls.swift apps/desktop/TestsSwift/AppCoordinatorTests.swift apps/desktop/TestsSwift/SessionLifecycleTests.swift
git commit -m "feat: route sessions through single window lifecycle"
```

---

### Task 8: SessionWindow UI for History, Tabs, and Empty State

**Files:**
- Modify: `apps/desktop/Sources/SessionWindow/SessionWindowView.swift`
- Modify: `apps/desktop/Sources/SessionWindow/SessionStyles.swift`
- Modify: `apps/desktop/TestsSwift/SessionWindowViewModelTests.swift`

- [ ] **Step 1: Add view-model tests for visible active state**

Add to `SessionWindowViewModelTests`:

```swift
@MainActor
func testActiveTabExposesInputTarget() {
    let model = SessionWindowViewModel(socketFactory: { _ in .noop })

    XCTAssertNil(model.activeTab)
    model.openHistorySession("session-1")

    XCTAssertEqual(model.activeTab?.sessionID, "session-1")
}
```

- [ ] **Step 2: Run model tests**

Run:

```bash
bash ./scripts/swiftw test --filter SessionWindowViewModelTests
```

Expected: PASS before UI changes; this protects the binding surface.

- [ ] **Step 3: Change `SessionWindowView` binding**

Change the top of `apps/desktop/Sources/SessionWindow/SessionWindowView.swift`:

```swift
struct SessionWindowView: View {
    @Bindable var viewModel: SessionWindowViewModel
    @Environment(\.appTheme) private var theme
    @State private var draft = ""
```

Remove `sidebarVisible`; the history sidebar is always visible.

- [ ] **Step 4: Render history sidebar from window model**

Replace `historyRow(_:)` with:

```swift
private func historyRow(_ item: SessionListItem) -> some View {
    let isOpen = viewModel.tabs.contains { $0.sessionID == item.id }
    let isActive = viewModel.activeTab?.sessionID == item.id
    let running = viewModel.tabs.first { $0.sessionID == item.id }?.status == "running"

    return Button {
        viewModel.openHistorySession(item.id)
    } label: {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: theme.spacing.sm) {
                if running {
                    Circle()
                        .fill(theme.colors.accent)
                        .frame(width: 6, height: 6)
                }
                Text(item.title ?? "未命名会话")
                    .font(theme.typography.bodyFont)
                    .foregroundStyle(isActive ? theme.colors.accent : theme.colors.textPrimary)
                    .lineLimit(1)
                Spacer()
                if isOpen {
                    Image(systemName: "rectangle.on.rectangle")
                        .font(.system(size: 10))
                        .foregroundStyle(theme.colors.textSecondary)
                }
            }
            Text("\(item.messageCount) 条")
                .font(theme.typography.captionFont)
                .foregroundStyle(theme.colors.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, theme.spacing.md)
        .padding(.vertical, theme.spacing.sm)
        .background(isActive ? theme.colors.accentSubtle : Color.clear)
    }
    .buttonStyle(.plain)
}
```

- [ ] **Step 5: Add tab bar**

Add:

```swift
private var tabBar: some View {
    ScrollView(.horizontal, showsIndicators: false) {
        HStack(spacing: theme.spacing.xs) {
            ForEach(viewModel.tabs) { tab in
                Button {
                    viewModel.activeTabID = tab.tabID
                } label: {
                    HStack(spacing: theme.spacing.xs) {
                        if tab.status == "running" {
                            Circle().fill(theme.colors.accent).frame(width: 6, height: 6)
                        }
                        Text(tab.messages.first?.text ?? tab.sessionID)
                            .lineLimit(1)
                        Image(systemName: "xmark")
                            .font(.system(size: 10))
                    }
                    .font(theme.typography.captionFont)
                    .padding(.horizontal, theme.spacing.sm)
                    .padding(.vertical, theme.spacing.xs)
                    .background(tab.tabID == viewModel.activeTabID ? theme.colors.accentSubtle : theme.colors.surface.opacity(0.45))
                }
                .buttonStyle(.plain)
                .contextMenu {
                    Button("关闭") { viewModel.closeTab(tab.tabID) }
                }
            }
        }
        .padding(.horizontal, theme.spacing.md)
        .padding(.vertical, theme.spacing.xs)
    }
}
```

If `activeTabID` is private(set), add a method `activateTab(_:)` to `SessionWindowViewModel` and call that instead of direct assignment.

- [ ] **Step 6: Bind message list and controls to active tab**

Use:

```swift
private var activeTab: SessionTabViewModel? { viewModel.activeTab }
```

Replace direct `viewModel.messages`, `viewModel.status`, `viewModel.error`, `viewModel.pendingPermissionRequests`, `viewModel.visibleWorkspaceAskRequest`, `viewModel.stop()` with `activeTab` equivalents. When `activeTab == nil`, show:

```swift
private var emptyState: some View {
    VStack(spacing: theme.spacing.sm) {
        Text("选择左侧会话继续")
            .font(theme.typography.titleFont)
            .foregroundStyle(theme.colors.textPrimary)
        Text("也可以直接发送消息创建新会话。")
            .font(theme.typography.bodyFont)
            .foregroundStyle(theme.colors.textSecondary)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
}
```

- [ ] **Step 7: Update input send**

The submit action should call:

```swift
let text = draft
draft = ""
viewModel.sendPrompt(text)
```

`SessionWindowViewModel.sendPrompt` routes to active tab or creates a new session.

- [ ] **Step 8: Build Swift UI**

Run:

```bash
bash ./scripts/swiftw build
```

Expected: build succeeds.

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/Sources/SessionWindow/SessionWindowView.swift apps/desktop/Sources/SessionWindow/SessionStyles.swift apps/desktop/TestsSwift/SessionWindowViewModelTests.swift
git commit -m "feat: render session tabs in single window"
```

---

### Task 9: Remove Independent HistoryWindow

**Files:**
- Delete: `apps/desktop/Sources/SessionWindow/SessionHistoryWindowView.swift`
- Delete: `apps/desktop/Sources/SessionWindow/SessionHistoryViewModel.swift`
- Delete: `apps/desktop/Sources/Coordinator/HistoryLifecycle.swift`
- Delete: `apps/desktop/TestsSwift/SessionHistoryViewModelTests.swift`
- Modify: `apps/desktop/Sources/AppServices/AppServices.swift`
- Modify: `apps/desktop/Sources/AppServices/AppServicesProductionImpls.swift`
- Modify: `apps/desktop/Sources/Coordinator/AppCoordinator.swift`
- Modify: `apps/desktop/desktop.md`
- Modify: `apps/desktop/Sources/SessionWindow/session-window.md`

- [ ] **Step 1: Search remaining HistoryWindow references**

Run:

```bash
rg -n "HistoryWindow|SessionHistoryWindow|SessionHistoryViewModel|HistoryLifecycle|historyWindowPresenter|openHistory" apps/desktop
```

Expected: references still exist before removal.

- [ ] **Step 2: Delete independent history files**

Run:

```bash
git rm apps/desktop/Sources/SessionWindow/SessionHistoryWindowView.swift
git rm apps/desktop/Sources/SessionWindow/SessionHistoryViewModel.swift
git rm apps/desktop/Sources/Coordinator/HistoryLifecycle.swift
git rm apps/desktop/TestsSwift/SessionHistoryViewModelTests.swift
```

- [ ] **Step 3: Remove AppServices history presenter protocol and fields**

In `AppServices.swift`, remove:

- The complete `HistoryWindowPresenting` protocol declaration.
- The `historyWindowPresenter` stored property on `AppServices`.
- The `historyWindowPresenter` initializer parameter and assignment.
- The `historyWindowPresenter` argument in `AppServices.testing(...)`.
- The complete `NopHistoryWindowPresenter` test implementation.

Remove the constructor parameter and testing default for `historyWindowPresenter`.

- [ ] **Step 4: Remove production history presenter**

In `AppServicesProductionImpls.swift`, remove `ProductionHistoryWindowPresenter`.

- [ ] **Step 5: Remove coordinator history lifecycle state**

In `AppCoordinator.swift`, remove fields:

- `@ObservationIgnored private let historyLifecycle: HistoryLifecycle`
- The full lazy `historyViewModel: SessionHistoryViewModel` property, including its `onRestore` callback.

Keep the action `openHistory`, but it now calls `sessionWindowLifecycle.openOrFocusHistory`.

- [ ] **Step 6: Run reference search**

Run:

```bash
rg -n "HistoryWindow|SessionHistoryWindow|SessionHistoryViewModel|HistoryLifecycle|historyWindowPresenter" apps/desktop
```

Expected: no matches.

- [ ] **Step 7: Run Swift tests/build**

Run:

```bash
bash ./scripts/swiftw test
bash ./scripts/swiftw build
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/Sources apps/desktop/TestsSwift apps/desktop/desktop.md apps/desktop/Sources/SessionWindow/session-window.md
git commit -m "refactor: remove independent session history window"
```

---

### Task 10: Registry, Status Bubble, and Docs

**Files:**
- Modify: `apps/desktop/Sources/AppServices/Session/SessionRegistry.swift`
- Modify: `apps/desktop/Sources/StatusBubble/status-bubble.md`
- Modify: `apps/desktop/Sources/Coordinator/coordinator.md`
- Modify: `apps/desktop/Sources/SessionWindow/session-window.md`
- Modify: `apps/desktop/desktop.md`
- Modify: `handAgent.md`
- Modify: `docs/manual-qa.md`

- [ ] **Step 1: Update registry tests**

In `apps/desktop/TestsSwift/SessionRegistryTests.swift`, add:

```swift
@MainActor
func testPrimarySessionPrefersRunningOpenTab() {
    let registry = SessionRegistry()

    registry.upsert(SessionSummary(
        sessionId: "idle-session",
        isRunning: false,
        latestSummary: "idle",
        lastActiveAt: Date(timeIntervalSince1970: 1),
        windowIsOpen: true
    ))
    registry.upsert(SessionSummary(
        sessionId: "running-session",
        isRunning: true,
        latestSummary: "running",
        lastActiveAt: Date(timeIntervalSince1970: 2),
        windowIsOpen: true
    ))

    XCTAssertEqual(registry.primarySessionID, "running-session")
}
```

- [ ] **Step 2: Run registry tests**

Run:

```bash
bash ./scripts/swiftw test --filter SessionRegistryTests
```

Expected: PASS or fail only where old window assumptions need updates.

- [ ] **Step 3: Sync registry from `SessionWindowViewModel`**

In `SessionWindowLifecycle`, add a callback from tab state changes to registry upsert. The callback should write one `SessionSummary` per tab:

```swift
registry.upsert(SessionSummary(
    sessionId: tab.sessionID,
    isRunning: tab.status == "running",
    latestSummary: tab.messages.reversed().map(\.text).first { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty } ?? "",
    lastActiveAt: .now,
    windowIsOpen: true
))
```

When a tab closes, upsert the same session with `windowIsOpen: false` unless another tab for the same session remains open.

- [ ] **Step 4: Update docs**

Update `handAgent.md`:

```md
- 当前桌面端使用全局唯一 SessionWindow。SessionWindow 左侧展示持久化会话历史；点击历史项会在当前窗口创建或激活 tab。Window 拥有 tabs，tab 拥有 `sessionId`、socket、消息、运行态、权限请求和 workspace 选择等完整会话生命周期。
```

Update `apps/desktop/Sources/SessionWindow/session-window.md` so the first paragraph states:

```md
会话窗口是全局唯一的会话工作区：左侧是历史对话列表，右侧是 tab 化会话区域。Window 管理历史、tabs 和 active tab；每个 tab 管理自己的 session socket、消息流、权限气泡和 workspace 选择。
```

Update `docs/manual-qa.md` with these checklist items:

```md
## 单窗口多 Tab 会话历史

1. 从 PromptPanel 提交一条 prompt，确认只打开一个 SessionWindow，并创建一个 active tab。
2. 再次从 PromptPanel 提交 prompt，确认复用同一个 SessionWindow，并新增第二个 tab。
3. 从 PromptPanel 执行“会话历史”，确认只聚焦 SessionWindow，不改变 active tab、running 状态或草稿。
4. 点击左侧历史项，确认已有 tab 会被激活，未打开历史会话会创建新 tab。
5. 在一个 tab running 时切换到另一个 tab，确认后台 tab 继续输出且状态标记可见。
6. 删除 running session，确认 server 先 interrupt 再删除，历史列表刷新。
```

- [ ] **Step 5: Run full verification**

Run:

```bash
bash ./scripts/test.sh
bash ./scripts/swiftw test
bash ./scripts/swiftw build
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/Sources/AppServices/Session/SessionRegistry.swift apps/desktop/TestsSwift/SessionRegistryTests.swift apps/desktop/Sources/StatusBubble/status-bubble.md apps/desktop/Sources/Coordinator/coordinator.md apps/desktop/Sources/SessionWindow/session-window.md apps/desktop/desktop.md handAgent.md docs/manual-qa.md
git commit -m "docs: update single window tab architecture"
```

---

## Final Verification

- [ ] **Step 1: Run required checks**

Run:

```bash
bash ./scripts/test.sh
bash ./scripts/swiftw test
bash ./scripts/swiftw build
```

Expected: all commands pass.

- [ ] **Step 2: Inspect git status**

Run:

```bash
git status --short
```

Expected: clean working tree.

- [ ] **Step 3: Summarize commits**

Run:

```bash
git log --oneline --decorate -n 12
```

Expected: task commits are present on `codex/session-window-tabs`.

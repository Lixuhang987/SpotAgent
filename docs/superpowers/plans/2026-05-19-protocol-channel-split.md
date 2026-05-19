# Protocol Channel Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split platform reverse RPC frames out of `SessionMessage` so platform traffic no longer relies on `sessionId = "_platform"`.

**Architecture:** Add a dedicated `PlatformBridgeMessage` union with `channel: "platform"` and no `sessionId`, while keeping ordinary session frames in `SessionMessage`. The single WebSocket still carries both shapes, but `server.ts` dispatches platform traffic by `channel`/platform `type`, and Swift `PlatformBridgeService` sends/receives the dedicated platform envelope.

**Tech Stack:** TypeScript discriminated unions and Vitest for server/core; Swift Foundation JSON serialization and XCTest for desktop codec checks.

---

### Task 1: TypeScript Platform Protocol Union

**Files:**
- Create: `packages/core/src/protocol/PlatformBridgeMessage.ts`
- Modify: `packages/core/src/protocol/SessionMessage.ts`
- Test: `apps/agent-server/src/WebSocketPlatformBridge.test.ts`
- Test: `apps/agent-server/src/server.test.ts`

- [ ] **Step 1: Write failing TS protocol expectations**

Update `apps/agent-server/src/WebSocketPlatformBridge.test.ts` so `captureSends` stores `PlatformBridgeMessage[]` and the first request assertion expects:

```ts
expect(req.channel).toBe("platform");
expect(req.type).toBe("platform_request");
expect("sessionId" in req).toBe(false);
```

Update `apps/agent-server/src/server.test.ts` `platformHello()` helper to return a platform envelope:

```ts
function platformHello(messageId: string): PlatformBridgeMessage {
  return {
    channel: "platform",
    type: "platform_bridge_hello",
    messageId,
    timestamp: new Date().toISOString(),
    payload: { agent: "test" },
  };
}
```

- [ ] **Step 2: Run RED tests**

Run:

```bash
pnpm exec vitest run apps/agent-server/src/WebSocketPlatformBridge.test.ts apps/agent-server/src/server.test.ts
```

Expected: TypeScript transform/test failure because `PlatformBridgeMessage` does not exist or platform messages still include `sessionId`.

- [ ] **Step 3: Add platform message type and remove platform variants from SessionMessage**

Create `packages/core/src/protocol/PlatformBridgeMessage.ts`:

```ts
export type PlatformBridgeMessage =
  | {
      channel: "platform";
      type: "platform_bridge_hello";
      messageId: string;
      timestamp: string;
      payload: { agent: string };
    }
  | {
      channel: "platform";
      type: "platform_request";
      messageId: string;
      timestamp: string;
      payload: {
        requestId: string;
        method: string;
        args: unknown;
        timeoutMs?: number;
      };
    }
  | {
      channel: "platform";
      type: "platform_response";
      messageId: string;
      timestamp: string;
      payload: PlatformResponsePayload;
    };

export type PlatformResponsePayload =
  | {
      requestId: string;
      status: "ok";
      result: unknown;
    }
  | {
      requestId: string;
      status: "error";
      message: string;
      code?: string;
    };
```

Modify `packages/core/src/protocol/SessionMessage.ts`:

```ts
// Delete platform_bridge_hello / platform_request / platform_response variants.
// Delete PlatformResponsePayload export from this file.
```

- [ ] **Step 4: Run protocol tests GREEN**

Run:

```bash
pnpm exec vitest run apps/agent-server/src/WebSocketPlatformBridge.test.ts apps/agent-server/src/server.test.ts
```

Expected: tests compile and fail only on production code still emitting old shape.

### Task 2: Server Dispatch and WebSocketPlatformBridge

**Files:**
- Modify: `apps/agent-server/src/WebSocketPlatformBridge.ts`
- Modify: `apps/agent-server/src/server.ts`
- Test: `apps/agent-server/src/WebSocketPlatformBridge.test.ts`
- Test: `apps/agent-server/src/server.test.ts`

- [ ] **Step 1: Change WebSocketPlatformBridge send type**

Set:

```ts
import type { PlatformBridgeMessage, PlatformResponsePayload } from "@handagent/core/protocol/PlatformBridgeMessage.ts";

export type Send = (message: PlatformBridgeMessage) => void;
```

Emit request:

```ts
send({
  channel: "platform",
  type: "platform_request",
  messageId: requestId,
  timestamp: new Date().toISOString(),
  payload: { requestId, method, args, timeoutMs },
});
```

- [ ] **Step 2: Change server socket parsing**

In `apps/agent-server/src/server.ts`, import `PlatformBridgeMessage` and parse raw as:

```ts
type SocketMessage = SessionMessage | PlatformBridgeMessage;
const message = JSON.parse(raw.toString()) as SocketMessage;
```

Add helper:

```ts
function isPlatformBridgeMessage(message: SocketMessage): message is PlatformBridgeMessage {
  return message.channel === "platform";
}
```

Dispatch platform before session handling:

```ts
if (isPlatformBridgeMessage(message)) {
  if (message.type === "platform_bridge_hello" && bridge) {
    bridgeToken = bridge.attach(sendPlatform);
  } else if (message.type === "platform_response") {
    bridge?.handleResponse(message.payload, bridgeToken);
  }
  return;
}
```

Keep `sendSession` for `SessionRouter` / permission bridge and `sendPlatform` for platform bridge.

- [ ] **Step 3: Run targeted GREEN tests**

Run:

```bash
pnpm exec vitest run apps/agent-server/src/WebSocketPlatformBridge.test.ts apps/agent-server/src/server.test.ts
```

Expected: both pass.

### Task 3: Swift PlatformBridgeService Codec

**Files:**
- Modify: `apps/desktop/Sources/AppServices/PlatformBridge/PlatformBridgeService.swift`
- Create: `apps/desktop/TestsSwift/PlatformBridgeServiceTests.swift`

- [ ] **Step 1: Add RED Swift tests for platform envelope**

Add a test-only transport seam equivalent to `SessionSocketTransport` if needed:

```swift
@MainActor
protocol PlatformBridgeSocketTransport {
    func makeWebSocketTask(with url: URL) -> any SessionWebSocketTask
}
```

Inject it into `PlatformBridgeService` and add tests that record sent JSON. The hello frame must satisfy:

```swift
XCTAssertEqual(object["channel"] as? String, "platform")
XCTAssertEqual(object["type"] as? String, "platform_bridge_hello")
XCTAssertNil(object["sessionId"])
```

For response frames, feed a `platform_request` with `channel: "platform"` and assert the response has `channel: "platform"` and no `sessionId`.

- [ ] **Step 2: Run RED Swift test**

Run:

```bash
bash ./scripts/swiftw test
```

Expected: failure because `PlatformBridgeService` cannot yet inject fake transport or still emits `sessionId`.

- [ ] **Step 3: Implement minimal codec update**

Update `sendHello` and `sendResponse` envelopes to include:

```swift
"channel": "platform"
```

and remove:

```swift
"sessionId": "_platform"
```

Update `handleIncoming` to require:

```swift
let channel = envelope["channel"] as? String,
channel == "platform",
let type = envelope["type"] as? String,
type == "platform_request"
```

- [ ] **Step 4: Run Swift GREEN**

Run:

```bash
bash ./scripts/swiftw test
```

Expected: Swift tests pass.

### Task 4: Documentation and TODO Cleanup

**Files:**
- Modify: `packages/core/src/protocol/protocol.md`
- Modify: `packages/core/src/platform/platform.md`
- Modify: `packages/core/src/src.md`
- Modify: `packages/core/core.md`
- Modify: `apps/agent-server/agent-server.md`
- Modify: `apps/desktop/Sources/AppServices/PlatformBridge/platform-bridge.md`
- Modify: `handAgent.md`
- Modify: `apps/apps.md`
- Modify: `docs/TODO.md`
- Modify: `docs/architecture-review.md`

- [ ] **Step 1: Replace old magic-session wording**

Search:

```bash
rg '_platform|platform_request|platform_response|20 个|SessionMessage' *.md apps packages docs
```

Update docs so platform frames are described as `PlatformBridgeMessage` with `channel: "platform"` and no `sessionId`.

- [ ] **Step 2: Remove completed TODO item**

Delete `docs/TODO.md` P1 item “SessionMessage 拆分会话协议与平台 RPC” and renumber remaining items.

- [ ] **Step 3: Run docs grep**

Run:

```bash
rg '_platform' *.md apps packages docs
```

Expected: no matches except historical notes if explicitly marked as old behavior.

### Task 5: Final Verification and Commit

**Files:**
- Modify: `scripts/test.sh` if new tests were created and are not already included.

- [ ] **Step 1: Run full gates**

Run:

```bash
bash ./scripts/test.sh
bash ./scripts/swiftw test
bash ./scripts/swiftw build
git diff --check
```

Expected: all pass.

- [ ] **Step 2: Commit**

Run:

```bash
git status --short
git add packages/core/src/protocol/PlatformBridgeMessage.ts packages/core/src/protocol/SessionMessage.ts apps/agent-server/src/WebSocketPlatformBridge.ts apps/agent-server/src/WebSocketPlatformBridge.test.ts apps/agent-server/src/server.ts apps/agent-server/src/server.test.ts apps/desktop/Sources/AppServices/PlatformBridge/PlatformBridgeService.swift apps/desktop/TestsSwift/PlatformBridgeServiceTests.swift packages/core/src/protocol/protocol.md packages/core/src/platform/platform.md packages/core/src/src.md packages/core/core.md apps/agent-server/agent-server.md apps/desktop/Sources/AppServices/PlatformBridge/platform-bridge.md handAgent.md apps/apps.md docs/TODO.md docs/architecture-review.md scripts/test.sh
git commit -m "refactor: split platform bridge protocol"
```

Expected: one commit on `codex/todo-protocol-channel-split`.


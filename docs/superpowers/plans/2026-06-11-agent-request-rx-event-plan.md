# Agent Request Rx Event Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route turn-level permission/workspace requests through Agent `rx_event`, and route React `ClientResponse` back into Agent `tx_sub` as `client_response` Op.

**Architecture:** Keep the public `/api/thread` protocol as `ThreadCommand | ClientResponse` inbound and `ThreadNotification | ServerRequest` outbound. Internally, define `AgentEvent` for `rx_event`, add `ClientResponseOp` for Agent `tx_sub`, move request waiting state into `AgentRequestBroker`, and delete production use of direct permission/workspace socket bridges.

**Tech Stack:** TypeScript, Vitest, Node WebSocket, existing handAgent core protocol DTOs

---

### Task 1: Extend core protocol types

**Files:**
- Modify: `packages/core/src/protocol/Op.ts`
- Modify: `packages/core/src/protocol/ThreadCommand.ts`
- Create: `packages/core/src/protocol/AgentEvent.ts`
- Test: `packages/core/tests/protocol/op.test.ts`

- [x] Add `RuntimeOp = UserInputOp | InterruptOp`.
- [x] Add `ClientResponseOp` and widen Agent `Op = RuntimeOp | ClientResponseOp`.
- [x] Keep `ThreadCommand.payload.op` typed as `RuntimeOp`.
- [x] Add `AgentEvent = thread.notification | server.request`.
- [x] Add protocol tests for `client_response`.

### Task 2: Add Agent request broker

**Files:**
- Create: `apps/agent-server/src/agent/AgentRequestBroker.ts`
- Create: `apps/agent-server/src/agent/AgentEventQueue.ts`
- Modify: `apps/agent-server/src/agent/AgentManager.ts`
- Test: `apps/agent-server/tests/agent/AgentRequestBroker.test.ts`

- [x] Implement per-thread event emitter registration.
- [x] Implement permission ask -> `server.request` event -> timeout/deny.
- [x] Implement workspace ask queue per thread -> `server.request` event -> cancelled/selected result.
- [x] Implement `handleOp(client_response)` to resolve pending asks.
- [x] Type Agent `rx_event` as `AsyncIterable<AgentEvent>`.

### Task 3: Route responses through Agent tx_sub

**Files:**
- Modify: `apps/agent-server/src/thread/ThreadCommandRouter.ts`
- Modify: `apps/agent-server/src/server/server.ts`
- Test: `apps/agent-server/tests/thread/ThreadCommandRouter.test.ts`
- Test: `apps/agent-server/tests/server/server.test.ts`

- [x] Change `ThreadCommandRouter.handleResponse()` to derive `threadId` from `requestId` and submit `client_response` Op.
- [x] Change socket handler to call router for all `ClientResponse` messages.
- [x] Remove socket-level permission/workspace bridge binding.
- [x] Keep socket subscription and close cleanup for thread-scoped messages.

### Task 4: Wire production Agent events

**Files:**
- Modify: `apps/agent-server/src/server/server.ts`

- [x] Instantiate `AgentRequestBroker` in `startDefaultServer`.
- [x] Inject broker resolvers into `FilePermissionPolicy` and workspace tool registry.
- [x] Create an `AgentEventQueue` per Agent.
- [x] Pump Agent `rx_event` into `ThreadNotificationPublisher`, preserving activity observer behavior.
- [x] Handle `client_response` Op in Agent `tx_sub` before UserInput/Interrupt.

### Task 5: Delete obsolete bridge path and update docs

**Files:**
- Delete: `apps/agent-server/src/bridges/ThreadPermissionBridge.ts`
- Delete: `apps/agent-server/src/bridges/ThreadWorkspaceAskBridge.ts`
- Delete: `apps/agent-server/tests/bridges/ThreadPermissionBridge.test.ts`
- Delete: `apps/agent-server/tests/bridges/ThreadWorkspaceAskBridge.test.ts`
- Modify relevant `<dir>.md` docs and `docs/manual-qa.md`

- [x] Remove old bridge files/tests from the worktree.
- [x] Update architecture docs to point request-response ownership to `AgentRequestBroker`.
- [x] Add manual QA entry for permission/workspace request-response through Agent event channels.

### Task 6: Verify and commit

- [x] Run targeted red/green tests for protocol, broker, router and server.
- [x] Run `bash ./scripts/test.sh`.
- [x] Run `bash ./scripts/swiftw test`.
- [x] Run `bash ./scripts/swiftw build`.
- [x] Dispatch independent doc audit agent.
- [ ] Commit the completed refactor.

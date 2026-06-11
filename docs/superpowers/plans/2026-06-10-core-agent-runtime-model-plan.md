# Core Agent Runtime Model Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the app-server's one-shot `runWithMessages(...)` flow with a persistent `Agent + Op` runtime model, where thread lifecycle commands stay separate and all runtime input is normalized through `UserInput` / `Interrupt` ops.

**Architecture:** Keep `thread.start` / `thread.resume` / `thread.list` / `thread.delete` / `workspace.list` as lifecycle commands, but move public runtime input to `RuntimeOp = UserInput | Interrupt`, while Agent-internal `Op` may also carry `client_response`. On the backend, introduce an Agent session owner that loads static config on `thread.start`, exposes `tx_sub` / `rx_event` / `agent_status` / `session`, and wraps persistence/status/notification complexity behind a thread port. On the frontend, PromptPanel, ThreadWindow composer, and Electron initial prompt payloads all produce the same `UserInput.items[]` shape so React and Swift stop handling text/image/selection/skill action as separate ad hoc payloads.

**Tech Stack:** TypeScript, Vitest, Swift 6, SwiftUI, React, Zustand, Electron preload/main protocol guards, Node WebSocket bridge

---

### Task 1: Define the `Op` and `UserInput` protocol types

**Files:**
- Create: `packages/core/src/protocol/Op.ts`
- Modify: `packages/core/src/protocol/ThreadCommand.ts`
- Modify: `packages/core/src/protocol/protocol.md`
- Modify: `packages/core/src/src.md`
- Test: `packages/core/tests/protocol/op.test.ts`
- Test: `packages/core/tests/protocol/thread-command-notification.test.ts`
- Test: `apps/electron-shell/tests/protocol/electronShellProtocol.test.ts`
- Test: `apps/thread-window-web/tests/threadProtocol.test.ts`

- [ ] **Step 1: Write the failing protocol tests**

Create `packages/core/tests/protocol/op.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Op, UserInput } from "../../src/protocol/Op.ts";
import type { ThreadCommand } from "../../src/protocol/ThreadCommand.ts";

describe("Op protocol", () => {
  it("supports user_input with text, image, skill, and text_selection items", () => {
    const op: Op = {
      type: "user_input",
      opId: "op-1",
      timestamp: "2026-06-10T00:00:00.000Z",
      payload: {
        items: [
          { type: "text", id: "item-1", text: "hello" },
          { type: "image", id: "item-2", mimeType: "image/png", base64: "abc" },
          { type: "skill", id: "item-3", actionId: "skill/weather", title: "天气", prompt: "查询天气" },
          { type: "text_selection", id: "item-4", text: "selected" },
        ],
      },
    };

    expect(op.type).toBe("user_input");
  });

  it("supports interrupt ops", () => {
    const op: Op = {
      type: "interrupt",
      opId: "op-2",
      timestamp: "2026-06-10T00:00:01.000Z",
      payload: { reason: "user" },
    };

    expect(op.type).toBe("interrupt");
  });

  it("keeps thread lifecycle commands separate from runtime ops", () => {
    const command: ThreadCommand = {
      type: "thread.start",
      commandId: "cmd-1",
      timestamp: "2026-06-10T00:00:00.000Z",
      payload: { workspaceId: null, actionBinding: null },
    };

    expect(command.type).toBe("thread.start");
  });
});
```

- [ ] **Step 2: Run the targeted protocol tests and watch them fail before the new types exist**

Run: `pnpm exec vitest run packages/core/tests/protocol/op.test.ts packages/core/tests/protocol/thread-command-notification.test.ts apps/electron-shell/tests/protocol/electronShellProtocol.test.ts apps/thread-window-web/tests/threadProtocol.test.ts`

Expected: FAIL because `packages/core/src/protocol/Op.ts` and the new protocol guards/encoders are not implemented yet.

- [ ] **Step 3: Implement the protocol DTOs and guards**

```ts
// packages/core/src/protocol/Op.ts
export type RuntimeOp = UserInputOp | InterruptOp;
export type Op = RuntimeOp | ClientResponseOp;
export type UserInput = { items: InputItem[] };
export type UserInputOp = { type: "user_input"; opId: string; timestamp: string; payload: UserInput };
export type InterruptOp = { type: "interrupt"; opId: string; timestamp: string; payload: { reason: "user" | "system" } };
export type InputItem = TextInputItem | ImageInputItem | SkillInputItem | TextSelectionInputItem;
export type TextInputItem = { type: "text"; id: string; text: string };
export type ImageInputItem = { type: "image"; id: string; mimeType: "image/png" | "image/jpeg" | "image/webp"; base64: string };
export type SkillInputItem = { type: "skill"; id: string; actionId: string; title: string; prompt: string };
export type TextSelectionInputItem = { type: "text_selection"; id: string; text: string };
```

```ts
// packages/core/src/protocol/ThreadCommand.ts
import type { ActionBindingPayload } from "./ThreadProtocolShared.ts";
import type { RuntimeOp } from "./Op.ts";

export type ThreadCommand =
  | { type: "thread.start"; commandId: string; timestamp: string; payload: { workspaceId: string | null; actionBinding: ActionBindingPayload | null } }
  | { type: "thread.resume"; threadId: string; commandId: string; timestamp: string }
  | { type: "thread.list"; commandId: string; timestamp: string }
  | { type: "thread.delete"; commandId: string; timestamp: string; payload: { targetThreadId: string } }
  | { type: "workspace.list"; commandId: string; timestamp: string }
  | { type: "op.submit"; threadId: string; commandId: string; timestamp: string; payload: { op: RuntimeOp } };
```

Keep `packages/core/src/protocol/ThreadProtocolShared.ts` stable; do not move `UserInput` aliases there in this plan.

- [ ] **Step 4: Update the encoders and guards in React / Electron protocol layers**

```ts
// apps/thread-window-web/src/protocol/threadProtocol.ts
export type InitialPromptPayload = {
  clientRequestId: string;
  userInput: UserInput;
  actionBinding: ActionBindingPayload | null;
};

export function encodeOpSubmit(input: { threadId: string; commandId: string; timestamp: string; op: RuntimeOp }): string {
  return encode({ type: "op.submit", threadId: input.threadId, commandId: input.commandId, timestamp: input.timestamp, payload: { op: input.op } });
}
```

```ts
// apps/electron-shell/src/main/protocol/electronShellProtocol.ts
// Change thread_window.open_initial_prompt payload from { text, attachments } to { userInput }.
```

- [ ] **Step 5: Re-run the targeted protocol tests and the full TypeScript suite**

Run: `pnpm exec vitest run packages/core/tests/protocol/op.test.ts packages/core/tests/protocol/thread-command-notification.test.ts apps/electron-shell/tests/protocol/electronShellProtocol.test.ts apps/thread-window-web/tests/threadProtocol.test.ts`

Expected: PASS

Run: `bash ./scripts/test.sh`

Expected: PASS with no new protocol regressions.

- [ ] **Step 6: Commit the protocol slice**

```bash
git add packages/core/src/protocol packages/core/tests/protocol apps/electron-shell/src/main/protocol apps/electron-shell/tests/protocol apps/thread-window-web/src/protocol apps/thread-window-web/tests/threadProtocol.test.ts
git commit -m "refactor: add persistent agent op protocol"
```

---

### Task 2: Add the persistent Agent runtime core and thread port

**Files:**
- Create: `packages/core/src/runtime/AgentRunner.ts`
- Create: `packages/core/src/runtime/AgentSession.ts`
- Create: `packages/core/src/runtime/AgentThreadPort.ts`
- Modify: `packages/core/src/runtime/AgentRuntime.ts`
- Modify: `packages/core/src/runtime/runtime.md`
- Modify: `packages/core/src/src.md`
- Modify: `packages/core/tests/runtime/agent-runtime.test.ts`
- Test: `packages/core/tests/runtime/agent-runner.test.ts`
- Test: `apps/agent-server/tests/thread/ThreadRuntimeOrchestrator.test.ts`

- [ ] **Step 1: Write the failing AgentRunner tests**

Create `packages/core/tests/runtime/agent-runner.test.ts` with one test that runs a fake persistent loop:

```ts
import { describe, expect, it } from "vitest";
import { AgentRunner } from "../../src/runtime/AgentRunner.ts";

describe("AgentRunner", () => {
  it("drains user_input then interrupt through the thread port", async () => {
    const events: string[] = [];
    const runner = new AgentRunner({
      async *rx_sub() {
        yield { type: "user_input", opId: "op-1", timestamp: "2026-06-10T00:00:00.000Z", payload: { items: [{ type: "text", id: "i1", text: "hello" }] } };
        yield { type: "interrupt", opId: "op-2", timestamp: "2026-06-10T00:00:01.000Z", payload: { reason: "user" } };
      },
      thread: {
        threadId: "thread-1",
        async getMessages() { return []; },
        async recordUserInput() { events.push("record"); return { messageId: "m1" }; },
        async emit() { events.push("emit"); },
        async waitForPendingSummaries() { events.push("wait"); },
      },
    });

    await runner.run();
    expect(events).toContain("record");
    expect(events).toContain("emit");
  });
});
```

- [ ] **Step 2: Run the new runtime test and confirm it fails**

Run: `pnpm exec vitest run packages/core/tests/runtime/agent-runner.test.ts`

Expected: FAIL because `AgentRunner` does not exist yet.

- [ ] **Step 3: Implement the persistent runner and thread port boundary**

```ts
// packages/core/src/runtime/AgentThreadPort.ts
export type AgentThreadPort = {
  threadId: string;
  getMessages(): Promise<AgentMessage[]>;
  recordUserInput(op: UserInputOp): Promise<{ messageId: string }>;
  emit(event: AgentRuntimeEvent | AgentThreadLifecycleEvent): Promise<void>;
  waitForPendingSummaries(messages?: AgentMessage[]): Promise<void>;
};
```

```ts
// packages/core/src/runtime/AgentRunner.ts
export class AgentRunner {
  constructor(private readonly args: { rx_sub: AsyncIterable<Op>; thread: AgentThreadPort; config: AgentRunConfig }) {}
  async run(): Promise<void> { /* consume rx_sub, manage active turn, call thread.emit(...) */ }
}
```

Refactor `AgentRuntime` so the one-shot `runWithMessages(...)` loop remains the internal ReAct primitive, but the app-server no longer treats it as the top-level runtime interface. If a helper is needed, keep it under `AgentRuntime` and move app-server-facing orchestration into `AgentRunner`.

- [ ] **Step 4: Update runtime tests to cover the new boundary**

Add tests that prove:

```ts
// packages/core/tests/runtime/agent-runtime.test.ts
// - the ReAct primitive still emits assistant/tool events
// - the new runner waits for pending summaries before each LLM pass
// - user_input stays normalized before the primitive is called
```

- [ ] **Step 5: Re-run runtime tests and the full TypeScript suite**

Run: `pnpm exec vitest run packages/core/tests/runtime/agent-runner.test.ts packages/core/tests/runtime/agent-runtime.test.ts apps/agent-server/tests/thread/ThreadRuntimeOrchestrator.test.ts`

Expected: PASS

Run: `bash ./scripts/test.sh`

Expected: PASS.

- [ ] **Step 6: Commit the runtime slice**

```bash
git add packages/core/src/runtime packages/core/tests/runtime apps/agent-server/tests/thread/ThreadRuntimeOrchestrator.test.ts
git commit -m "refactor: add persistent agent runner"
```

---

### Task 3: Rebuild `apps/agent-server` around `AgentManager` and `op.submit`

**Files:**
- Create: `apps/agent-server/src/agent/AgentManager.ts`
- Create: `apps/agent-server/src/agent/agent.md`
- Create: `apps/agent-server/tests/agent/AgentManager.test.ts`
- Modify: `apps/agent-server/src/server/server.ts`
- Modify: `apps/agent-server/src/thread/ThreadCommandRouter.ts`
- Modify: `apps/agent-server/src/thread/ThreadRuntimeOrchestrator.ts`
- Modify: `apps/agent-server/src/thread/thread.md`
- Modify: `apps/agent-server/agent-server.md`
- Modify: `apps/agent-server/src/src.md`
- Modify: `apps/agent-server/src/protocol/protocol.md`
- Test: `apps/agent-server/tests/thread/ThreadCommandRouter.test.ts`
- Test: `apps/agent-server/tests/thread/ThreadRuntimeOrchestrator.test.ts`
- Test: `apps/agent-server/tests/server/server.test.ts`
- Test: `apps/agent-server/tests/agent/AgentManager.test.ts`

- [ ] **Step 1: Write the failing AgentManager and router tests**

Add a test that proves `thread.start` creates an Agent, `op.submit` reaches that Agent, and `input.submit` no longer exists.

```ts
import { describe, expect, it, vi } from "vitest";
import { AgentManager } from "../../src/agent/AgentManager.ts";
import { ThreadCommandRouter } from "../../src/thread/ThreadCommandRouter.ts";

describe("AgentManager", () => {
  it("stores a thread agent and forwards op.submit to it", async () => {
    const manager = new AgentManager();
    const sent: string[] = [];
    manager.register("thread-1", { tx_sub: { send: async () => sent.push("send") }, close: async () => {}, rx_event: (async function* () {})(), agent_status: { get: () => "idle", set: () => {} }, session: {} as never });

    await manager.submit("thread-1", { type: "interrupt", opId: "op-1", timestamp: "2026-06-10T00:00:00.000Z", payload: { reason: "user" } });
    expect(sent).toEqual(["send"]);
  });
});
```

- [ ] **Step 2: Run the agent-server tests and confirm current router/runtime shape fails**

Run: `pnpm exec vitest run apps/agent-server/tests/agent/AgentManager.test.ts apps/agent-server/tests/thread/ThreadCommandRouter.test.ts apps/agent-server/tests/thread/ThreadRuntimeOrchestrator.test.ts apps/agent-server/tests/server/server.test.ts`

Expected: FAIL until `AgentManager` exists and `ThreadCommandRouter` accepts `op.submit`.

- [ ] **Step 3: Implement `AgentManager`, then redirect thread routing to it**

```ts
// apps/agent-server/src/agent/AgentManager.ts
export class AgentManager {
  private readonly agents = new Map<string, Agent>();
  register(threadId: string, agent: Agent): void { this.agents.set(threadId, agent); }
  get(threadId: string): Agent | undefined { return this.agents.get(threadId); }
  async submit(threadId: string, op: Op): Promise<void> { await this.agents.get(threadId)?.tx_sub.send(op); }
  async interrupt(threadId: string): Promise<void> { await this.submit(threadId, { type: "interrupt", opId: crypto.randomUUID(), timestamp: new Date().toISOString(), payload: { reason: "user" } }); }
  async delete(threadId: string): Promise<void> { await this.agents.get(threadId)?.close(); this.agents.delete(threadId); }
}
```

Update `ThreadCommandRouter` so:

- `thread.start` still creates the thread and subscribes the connection.
- `op.submit` is the only runtime input path.
- `input.submit` and `turn.interrupt` are removed from the final command union.
- routing no longer rejects user input just because a thread is running.
- `ThreadRuntimeOrchestrator` is reduced to a thread port / notification helper or deleted if it has no remaining owner.

- [ ] **Step 4: Update server wiring and tests**

Update `apps/agent-server/src/server/server.ts` to construct `AgentManager`, pass it into the router, and stop using the old runtime-oriented submit path directly.

Update tests to prove:

- `thread.start` loads thread config and registers a persistent agent.
- `op.submit(UserInput)` is forwarded to the agent.
- `op.submit(Interrupt)` interrupts the agent.
- deleted threads close and remove the agent.

- [ ] **Step 5: Re-run agent-server tests and the full TypeScript suite**

Run: `pnpm exec vitest run apps/agent-server/tests/agent/AgentManager.test.ts apps/agent-server/tests/thread/ThreadCommandRouter.test.ts apps/agent-server/tests/thread/ThreadRuntimeOrchestrator.test.ts apps/agent-server/tests/server/server.test.ts`

Expected: PASS

Run: `bash ./scripts/test.sh`

Expected: PASS.

- [ ] **Step 6: Commit the agent-server slice**

```bash
git add apps/agent-server/src/agent apps/agent-server/src/server/server.ts apps/agent-server/src/thread apps/agent-server/tests/agent apps/agent-server/tests/thread apps/agent-server/tests/server
git commit -m "refactor: route agent-server runtime through agents"
```

---

### Task 4: Move React ThreadWindow to `UserInput` and `Op`

**Files:**
- Modify: `apps/thread-window-web/src/App.tsx`
- Modify: `apps/thread-window-web/src/thread/threadSocketClient.ts`
- Modify: `apps/thread-window-web/src/protocol/threadProtocol.ts`
- Modify: `apps/thread-window-web/src/store/threadWindowStore.ts`
- Modify: `apps/thread-window-web/src/components/Composer.tsx`
- Modify: `apps/thread-window-web/src/components/RequestPanels.tsx`
- Modify: `apps/thread-window-web/src/components/ThreadWorkspacePane.tsx`
- Modify: `apps/thread-window-web/tests/threadSocketClient.test.ts`
- Modify: `apps/thread-window-web/tests/threadWindowStore.test.ts`
- Modify: `apps/thread-window-web/tests/nativeConfig.test.ts`
- Modify: `apps/thread-window-web/thread-window-web.md`
- Test: `apps/thread-window-web/tests/threadProtocol.test.ts`
- Test: `apps/thread-window-web/tests/smoke.test.ts`

- [ ] **Step 1: Write the failing React protocol and socket tests**

Add/adjust tests so the initial prompt payload is `userInput`, `Composer` sends `UserInputOp`, and the stop button sends `InterruptOp` through the new `op.submit` envelope.

```ts
import { describe, expect, it } from "vitest";
import { ThreadSocketClient } from "../src/thread/threadSocketClient.ts";

describe("ThreadSocketClient", () => {
  it("sends op.submit for user input and interrupt", () => {
    // queue open initial prompt, then assert socket frames contain op.submit payloads
  });
});
```

- [ ] **Step 2: Run the React tests and confirm the current text+attachments path fails**

Run:
`pnpm --filter handagent-thread-window-web exec vitest run tests/threadProtocol.test.ts tests/threadSocketClient.test.ts tests/threadWindowStore.test.ts tests/nativeConfig.test.ts`

Expected: FAIL until `UserInput` is wired through `App`, `threadProtocol`, and the socket client.

- [ ] **Step 3: Implement the React input normalization path**

Update `App.tsx` so:

- the initial prompt receiver hands `userInput` to `startInitialPrompt(...)`;
- the first thread command sequence becomes `thread.start -> thread.resume -> op.submit`;
- composer submissions produce a `UserInputOp` rather than raw `input.submit`;
- stop submits an `InterruptOp`;
- queued input state still works, but the dispatch payload is now `op.submit`.

Update `Composer.tsx` / `RequestPanels.tsx` / `ThreadWorkspacePane.tsx` only as needed to pass the new op-aware callbacks and keep the same visual behavior.

Update the store so pending initial prompt and queued composer input continue to render correctly while `UserInput` is the transport shape.

- [ ] **Step 4: Re-run React tests and the repo TS suite**

Run:
`pnpm --filter handagent-thread-window-web exec vitest run tests/threadProtocol.test.ts tests/threadSocketClient.test.ts tests/threadWindowStore.test.ts tests/nativeConfig.test.ts`

Expected: PASS

Run: `bash ./scripts/test.sh`

Expected: PASS.

- [ ] **Step 5: Commit the React slice**

```bash
git add apps/thread-window-web/src apps/thread-window-web/tests apps/thread-window-web/thread-window-web.md
git commit -m "refactor: move thread window input to op model"
```

---

### Task 5: Move Swift PromptPanel and Electron initial prompt payload to `UserInput`

**Files:**
- Modify: `apps/desktop/Sources/PromptPanel/PromptAttachmentResult.swift`
- Modify: `apps/desktop/Sources/Coordinator/PromptSubmission.swift`
- Modify: `apps/desktop/Sources/Coordinator/AppCoordinator.swift`
- Modify: `apps/desktop/Sources/Coordinator/coordinator.md`
- Modify: `apps/desktop/Sources/PromptPanel/prompt-panel.md`
- Modify: `apps/desktop/Sources/AppServices/ElectronShell/ElectronShellProtocol.swift`
- Modify: `apps/desktop/TestsSwift/PromptPanel/PromptPanelViewModelTests.swift`
- Modify: `apps/desktop/TestsSwift/PromptPanel/PromptPanelControllerTests.swift` if callback signatures change
- Modify: `apps/desktop/TestsSwift/AppServices/ElectronShell/ElectronShellProtocolTests.swift`
- Modify: `apps/desktop/TestsSwift/Coordinator/AppCoordinatorTests.swift`
- Modify: `apps/electron-shell/src/main/protocol/electronShellProtocol.ts`
- Modify: `apps/electron-shell/tests/protocol/electronShellProtocol.test.ts`
- Modify: `apps/electron-shell/src/main/windows/threadWindowPrewarmer.ts`
- Modify: `apps/electron-shell/src/main/electronShellRuntime.ts` if the new payload must be plumbed through openInitialPrompt handling
- Modify: `apps/electron-shell/tests/main/electronShellRuntime.test.ts`

- [ ] **Step 1: Write the failing Swift and Electron payload tests**

Add a Swift test proving PromptPanel can compose `UserInput.items` from draft, attachments, and skill action output, and another test proving the Electron initial prompt payload accepts `userInput` rather than `text + attachments`.

- [ ] **Step 2: Run the targeted Swift / Electron tests and confirm they fail**

Run:
`bash ./scripts/swiftw test --filter PromptPanelViewModelTests`
`pnpm --filter handagent-electron-shell exec vitest run tests/protocol/electronShellProtocol.test.ts tests/main/electronShellRuntime.test.ts`

Expected: FAIL until the new payload shape is in place.

- [ ] **Step 3: Implement the new Swift input composer and Electron payload**

Update `PromptSubmission` so it returns a `UserInput` object instead of `composed + summary + socketAttachments`, while preserving the current visible PromptPanel behavior:

- draft text becomes a `TextInputItem`
- `.textToken` becomes a `TextInputItem`
- `.textSelection` becomes a `TextSelectionInputItem`
- `.imageRegion` becomes an `ImageInputItem`
- skill action becomes a `SkillInputItem`
- plugin action keeps `actionBinding` and still uses rendered prompt text as user input, not as a skill item

Update the Swift → Electron `thread_window.open_initial_prompt` payload to carry `userInput` plus `actionBinding`.

Update Electron preload/main validation to reject the old shape and pass through the new shape.

- [ ] **Step 4: Re-run Swift and Electron tests**

Run:
`bash ./scripts/swiftw test --filter PromptPanelViewModelTests`
`bash ./scripts/swiftw test --filter PromptPanelControllerTests`
`pnpm --filter handagent-electron-shell exec vitest run tests/protocol/electronShellProtocol.test.ts tests/main/electronShellRuntime.test.ts`
`bash ./scripts/swiftw test`
`bash ./scripts/swiftw build`

Expected: PASS

Run: `bash ./scripts/test.sh`

Expected: PASS.

- [ ] **Step 5: Commit the Swift/Electron slice**

```bash
git add apps/desktop/Sources/PromptPanel apps/desktop/Sources/Coordinator apps/desktop/Sources/AppServices/ElectronShell apps/desktop/TestsSwift apps/electron-shell/src/main/protocol apps/electron-shell/src/main/windows apps/electron-shell/tests apps/electron-shell/src/main/electronShellRuntime.ts
git commit -m "refactor: normalize prompt panel input into user input"
```

---

### Task 6: Update docs, manual QA, and final verification

**Files:**
- Modify: `handAgent.md`
- Modify: `packages/core/src/runtime/runtime.md`
- Modify: `packages/core/src/protocol/protocol.md`
- Modify: `packages/core/src/src.md`
- Modify: `packages/core/core.md`
- Modify: `apps/apps.md`
- Modify: `apps/agent-server/agent-server.md`
- Modify: `apps/agent-server/src/thread/thread.md`
- Modify: `apps/agent-server/src/protocol/protocol.md`
- Modify: `apps/thread-window-web/thread-window-web.md`
- Modify: `apps/desktop/Sources/PromptPanel/prompt-panel.md`
- Modify: `apps/desktop/Sources/Coordinator/coordinator.md`
- Modify: `apps/desktop/Sources/AppServices/ElectronShell/electron-shell.md`
- Modify: `docs/manual-qa.md`
- Modify: `apps/agent-server/src/thread/thread.md` and add `apps/agent-server/src/agent/agent.md` if the new agent owner exists

- [ ] **Step 1: Update architecture docs to match the new persistent agent model**

Document the final shape:

- `Agent` owns `tx_sub`, `rx_event`, `agent_status`, `session`
- `thread.start` loads config and creates the persistent Agent
- `op.submit` is the only runtime input envelope
- PromptPanel / Composer / Electron initial prompt all feed `UserInput.items`
- `thread.start`, `thread.resume`, `thread.list`, `thread.delete`, and `workspace.list` remain lifecycle commands
- `input.submit` and `turn.interrupt` are removed from the final protocol

- [ ] **Step 2: Update manual QA**

Add completion evidence for:

- PromptPanel plain text new thread
- text selection new thread
- image region new thread
- skill action producing `SkillInputItem`
- plugin action preserving `actionBinding`
- ThreadWindow composer follow-up as `op.submit`
- running thread stop via `InterruptOp`

- [ ] **Step 3: Run the full validation suite**

Run:
`bash ./scripts/test.sh`
`bash ./scripts/swiftw test`
`bash ./scripts/swiftw build`

Expected: PASS

- [ ] **Step 4: Commit docs and QA updates**

```bash
git add handAgent.md packages apps docs/manual-qa.md
git commit -m "docs: document persistent agent op model"
```

---

### Task 7: Final review and cleanup

**Files:**
- No new code files expected
- Review all touched files for consistency
- Clean up any obsolete compatibility glue left behind by earlier tasks

- [ ] **Step 1: Re-read the spec against the implemented files**

Check that the final code still matches the design in `docs/superpowers/specs/2026-06-10-core-agent-runtime-model-design.md`.

- [ ] **Step 2: Verify no legacy runtime input paths remain in the final state**

Run targeted searches for `input.submit`, `turn.interrupt`, and `runWithMessages(` in the new runtime path and confirm any remaining occurrences are only legacy docs or internal primitives, not the app-server's external input model.

- [ ] **Step 3: Re-run the full suite one last time**

Run:
`bash ./scripts/test.sh`
`bash ./scripts/swiftw test`
`bash ./scripts/swiftw build`

Expected: PASS

- [ ] **Step 4: Commit cleanup if any tracked files changed**

```bash
git status --short
git add -A
git commit -m "chore: finish persistent agent runtime refactor"
```

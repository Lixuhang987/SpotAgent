# ThreadWindow 删除 Tab 概念 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从 `apps/thread-window-web` 删除 tab 产品和代码概念，只保留后台 `threadId -> ThreadState` 缓存，并让右侧固定渲染 `App` 本地 state 选中的 thread。

**Architecture:** `createThreadWindowStore` 只保存 thread 数据缓存、历史、workspace 和窗口级状态；`activeThreadId` 由 `App` 本地 `useState` 持有。`ThreadSocketClient` 仍作为当前 WebSocket transport，但删除全部 reconnect 行为和基于重连的恢复订阅；入站消息 handler 始终按 `threadId` 更新 `threadsById`，右侧组件只按传入的 `threadId` 从 store 读取状态渲染。

**Tech Stack:** React 19、TypeScript、zustand、immer、Vitest、React DOM server render tests、Tailwind CSS、WebSocket protocol helpers from `@handagent/core`。

---

## Preconditions

- [ ] **Step 1: Create implementation worktree**

Run from repo root:

```bash
git worktree add .worktrees/remove-thread-tabs -b codex/remove-thread-tabs
cd .worktrees/remove-thread-tabs
```

Expected: new worktree at `.worktrees/remove-thread-tabs` on branch `codex/remove-thread-tabs`.

- [ ] **Step 2: Install dependencies in the worktree**

```bash
pnpm install
```

Expected: command exits 0. If dependencies are already linked, pnpm may report everything up to date.

- [ ] **Step 3: Run baseline TypeScript tests before code changes**

```bash
bash ./scripts/test.sh
```

Expected: PASS before edits. If this fails, stop and record the pre-existing failure before changing implementation.

- [ ] **Step 4: Read required architecture docs**

```bash
sed -n '1,240p' handAgent.md
sed -n '1,220p' apps/apps.md
sed -n '1,260p' apps/thread-window-web/thread-window-web.md
sed -n '1,260p' docs/superpowers/specs/2026-06-09-remove-thread-tabs-design.md
```

Expected: confirm these facts before editing:
- React ThreadWindow owns `/api/thread`.
- Store must move from `tabs` to `threadsById`.
- `activeThreadId` must stay out of store.
- All automatic reconnect behavior must be removed.

## File Structure

Modify:
- `apps/thread-window-web/src/store/threadWindowStore.ts`: rename tab model to `ThreadState`, replace `tabs` with `threadsById`, remove `activeTabId`, `openHistoryThread`, `closeTab`, add `ensureThreadState`, keep request and queue state per thread.
- `apps/thread-window-web/src/thread/threadSocketClient.ts`: delete reconnect timer/options/state path and delete `getOpenThreadIds`; keep connect/disconnect, send queue, initial prompt side effects, explicit `resumeThread(threadId)` for user-opened history and first prompt flow only.
- `apps/thread-window-web/src/App.tsx`: introduce local `activeThreadId`, remove `TabBar`, pass `activeThreadId` to sidebar, move right pane into `ThreadWorkspacePane`, iterate `threadsById` for queued dispatch.
- `apps/thread-window-web/src/components/HistorySidebar.tsx`: rename prop `activeTabId` to `activeThreadId`.
- `apps/thread-window-web/src/components/WorkspaceGroup.tsx`: rename prop `activeTabId` to `activeThreadId`.
- `apps/thread-window-web/tests/threadWindowStore.test.ts`: update assertions to `threadsById`, add no-UI-active-state coverage.
- `apps/thread-window-web/tests/threadSocketClient.test.ts`: remove reconnect tests and add unexpected close does not reconnect / does not resume cached threads coverage.
- `apps/thread-window-web/tests/scrollContainers.test.ts`: remove `TabBar` rendering test and assert workspace shell no longer has tab strip.
- `apps/thread-window-web/tests/historySidebar.test.ts`: rename prop usage.
- `apps/thread-window-web/thread-window-web.md`: update package facts from tabs/reconnect to thread cache and no reconnect.
- `apps/apps.md`: update apps layer facts from tabs to thread state cache.
- `handAgent.md`: update architecture invariant from tabs to thread cache.
- `docs/manual-qa.md`: add manual QA item for background running thread state and request preservation.

Create:
- `apps/thread-window-web/src/components/ThreadWorkspacePane.tsx`: right-side fixed thread renderer. Receives `threadId`, connection state, and callbacks; reads `threadsById[threadId]` from store.

Delete:
- `apps/thread-window-web/src/components/TabBar.tsx`: remove the component if no references remain.

## Task 1: Store Shape Moves From Tabs To Threads

**Files:**
- Modify: `apps/thread-window-web/src/store/threadWindowStore.ts`
- Modify: `apps/thread-window-web/tests/threadWindowStore.test.ts`

- [ ] **Step 1: Write failing store tests for thread cache model**

In `apps/thread-window-web/tests/threadWindowStore.test.ts`, replace the first test and add a dedicated `ensureThreadState` test near the top:

```ts
it("creates thread state from a started notification and keeps pending initial prompt without active UI state", () => {
  const store = createThreadWindowStore;
  store.getState().enqueueInitialPrompt({
    clientRequestId: "prompt-1",
    text: "hello",
    attachments: [],
    actionBinding: null,
  });

  store.getState().handleNotification({
    type: "thread.started",
    threadId: "thread-1",
    notificationId: "n1",
    commandId: "prompt-1",
    timestamp,
    payload: { preview: "hello" },
  });

  expect(store.getState().threadsById["thread-1"].pendingInitialPrompt?.text).toBe("hello");
  expect("activeTabId" in store.getState()).toBe(false);
  expect("tabs" in store.getState()).toBe(false);
});

it("ensures cached thread state without selecting a visible thread", () => {
  const store = createThreadWindowStore;

  store.getState().ensureThreadState("thread-1");

  expect(store.getState().threadsById["thread-1"]).toMatchObject({
    threadId: "thread-1",
    title: null,
    status: "idle",
    messages: [],
  });
  expect("activeTabId" in store.getState()).toBe(false);
});
```

- [ ] **Step 2: Run store tests and verify failure**

```bash
pnpm --filter handagent-thread-window-web test -- tests/threadWindowStore.test.ts
```

Expected: FAIL because `threadsById` and `ensureThreadState` do not exist, and old `tabs` / `activeTabId` still exist.

- [ ] **Step 3: Rename store types and root fields**

In `apps/thread-window-web/src/store/threadWindowStore.ts`, make these exact structural edits:

```ts
export type ConnectionState = "disconnected" | "connecting" | "connected";
```

Rename:

```ts
export type ThreadTabState = {
```

to:

```ts
export type ThreadState = {
```

Replace the relevant `ThreadWindowState` fields and actions:

```ts
threadsById: Record<string, ThreadState>;
pendingInitialPrompts: Record<string, InitialPromptPayload>;
processedNotificationIds: Record<string, true>;
workspaces: Array<{ id: string; name: string; rootPath: string }>;
expandedWorkspaceIds: Set<string>;
searchQuery: string;
setConnectionState(state: ConnectionState): void;
enqueueInitialPrompt(prompt: InitialPromptPayload): void;
ensureThreadState(threadId: string): void;
resolvePermissionRequest(requestId: string): void;
resolveWorkspaceRequest(requestId: string): void;
```

Rename helper:

```ts
function emptyThreadState(threadId: string, title: string | null = null): ThreadState {
  return {
    threadId,
    title,
    status: "idle",
    messages: [],
    pendingInitialPrompt: null,
    queuedComposerInputs: [],
    queuedInputDispatchPending: false,
    permissionRequests: [],
    workspaceRequests: [],
    errorMessage: null,
  };
}
```

Initialize:

```ts
threadsById: {},
```

Add action:

```ts
ensureThreadState(threadId) {
  set(produce<ThreadWindowState>((draft) => {
    draft.threadsById[threadId] ??= emptyThreadState(threadId);
  }));
},
```

- [ ] **Step 4: Replace store internals from tab variable names to thread variable names**

Still in `threadWindowStore.ts`, replace every `draft.tabs[...]` lookup with `draft.threadsById[...]`, and use local variable name `thread`:

```ts
const thread = draft.threadsById[threadId] ??= emptyThreadState(threadId);
thread.queuedComposerInputs.push({ text, attachments });
```

Apply the same pattern to:
- `queueComposerInput`
- `removeQueuedComposerInput`
- `markComposerInputDispatchPending`
- `takeNextQueuedInputForDispatch`
- `resolvePermissionRequest`
- `resolveWorkspaceRequest`
- every `handleNotification` case
- `handleRequest`

For `thread.started`, do not set active UI state:

```ts
draft.threadsById[notification.threadId] = emptyThreadState(
  notification.threadId,
  notification.payload.preview,
);
draft.threadsById[notification.threadId].pendingInitialPrompt = prompt ?? null;
```

For `thread.deleted`, delete only cache and history:

```ts
draft.history = draft.history.filter((item) => item.id !== notification.payload.targetThreadId);
delete draft.threadsById[notification.payload.targetThreadId];
```

Remove `openHistoryThread` and `closeTab` completely.

- [ ] **Step 5: Update all store test references**

In `apps/thread-window-web/tests/threadWindowStore.test.ts`, replace:
- `tabs` with `threadsById`
- `openHistoryThread("thread-1")` with `ensureThreadState("thread-1")`
- remove all `activeTabId` expectations

Example replacements:

```ts
expect(store.getState().threadsById["thread-1"].messages[0].text).toBe("hello");
```

```ts
expect(store.getState().threadsById["thread-1"].queuedComposerInputs).toEqual([
  { text: "second", attachments: [] },
]);
```

In the delete test, expected result after deleted notification:

```ts
expect(store.getState().history).toEqual([]);
expect(store.getState().threadsById["thread-1"]).toBeUndefined();
```

- [ ] **Step 6: Run store tests**

```bash
pnpm --filter handagent-thread-window-web test -- tests/threadWindowStore.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit store migration**

```bash
git add apps/thread-window-web/src/store/threadWindowStore.ts apps/thread-window-web/tests/threadWindowStore.test.ts
git commit -m "refactor: store thread state without tabs"
```

Expected: commit created.

## Task 2: Remove Socket Reconnect And Cached Thread Resume

**Files:**
- Modify: `apps/thread-window-web/src/thread/threadSocketClient.ts`
- Modify: `apps/thread-window-web/tests/threadSocketClient.test.ts`

- [ ] **Step 1: Write failing socket tests for no reconnect behavior**

In `apps/thread-window-web/tests/threadSocketClient.test.ts`, replace the first test with:

```ts
it("connects, lists workspaces and threads, and dispatches inbound notifications without resuming cached threads", () => {
  const events: string[] = [];
  const client = new ThreadSocketClient({
    url: "ws://127.0.0.1:4317/api/thread",
    WebSocketImpl: FakeWebSocket as never,
    now: () => "2026-06-06T00:00:00.000Z",
    id: vi.fn()
      .mockReturnValueOnce("workspace-list-1")
      .mockReturnValueOnce("list-1"),
    onConnectionState: (state) => events.push(`state:${state}`),
    onNotification: (notification) => events.push(notification.type),
    onRequest: (request) => events.push(request.type),
  });

  client.connect();
  const socket = FakeWebSocket.instances[0];
  socket.open();
  socket.onmessage?.({
    data: JSON.stringify({
      type: "thread.listed",
      notificationId: "n1",
      timestamp: "2026-06-06T00:00:00.000Z",
      payload: { threads: [] },
    }),
  });

  expect(events).toEqual(["state:connecting", "state:connected", "thread.listed"]);
  expect(socket.sent.map((raw) => JSON.parse(raw))).toMatchObject([
    { type: "workspace.list", commandId: "workspace-list-1" },
    { type: "thread.list", commandId: "list-1" },
  ]);
  expect(socket.sent.map((raw) => JSON.parse(raw)).some((command) => command.type === "thread.resume")).toBe(false);
});
```

Replace the reconnect test with:

```ts
it("marks unexpected close as disconnected without opening another socket", () => {
  vi.useFakeTimers();
  try {
    const events: string[] = [];
    const client = new ThreadSocketClient({
      url: "ws://127.0.0.1:4317/api/thread",
      WebSocketImpl: FakeWebSocket as never,
      now: () => "2026-06-06T00:00:00.000Z",
      id: () => "cmd-1",
      onConnectionState: (state) => events.push(state),
      onNotification: () => {},
      onRequest: () => {},
    });

    client.connect();
    FakeWebSocket.instances[0].open();
    FakeWebSocket.instances[0].onclose?.();
    vi.advanceTimersByTime(5_000);

    expect(events).toEqual(["connecting", "connected", "disconnected"]);
    expect(FakeWebSocket.instances).toHaveLength(1);
  } finally {
    vi.useRealTimers();
  }
});
```

- [ ] **Step 2: Remove old reconnect-only tests**

Delete these tests from `threadSocketClient.test.ts` because the behavior must no longer exist:
- `"ignores stale socket messages and closes after a reconnect starts"`
- `"clears a scheduled reconnect timer when connect starts a replacement socket"`

Update all remaining `new ThreadSocketClient({ ... })` calls by removing:

```ts
reconnectDelayMs: 0,
getOpenThreadIds: () => [],
```

and variants returning `["thread-1"]`.

- [ ] **Step 3: Run socket tests and verify failure**

```bash
pnpm --filter handagent-thread-window-web test -- tests/threadSocketClient.test.ts
```

Expected: FAIL because constructor still requires `getOpenThreadIds`, reconnect state exists, and open still resumes cached threads.

- [ ] **Step 4: Delete reconnect implementation from ThreadSocketClient**

In `apps/thread-window-web/src/thread/threadSocketClient.ts`, change:

```ts
export type ConnectionState = "disconnected" | "connecting" | "connected";
```

Remove fields:

```ts
private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
```

Remove constructor options:

```ts
reconnectDelayMs?: number;
getOpenThreadIds: () => string[];
```

Change `connect()` to:

```ts
connect(): void {
  this.manuallyClosed = false;
  if (this.hasActiveSocket()) {
    return;
  }
  this.openSocket();
}
```

Change `disconnect()` to:

```ts
disconnect(): void {
  this.manuallyClosed = true;
  this.outboundQueue = [];
  this.socket?.close();
  this.socket = null;
  this.options.onConnectionState("disconnected");
}
```

Change `openSocket` signature and body:

```ts
private openSocket(): void {
  const WebSocketImpl = this.options.WebSocketImpl ?? (WebSocket as unknown as WebSocketConstructor);
  this.options.onConnectionState("connecting");
  const socket = new WebSocketImpl(this.options.url);
  this.socket = socket;

  socket.onopen = () => {
    if (socket !== this.socket) {
      return;
    }
    this.options.onConnectionState("connected");
    this.flushOutboundQueue(socket);
    this.sendRaw(encodeWorkspaceList({
      commandId: this.nextId(),
      timestamp: this.now(),
    }));
    this.listThreads();
  };

  socket.onclose = () => {
    if (socket !== this.socket || this.manuallyClosed) {
      return;
    }
    this.socket = null;
    this.options.onConnectionState("disconnected");
  };
```

Do not send `thread.resume` from `onopen`.

- [ ] **Step 5: Keep explicit resume for intentional history/opening flows**

Keep this method unchanged in `threadSocketClient.ts`:

```ts
resumeThread(threadId: string): void {
  this.sendRaw(encodeThreadResume({
    threadId,
    commandId: this.nextId(),
    timestamp: this.now(),
  }));
}
```

Keep initial prompt side effect unchanged:

```ts
this.resumeThread(notification.threadId);
this.submitInput(notification.threadId, pending.text, pending.attachments);
```

This `thread.resume` is part of opening a newly started thread snapshot path, not reconnect recovery.

- [ ] **Step 6: Run socket tests**

```bash
pnpm --filter handagent-thread-window-web test -- tests/threadSocketClient.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit socket transport change**

```bash
git add apps/thread-window-web/src/thread/threadSocketClient.ts apps/thread-window-web/tests/threadSocketClient.test.ts
git commit -m "refactor: remove thread socket reconnect"
```

Expected: commit created.

## Task 3: Extract Fixed ThreadWorkspacePane

**Files:**
- Create: `apps/thread-window-web/src/components/ThreadWorkspacePane.tsx`
- Modify: `apps/thread-window-web/tests/scrollContainers.test.ts`

- [ ] **Step 1: Write failing render tests for fixed right pane**

In `apps/thread-window-web/tests/scrollContainers.test.ts`, replace imports:

```ts
import { ThreadWorkspacePane } from "../src/components/ThreadWorkspacePane.tsx";
import { createThreadWindowStore, type ThreadState } from "../src/store/threadWindowStore.ts";
```

Replace helper:

```ts
function threadState(threadId: string): ThreadState {
  return {
    threadId,
    title: threadId,
    status: "idle",
    messages: [],
    pendingInitialPrompt: null,
    queuedComposerInputs: [],
    queuedInputDispatchPending: false,
    permissionRequests: [],
    workspaceRequests: [],
    errorMessage: null,
  };
}
```

Add test:

```ts
it("renders the fixed workspace pane from a thread id without a tab strip", () => {
  createThreadWindowStore.setState({
    connectionState: "connected",
    threadsById: {
      "thread-1": {
        ...threadState("thread-1"),
        messages: [{ id: "m1", role: "assistant", text: "cached delta" }],
      },
    },
  });

  const html = render(
    React.createElement(ThreadWorkspacePane, {
      threadId: "thread-1",
      connectionState: "connected",
      windowErrorMessage: null,
      onSubmit: vi.fn(),
      onStop: vi.fn(),
      onRemoveQueuedInput: vi.fn(),
      onAnswerPermission: vi.fn(),
      onAnswerWorkspace: vi.fn(),
    }),
  );

  expect(html).toContain("cached delta");
  expect(html).toContain('aria-label="Thread workspace"');
  expect(html).not.toContain("overflow-x-auto overflow-y-hidden");
});
```

Delete the old `"lets only the tab strip scroll horizontally"` test.

- [ ] **Step 2: Run scroll/container tests and verify failure**

```bash
pnpm --filter handagent-thread-window-web test -- tests/scrollContainers.test.ts
```

Expected: FAIL because `ThreadWorkspacePane` does not exist.

- [ ] **Step 3: Create ThreadWorkspacePane component**

Create `apps/thread-window-web/src/components/ThreadWorkspacePane.tsx`:

```tsx
import { Composer } from "./Composer.tsx";
import { MessageList } from "./MessageList.tsx";
import { RequestPanels } from "./RequestPanels.tsx";
import { createThreadWindowStore, type ConnectionState } from "../store/threadWindowStore.ts";

type ThreadWorkspacePaneProps = {
  threadId: string | null;
  connectionState: ConnectionState;
  windowErrorMessage: string | null;
  onSubmit(threadId: string, text: string): void;
  onStop(threadId: string): void;
  onRemoveQueuedInput(threadId: string, index: number): void;
  onAnswerPermission(requestId: string, decision: "allow" | "deny"): void;
  onAnswerWorkspace(requestId: string, workspaceId: string | null): void;
};

export function ThreadWorkspacePane({
  threadId,
  connectionState,
  windowErrorMessage,
  onSubmit,
  onStop,
  onRemoveQueuedInput,
  onAnswerPermission,
  onAnswerWorkspace,
}: ThreadWorkspacePaneProps) {
  const thread = createThreadWindowStore((state) => (
    threadId ? state.threadsById[threadId] ?? null : null
  ));

  return (
    <section
      className="grid h-screen min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-surface-dark text-on-dark shadow-product-inner"
      aria-label="Thread workspace"
    >
      <div className="min-h-0 min-w-0 overflow-hidden" data-thread-window-error-slot="true">
        {windowErrorMessage ? (
          <div className="mx-sm mt-xs rounded-md border border-error/30 bg-error/10 px-sm py-xs text-sm text-error">
            {windowErrorMessage}
          </div>
        ) : null}
      </div>

      {thread ? (
        <>
          <div className="grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_auto] overflow-hidden">
            <MessageList
              messages={thread.messages}
              errorMessage={thread.errorMessage}
              isRunning={thread.status === "running"}
            />
            <RequestPanels
              permissionRequests={thread.permissionRequests}
              workspaceRequests={thread.workspaceRequests}
              onAnswerPermission={onAnswerPermission}
              onAnswerWorkspace={onAnswerWorkspace}
            />
          </div>
          <Composer
            disabled={connectionState !== "connected"}
            stopDisabled={connectionState !== "connected" || thread.status !== "running"}
            queuedInputs={thread.queuedComposerInputs}
            onSubmit={(text) => onSubmit(thread.threadId, text)}
            onRemoveQueuedInput={(index) => onRemoveQueuedInput(thread.threadId, index)}
            onStop={() => onStop(thread.threadId)}
          />
        </>
      ) : (
        <div className="flex min-h-0 min-w-0 items-center justify-center overflow-hidden text-sm text-on-dark-soft">
          <div className="rounded-lg border border-white/10 bg-surface-dark-elevated px-lg py-md">
            准备开始
          </div>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Update scroll test setup for new state shape**

In `scrollContainers.test.ts`, change reset state:

```ts
createThreadWindowStore.setState({
  connectionState: "connected",
  windowErrorMessage: null,
  history: [],
  threadsById: {},
  pendingInitialPrompts: {},
  processedNotificationIds: {},
  workspaces: [],
  expandedWorkspaceIds: new Set(),
  searchQuery: "",
});
```

Change App shell setup:

```ts
createThreadWindowStore.setState({
  threadsById: { "thread-1": threadState("thread-1") },
});
```

Update `HistorySidebar` render prop:

```ts
activeThreadId={null}
```

- [ ] **Step 5: Run scroll/container tests**

```bash
pnpm --filter handagent-thread-window-web test -- tests/scrollContainers.test.ts
```

Expected: PASS after App is updated in Task 4; if it still fails here because App imports `TabBar`, continue to Task 4 before committing.

## Task 4: App Owns activeThreadId And Deletes TabBar UI

**Files:**
- Modify: `apps/thread-window-web/src/App.tsx`
- Modify: `apps/thread-window-web/src/components/HistorySidebar.tsx`
- Modify: `apps/thread-window-web/src/components/WorkspaceGroup.tsx`
- Delete: `apps/thread-window-web/src/components/TabBar.tsx`
- Modify: `apps/thread-window-web/tests/historySidebar.test.ts`
- Modify: `apps/thread-window-web/tests/scrollContainers.test.ts`

- [ ] **Step 1: Write failing tests for sidebar prop rename**

In `apps/thread-window-web/tests/historySidebar.test.ts`, update both renders:

```ts
React.createElement(HistorySidebar, {
  history: [],
  activeThreadId: null,
  onOpenThread: vi.fn(),
  onDeleteThread: vi.fn(),
  onNewThread: vi.fn(),
})
```

and:

```ts
React.createElement(HistorySidebar, {
  history,
  activeThreadId: null,
  onOpenThread: vi.fn(),
  onDeleteThread: vi.fn(),
  onNewThread: vi.fn(),
})
```

Run:

```bash
pnpm --filter handagent-thread-window-web test -- tests/historySidebar.test.ts
```

Expected: FAIL because `HistorySidebarProps` still expects `activeTabId`.

- [ ] **Step 2: Rename sidebar props**

In `HistorySidebar.tsx`, rename:

```ts
activeTabId: string | null;
```

to:

```ts
activeThreadId: string | null;
```

Change all `activeTabId` local references to `activeThreadId`, including `WorkspaceGroup` prop and default group active check.

In `WorkspaceGroup.tsx`, rename prop and uses the same way:

```ts
activeThreadId: string | null;
```

and:

```tsx
isActive={thread.id === activeThreadId}
```

- [ ] **Step 3: Rewrite App orchestration**

In `apps/thread-window-web/src/App.tsx`:

Remove imports:

```ts
import { Composer } from "./components/Composer.tsx";
import { MessageList } from "./components/MessageList.tsx";
import { RequestPanels } from "./components/RequestPanels.tsx";
import { TabBar } from "./components/TabBar.tsx";
```

Add:

```ts
import { ThreadWorkspacePane } from "./components/ThreadWorkspacePane.tsx";
```

Inside `App`, replace:

```ts
const tabs = Object.values(state.tabs);
const activeTab = state.activeTabId ? state.tabs[state.activeTabId] : null;
```

with:

```ts
const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
const threads = Object.values(state.threadsById);
```

Update queued dispatch key:

```ts
const queuedDispatchKey = threads
  .map((thread) => [
    thread.threadId,
    thread.status,
    thread.queuedComposerInputs.length,
    thread.queuedInputDispatchPending ? "pending" : "ready",
  ].join(":"))
  .join("|");
```

Update socket construction:

```ts
const socket = new ThreadSocketClient({
  url: getThreadWebSocketURL(),
  onConnectionState: (connectionState) => createThreadWindowStore.getState().setConnectionState(connectionState),
  onNotification: (notification) => {
    createThreadWindowStore.getState().handleNotification(notification);
    if (notification.type === "thread.started") {
      setActiveThreadId(notification.threadId);
    }
  },
  onRequest: (request) => createThreadWindowStore.getState().handleRequest(request),
});
```

Update queued dispatch loop:

```ts
for (const thread of Object.values(store.threadsById)) {
  const nextInput = store.takeNextQueuedInputForDispatch(thread.threadId);
  if (nextInput) {
    clientRef.current?.submitInput(thread.threadId, nextInput.text, nextInput.attachments);
  }
}
```

Update sidebar:

```tsx
<HistorySidebar
  history={state.history}
  activeThreadId={activeThreadId}
  onOpenThread={(threadId) => {
    createThreadWindowStore.getState().ensureThreadState(threadId);
    setActiveThreadId(threadId);
    clientRef.current?.resumeThread(threadId);
  }}
  onDeleteThread={(threadId) => {
    setDeleteTargetThreadId(threadId);
  }}
  onNewThread={handleNewThread}
/>
```

Replace the whole right `<section ...>` body with:

```tsx
<ThreadWorkspacePane
  threadId={activeThreadId}
  connectionState={state.connectionState}
  windowErrorMessage={state.windowErrorMessage}
  onSubmit={(threadId, text) => {
    const latestThread = createThreadWindowStore.getState().threadsById[threadId];
    if (!latestThread) {
      return;
    }
    const shouldQueue =
      latestThread.status === "running"
      || latestThread.queuedInputDispatchPending
      || latestThread.queuedComposerInputs.length > 0;
    if (shouldQueue) {
      createThreadWindowStore.getState().queueComposerInput(threadId, text);
      return;
    }
    createThreadWindowStore.getState().markComposerInputDispatchPending(threadId);
    clientRef.current?.submitInput(threadId, text);
  }}
  onRemoveQueuedInput={(threadId, index) => {
    createThreadWindowStore.getState().removeQueuedComposerInput(threadId, index);
  }}
  onStop={(threadId) => {
    const latestThread = createThreadWindowStore.getState().threadsById[threadId];
    if (state.connectionState !== "connected" || latestThread?.status !== "running") {
      return;
    }
    clientRef.current?.sendRaw(encodeTurnInterrupt({
      threadId,
      commandId: id("interrupt"),
      timestamp: now(),
    }));
  }}
  onAnswerPermission={(requestId, decision) => {
    clientRef.current?.sendRaw(encodePermissionAnswer({
      requestId,
      timestamp: now(),
      decision,
      scope: "thread",
    }));
    createThreadWindowStore.getState().resolvePermissionRequest(requestId);
  }}
  onAnswerWorkspace={(requestId, workspaceId) => {
    clientRef.current?.sendRaw(encodeWorkspaceAnswer({
      requestId,
      timestamp: now(),
      ...(workspaceId ? { workspaceId } : { cancelled: true }),
    }));
    createThreadWindowStore.getState().resolveWorkspaceRequest(requestId);
  }}
/>
```

Keep the delete confirmation dialog after `ThreadWorkspacePane` in the main grid so it remains available.

- [ ] **Step 4: Remove TabBar file**

```bash
rm apps/thread-window-web/src/components/TabBar.tsx
```

Expected: file removed. Do not use `apply_patch` for this shell delete if executing the plan manually is acceptable; if following strict patch-only edits, delete it with `apply_patch`.

- [ ] **Step 5: Search and remove remaining tab references**

```bash
rg -n "TabBar|activeTabId|tabs|openHistoryThread|closeTab|ThreadTabState|reconnect|reconnecting|getOpenThreadIds|reconnectDelayMs" apps/thread-window-web/src apps/thread-window-web/tests
```

Expected: no matches, except prose in old snapshots if any generated files are not part of source. Source and tests must have zero matches.

- [ ] **Step 6: Run component tests**

```bash
pnpm --filter handagent-thread-window-web test -- tests/historySidebar.test.ts tests/scrollContainers.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit App and component migration**

```bash
git add apps/thread-window-web/src/App.tsx apps/thread-window-web/src/components/HistorySidebar.tsx apps/thread-window-web/src/components/WorkspaceGroup.tsx apps/thread-window-web/src/components/ThreadWorkspacePane.tsx apps/thread-window-web/tests/historySidebar.test.ts apps/thread-window-web/tests/scrollContainers.test.ts
git add -u apps/thread-window-web/src/components/TabBar.tsx
git commit -m "refactor: render one active thread without tabs"
```

Expected: commit created.

## Task 5: Full ThreadWindow Test Pass And Type Cleanup

**Files:**
- Modify as needed: `apps/thread-window-web/src/**/*.ts`
- Modify as needed: `apps/thread-window-web/tests/**/*.ts`

- [ ] **Step 1: Run all ThreadWindow tests**

```bash
pnpm --filter handagent-thread-window-web test
```

Expected: may FAIL with TypeScript or stale test references after Tasks 1-4.

- [ ] **Step 2: Fix any remaining compile references with mechanical replacements**

Use search:

```bash
rg -n "tabs|activeTabId|openHistoryThread|closeTab|ThreadTabState|reconnecting|reconnectDelayMs|getOpenThreadIds|TabBar" apps/thread-window-web
```

For source code, expected final replacements:
- `tabs` -> `threadsById`
- `ThreadTabState` -> `ThreadState`
- `activeTabId` -> no store field; in components use prop `activeThreadId`; in `App` use local `activeThreadId`
- `openHistoryThread(threadId)` -> `ensureThreadState(threadId)` plus `setActiveThreadId(threadId)` only in `App`
- `closeTab` -> no replacement
- `reconnecting` -> no replacement
- `getOpenThreadIds` -> no replacement

- [ ] **Step 3: Run package build**

```bash
pnpm --filter handagent-thread-window-web build
```

Expected: PASS.

- [ ] **Step 4: Run package tests again**

```bash
pnpm --filter handagent-thread-window-web test
```

Expected: PASS.

- [ ] **Step 5: Commit cleanup**

```bash
git add apps/thread-window-web
git commit -m "test: update thread window no-tab coverage"
```

Expected: commit created. If there were no changes since Task 4, skip this commit.

## Task 6: Documentation Audit And Manual QA

**Files:**
- Modify: `apps/thread-window-web/thread-window-web.md`
- Modify: `apps/apps.md`
- Modify: `handAgent.md`
- Modify: `docs/manual-qa.md`

- [ ] **Step 1: Dispatch independent documentation audit subagent**

Use a subagent with this exact task:

```text
请只做文档审核与必要文档更新，不改实现代码。

背景 spec: docs/superpowers/specs/2026-06-09-remove-thread-tabs-design.md
实现范围: apps/thread-window-web

要求:
1. 阅读 spec。
2. 阅读 handAgent.md、apps/apps.md、apps/thread-window-web/thread-window-web.md，以及所有已修改文件所在目录的 <dir>.md。
3. 核对文档是否仍描述 tabs、activeTabId、自动 reconnect、reconnect 恢复、getOpenThreadIds 或关闭 tab。
4. 更新过期文档，保持中文、边界明确。
5. 更新 docs/manual-qa.md，加入手工验收项：后台运行 thread 切换不丢当前缓存 delta；权限/workspace 请求保存在对应 thread；WebSocket 非主动断开不自动重连也不发送恢复命令。
6. 最终回复列出修改过的文档和仍有风险。
```

Expected: subagent returns audit result and any doc edits. Main agent must review before final commit.

- [ ] **Step 2: Update `apps/thread-window-web/thread-window-web.md` if subagent did not**

Replace these facts:

```md
`src/thread/threadSocketClient.ts` | `/api/thread` WebSocket client，负责连接、发送队列、初始 prompt 首轮流程和入站消息分派；非主动断开只上报 disconnected，不自动重连。 |
```

```md
`src/store/threadWindowStore.ts` | `zustand + immer` store，是 `threadsById`、历史、消息、请求、workspace 列表和窗口错误的状态源；不保存当前右侧展示的 thread。 |
```

Store section must say:

```md
`createThreadWindowStore` 管理后台 thread 状态缓存：`threadsById` 中每个 `ThreadState` 持有 `threadId`、title、run status、messages、pending initial prompt、权限请求、workspace 请求、composer 队列和 thread 级错误。右侧当前展示的 `activeThreadId` 是 `App` 本地 React state，不进入 store。
```

Socket boundary must say:

```md
本次 React 和 app-server 之间视为稳定长连接；`ThreadSocketClient` 不做自动 reconnect，不用 `thread.resume` 做断线恢复。非主动断开只把连接状态置为 `disconnected`，thread state 保留最后收到的流式 delta 和请求状态。
```

- [ ] **Step 3: Update architecture docs if subagent did not**

In `handAgent.md`, replace the app responsibility bullet with:

```md
- `apps/thread-window-web`：负责 React ThreadWindow UI，直接持有 `/api/thread` WebSocket，管理历史、后台 thread 状态缓存、当前右侧展示 thread、消息、请求回执和 composer 状态。
```

Replace invariant:

```md
- React ThreadWindow 是历史、后台 thread 状态缓存、消息、运行态、permission/workspace 请求面板和 composer 的 UI 状态源；右侧当前展示的 thread 由 React `App` 本地 state 编排。
```

In `apps/apps.md`, replace Thread interaction bullet:

```md
- React ThreadWindow 负责 `ThreadCommand` / `ClientResponse` 编码、`ThreadNotification` / `ServerRequest` 接收，以及历史、后台 thread 状态缓存、当前右侧展示 thread、消息、请求面板和 composer 状态。
```

- [ ] **Step 4: Update manual QA if subagent did not**

Append or update an item in `docs/manual-qa.md`:

```md
### ThreadWindow 无 tab 后台 thread 状态

- 启动一个会持续流式输出的 thread，切到历史中的另一个 thread，再切回原 thread；右侧应直接显示原 thread 当前已缓存的 assistant delta，不出现 tab 条，也不清空消息。
- 在后台 thread 触发 permission 或 workspace 请求后，切回该 thread；对应请求面板仍可见并可回答。
- 人为让 `/api/thread` WebSocket 非主动断开时，前端连接状态可变为 disconnected，但不得自动创建新 WebSocket，不得自动发送 `thread.resume` 或恢复订阅命令，已有 thread state 保留在最后收到的位置。
```

- [ ] **Step 5: Run doc grep**

```bash
rg -n "tabs|tab|TabBar|activeTabId|openHistoryThread|closeTab|getOpenThreadIds|reconnect|reconnecting|自动重连|恢复订阅" handAgent.md apps/apps.md apps/thread-window-web/thread-window-web.md docs/manual-qa.md
```

Expected: no stale mentions in docs except:
- historical/spec references that explicitly describe removed old behavior,
- `thread.resume` only for user-opened history or initial prompt snapshot path,
- “不自动重连” / “不做 reconnect” statements are allowed.

- [ ] **Step 6: Commit docs**

```bash
git add handAgent.md apps/apps.md apps/thread-window-web/thread-window-web.md docs/manual-qa.md
git commit -m "docs: document thread window without tabs"
```

Expected: commit created.

## Task 7: Final Verification

**Files:**
- No planned edits. Verification only.

- [ ] **Step 1: Run ThreadWindow tests**

```bash
pnpm --filter handagent-thread-window-web test
```

Expected: PASS.

- [ ] **Step 2: Run ThreadWindow build**

```bash
pnpm --filter handagent-thread-window-web build
```

Expected: PASS.

- [ ] **Step 3: Run repository TypeScript verification**

```bash
bash ./scripts/test.sh
```

Expected: PASS.

- [ ] **Step 4: Confirm no stale tab/reconnect source references**

```bash
rg -n "TabBar|activeTabId|openHistoryThread|closeTab|ThreadTabState|getOpenThreadIds|reconnectDelayMs|reconnecting" apps/thread-window-web/src apps/thread-window-web/tests
```

Expected: no matches.

- [ ] **Step 5: Confirm final git state**

```bash
git status --short
git log --oneline --max-count=6
```

Expected: working tree clean, recent commits include store migration, socket reconnect removal, App no-tab rendering, docs.

## Self-Review Checklist

- Spec coverage:
  - 删除 TabBar 和 tab 切换/关闭: Task 4.
  - `threadsById` state cache: Task 1.
  - `activeThreadId` in `App` local state: Task 4.
  - Right pane receives `threadId`: Task 3 and Task 4.
  - Inbound handlers update hidden/background threads: Task 1 store tests.
  - Permission/workspace requests stay per thread: Task 1 and Task 3.
  - No reconnect operations: Task 2.
  - No reconnect recovery via `thread.resume`: Task 2.
  - Docs and manual QA: Task 6.
- Placeholder scan: no TBD/TODO/fill-in placeholders.
- Type consistency:
  - `ThreadState` replaces `ThreadTabState`.
  - `threadsById` replaces `tabs`.
  - `activeThreadId` exists only in `App` and sidebar props.
  - `ConnectionState` is `"disconnected" | "connecting" | "connected"` in store and socket client.

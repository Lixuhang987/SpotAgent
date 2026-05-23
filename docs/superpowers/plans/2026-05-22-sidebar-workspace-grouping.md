# Sidebar Workspace Grouping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the SessionWindow left sidebar to group conversations by workspace, with collapsible workspace sections and per-workspace "new session" buttons.

**Architecture:** Add `workspaceId` to session metadata throughout the stack (core types → persistence → protocol → server → Swift client). The Swift sidebar groups sessions client-side using the workspace list from `WorkspaceSettingsViewModel`. No new protocol message types needed.

**Tech Stack:** TypeScript (vitest), Swift (XCTest), WebSocket protocol

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `packages/core/src/storage/SessionRecord.ts` | Add `workspaceId` to `SessionMetadata` |
| Modify | `packages/core/src/storage/SessionStore.ts` | Add `workspaceId` to `CreateSessionInput` |
| Modify | `packages/core/src/storage/InMemorySessionStore.ts` | Pass `workspaceId` through on create |
| Modify | `packages/core/src/storage/FileSessionStore.ts` | Pass `workspaceId` through on create |
| Modify | `packages/core/src/protocol/SessionMessage.ts` | Add `workspaceId` to `SessionListEntry` and `create_session_request` payload |
| Modify | `apps/agent-server/src/SessionPersistence.ts` | Accept `workspaceId` in `createSession` |
| Modify | `apps/agent-server/src/SessionRouter.ts` | Pass `workspaceId` from request to persistence, include in list entry |
| Modify | `apps/agent-server/tests/session/SessionRouter.test.ts` | Test workspace-aware create and list |
| Modify | `apps/desktop/Sources/SessionWindow/SessionSocketClient.swift` | Add `workspaceId` to `SessionListItem`, decode it, send in create |
| Modify | `apps/desktop/Sources/SessionWindow/SessionWindowViewModel.swift` | Add `workspaceId` param to create methods |
| Modify | `apps/desktop/Sources/SessionWindow/SessionHistorySidebarView.swift` | Rewrite to grouped layout |
| Modify | `apps/desktop/Sources/SessionWindow/SessionWindowView.swift` | Inject workspaces into sidebar |
| Modify | `apps/desktop/Sources/Coordinator/SessionWindowLifecycle.swift` | Provide `WorkspaceSettingsViewModel` to window |
| Modify | `apps/desktop/TestsSwift/SessionWindow/SessionSocketClientTests.swift` | Test workspaceId decode |
| Modify | `apps/desktop/TestsSwift/SessionWindow/SessionWindowViewModelTests.swift` | Test create with workspaceId |

---

## Task 1: Add workspaceId to Core Types

**Files:**
- Modify: `packages/core/src/storage/SessionRecord.ts:4-10`
- Modify: `packages/core/src/storage/SessionStore.ts:14-19`
- Modify: `packages/core/src/protocol/SessionMessage.ts:228-234`

- [ ] **Step 1: Add workspaceId to SessionMetadata**

In `packages/core/src/storage/SessionRecord.ts`, add `workspaceId` field:

```typescript
export type SessionMetadata = {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  workspaceId?: string | null;
  actionBinding?: SessionActionBinding;
};
```

- [ ] **Step 2: Add workspaceId to CreateSessionInput**

In `packages/core/src/storage/SessionStore.ts`:

```typescript
export type CreateSessionInput = {
  id: string;
  title?: string | null;
  createdAt?: string;
  workspaceId?: string | null;
  actionBinding?: SessionActionBinding;
};
```

- [ ] **Step 3: Add workspaceId to SessionListEntry and create_session_request**

In `packages/core/src/protocol/SessionMessage.ts`:

Add to `SessionListEntry`:
```typescript
export type SessionListEntry = {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  workspaceId?: string | null;
};
```

Add to `create_session_request` payload:
```typescript
| {
    type: "create_session_request";
    sessionId: "";
    messageId: string;
    timestamp: string;
    payload: {
      initialText?: string;
      attachments?: UserMessageAttachment[];
      actionBinding?: {
        pluginId: string;
        promptName: string;
      };
      workspaceId?: string | null;
    };
  }
```

- [ ] **Step 4: Pass workspaceId in InMemorySessionStore.create**

In `packages/core/src/storage/InMemorySessionStore.ts`, update the `create` method:

```typescript
async create(input: CreateSessionInput): Promise<PersistedSession> {
  const now = input.createdAt ?? new Date().toISOString();
  const session: PersistedSession = {
    version: 1,
    metadata: {
      id: input.id,
      title: input.title ?? null,
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
      workspaceId: input.workspaceId ?? null,
      actionBinding: input.actionBinding,
    },
    messages: [],
    events: [],
  };
  this.records.set(input.id, session);
  return session;
}
```

- [ ] **Step 5: Pass workspaceId in FileSessionStore.create**

In `packages/core/src/storage/FileSessionStore.ts`, update the `create` method:

```typescript
async create(input: CreateSessionInput): Promise<PersistedSession> {
  await this.ensureDir();
  const now = input.createdAt ?? new Date().toISOString();
  const session: PersistedSession = {
    version: 1,
    metadata: {
      id: input.id,
      title: input.title ?? null,
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
      workspaceId: input.workspaceId ?? null,
      actionBinding: input.actionBinding,
    },
    messages: [],
    events: [],
  };
  await this.write(input.id, session);
  return session;
}
```

- [ ] **Step 6: Run TypeScript tests to verify no regressions**

Run: `bash ./scripts/test.sh`
Expected: All existing tests pass (workspaceId is optional, so no breakage).

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/storage/SessionRecord.ts packages/core/src/storage/SessionStore.ts packages/core/src/storage/InMemorySessionStore.ts packages/core/src/storage/FileSessionStore.ts packages/core/src/protocol/SessionMessage.ts
git commit -m "feat(core): add workspaceId to session metadata and protocol types"
```

---

## Task 2: Server-Side workspaceId Passthrough

**Files:**
- Modify: `apps/agent-server/src/SessionPersistence.ts:24-29`
- Modify: `apps/agent-server/src/SessionRouter.ts:121-174,273-281`
- Modify: `apps/agent-server/tests/session/SessionRouter.test.ts`

- [ ] **Step 1: Write failing test for workspace-aware session creation**

Add to `apps/agent-server/tests/session/SessionRouter.test.ts`:

```typescript
it("passes workspaceId through create and includes it in list response", async () => {
  const store = new InMemorySessionStore();
  const persistence = new SessionPersistence(
    store,
    () => "2026-05-22T00:00:00.000Z",
  );
  const router = new SessionRouter(
    { async handleUserMessage() {} },
    persistence,
    () => "2026-05-22T00:00:00.000Z",
  );
  const pushed: SessionMessage[] = [];

  await router.receive(
    {
      type: "create_session_request",
      sessionId: "",
      messageId: "create-1",
      timestamp: "2026-05-22T00:00:00.000Z",
      payload: { workspaceId: "ws-abc" },
    },
    (message) => pushed.push(message),
  );

  await router.receive(
    {
      type: "list_sessions_request",
      sessionId: "",
      messageId: "list-1",
      timestamp: "2026-05-22T00:00:00.000Z",
      payload: {},
    },
    (message) => pushed.push(message),
  );

  const listResponse = pushed.find((m) => m.type === "list_sessions_response");
  expect(listResponse).toBeDefined();
  if (listResponse?.type === "list_sessions_response") {
    expect(listResponse.payload.sessions[0].workspaceId).toBe("ws-abc");
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash ./scripts/test.sh`
Expected: FAIL — `workspaceId` not passed through.

- [ ] **Step 3: Update SessionPersistence.createSession to accept workspaceId**

In `apps/agent-server/src/SessionPersistence.ts`:

```typescript
async createSession(
  title?: string,
  actionBinding?: SessionActionBinding,
  workspaceId?: string | null,
): Promise<PersistedSession> {
  const id = generateSessionId();
  return this.store.create({ id, title, createdAt: this.now(), workspaceId, actionBinding });
}
```

- [ ] **Step 4: Update SessionRouter.handleCreateSession to pass workspaceId**

In `apps/agent-server/src/SessionRouter.ts`, in `handleCreateSession`:

```typescript
const session = await this.persistence.createSession(
  undefined,
  actionBinding,
  message.payload.workspaceId,
);
```

- [ ] **Step 5: Update toSessionListEntry to include workspaceId**

In `apps/agent-server/src/SessionRouter.ts`:

```typescript
function toSessionListEntry(summary: SessionSummary): SessionListEntry {
  return {
    id: summary.id,
    title: summary.title,
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt,
    messageCount: summary.messageCount,
    workspaceId: summary.workspaceId,
  };
}
```

- [ ] **Step 6: Update SessionSummary type to include workspaceId**

In `packages/core/src/storage/SessionStore.ts`, update `SessionSummary`:

```typescript
export type SessionSummary = Pick<
  SessionMetadata,
  "id" | "title" | "createdAt" | "updatedAt" | "messageCount" | "workspaceId"
>;
```

- [ ] **Step 7: Run tests to verify pass**

Run: `bash ./scripts/test.sh`
Expected: All tests pass including the new one.

- [ ] **Step 8: Commit**

```bash
git add apps/agent-server/src/SessionPersistence.ts apps/agent-server/src/SessionRouter.ts apps/agent-server/tests/session/SessionRouter.test.ts packages/core/src/storage/SessionStore.ts
git commit -m "feat(agent-server): pass workspaceId through session create and list"
```

---

## Task 3: Swift Client — SessionListItem and Socket Changes

**Files:**
- Modify: `apps/desktop/Sources/SessionWindow/SessionSocketClient.swift`
- Modify: `apps/desktop/TestsSwift/SessionWindow/SessionSocketClientTests.swift`

- [ ] **Step 1: Add workspaceId to SessionListItem**

In `SessionSocketClient.swift`, update `SessionListItem`:

```swift
struct SessionListItem: Equatable, Identifiable {
    let id: String
    let title: String?
    let updatedAt: String
    let messageCount: Int
    let workspaceId: String?
}
```

- [ ] **Step 2: Update IncomingSessionListItem to decode workspaceId**

In `SessionSocketClient.swift`, update the private struct:

```swift
private struct IncomingSessionListItem: Decodable {
    let id: String
    let title: String?
    let updatedAt: String?
    let messageCount: Int?
    let workspaceId: String?
}
```

- [ ] **Step 3: Update decodeEvent to map workspaceId**

In `SessionSocketClient.swift`, in the `list_sessions_response` case:

```swift
case "list_sessions_response":
    let items = envelope.payload.sessions?.map {
        SessionListItem(
            id: $0.id,
            title: $0.title,
            updatedAt: $0.updatedAt ?? "",
            messageCount: $0.messageCount ?? 0,
            workspaceId: $0.workspaceId
        )
    } ?? []
    return .sessionList(sessions: items)
```

- [ ] **Step 4: Add workspaceId parameter to sendCreateSession**

In `SessionSocketClient.swift`:

```swift
func sendCreateSession(
    initialText: String? = nil,
    attachments: [UserMessageAttachmentPayload] = [],
    actionBinding: ActionBindingPayload? = nil,
    workspaceId: String? = nil
) {
    let payload: [String: Any?] = [
        "initialText": initialText,
        "attachments": attachments.isEmpty ? nil : attachments.map(\.jsonObject),
        "actionBinding": actionBinding?.jsonObject,
        "workspaceId": workspaceId,
    ]
    sendJSON([
        "type": "create_session_request",
        "sessionId": "",
        "messageId": UUID().uuidString,
        "timestamp": Self.timestamp(),
        "payload": payload.compactMapValues { $0 },
    ])
}
```

- [ ] **Step 5: Write test for workspaceId decoding**

Add to `SessionSocketClientTests.swift`:

```swift
func testSessionListResponseDecodesWorkspaceId() {
    let transport = RecordingSessionSocketTransport()
    let client = SessionSocketClient(
        serverURL: URL(string: "ws://127.0.0.1:4317/api/session")!,
        transport: transport,
        reconnectDelay: 0
    )
    var receivedItems: [SessionListItem] = []
    client.onEvent = { event in
        if case .sessionList(let sessions) = event {
            receivedItems = sessions
        }
    }

    let json = """
    {
      "type": "list_sessions_response",
      "sessionId": "",
      "messageId": "m1",
      "timestamp": "2026-05-22T00:00:00.000Z",
      "payload": {
        "sessions": [
          {"id": "s1", "title": "hello", "updatedAt": "2026-05-22T00:00:00.000Z", "messageCount": 2, "workspaceId": "ws-123"},
          {"id": "s2", "title": "world", "updatedAt": "2026-05-22T00:00:00.000Z", "messageCount": 1, "workspaceId": null}
        ]
      }
    }
    """
    client.handleIncomingTextForTesting(json, currentSessionID: "")

    XCTAssertEqual(receivedItems.count, 2)
    XCTAssertEqual(receivedItems[0].workspaceId, "ws-123")
    XCTAssertNil(receivedItems[1].workspaceId)
}
```

- [ ] **Step 6: Run Swift tests**

Run: `bash ./scripts/swiftw test`
Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/Sources/SessionWindow/SessionSocketClient.swift apps/desktop/TestsSwift/SessionWindow/SessionSocketClientTests.swift
git commit -m "feat(desktop): add workspaceId to SessionListItem and sendCreateSession"
```

---

## Task 4: SessionWindowViewModel — workspaceId-Aware Creation

**Files:**
- Modify: `apps/desktop/Sources/SessionWindow/SessionWindowViewModel.swift`
- Modify: `apps/desktop/TestsSwift/SessionWindow/SessionWindowViewModelTests.swift`

- [ ] **Step 1: Add workspaceId to createNewSession and createTabWithInitialPrompt**

In `SessionWindowViewModel.swift`:

```swift
func createNewSession(workspaceId: String? = nil) {
    historySocketClient.sendCreateSession(workspaceId: workspaceId)
}

func createTabWithInitialPrompt(
    _ text: String,
    attachments: [UserMessageAttachmentPayload] = [],
    actionBinding: ActionBindingPayload? = nil,
    workspaceId: String? = nil
) {
    let trimmedText = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedText.isEmpty else { return }

    pendingCreatedSessionPrompt = PendingCreatedSessionPrompt(
        text: trimmedText,
        attachments: attachments,
        actionBinding: actionBinding
    )
    historySocketClient.sendCreateSession(actionBinding: actionBinding, workspaceId: workspaceId)
}
```

- [ ] **Step 2: Write test for createNewSession with workspaceId**

Add to `SessionWindowViewModelTests.swift`:

```swift
@MainActor
func testCreateNewSessionSendsWorkspaceId() {
    let historyTransport = RecordingSessionSocketTransport()
    let model = SessionWindowViewModel(
        socketFactory: { _ in .noop },
        historySocketClient: SessionSocketClient(
            serverURL: URL(string: "ws://127.0.0.1:4317/api/session")!,
            transport: historyTransport,
            reconnectDelay: 0
        )
    )

    model.createNewSession(workspaceId: "ws-abc")

    let sentMessages = historyTransport.tasks[0].sentMessages
    let createMsg = sentMessages.last { $0["type"] as? String == "create_session_request" }
    let payload = createMsg?["payload"] as? [String: Any]
    XCTAssertEqual(payload?["workspaceId"] as? String, "ws-abc")
}
```

- [ ] **Step 3: Run Swift tests**

Run: `bash ./scripts/swiftw test`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/Sources/SessionWindow/SessionWindowViewModel.swift apps/desktop/TestsSwift/SessionWindow/SessionWindowViewModelTests.swift
git commit -m "feat(desktop): add workspaceId param to session creation methods"
```

---

## Task 5: Refactor SessionHistorySidebarView — Grouped Layout

**Files:**
- Modify: `apps/desktop/Sources/SessionWindow/SessionHistorySidebarView.swift`
- Modify: `apps/desktop/Sources/SessionWindow/SessionWindowView.swift`
- Modify: `apps/desktop/Sources/Coordinator/SessionWindowLifecycle.swift`

- [ ] **Step 1: Update SessionHistorySidebarView interface to accept workspaces**

Replace the current struct definition with:

```swift
struct SessionHistorySidebarView: View {
    let items: [SessionListItem]
    let workspaces: [WorkspaceEntry]
    let activeSessionID: String?
    let onSelect: (String) -> Void
    let onRequestDelete: (String) -> Void
    let onNewSession: () -> Void
    let onNewSessionInWorkspace: (String) -> Void

    @Environment(\.appTheme) private var theme
    @State private var searchText = ""
    @State private var isSearching = false
    @State private var expandedWorkspaces: Set<String> = []
```

- [ ] **Step 2: Replace scrollableContent with grouped layout**

Replace the `scrollableContent` computed property:

```swift
private var scrollableContent: some View {
    ScrollView {
        LazyVStack(alignment: .leading, spacing: theme.spacing.xs) {
            if isSearching && !searchText.isEmpty {
                ForEach(filteredItems) { item in
                    sessionRow(item)
                }
            } else {
                workspaceSections
                defaultSection
            }
        }
        .padding(.horizontal, theme.spacing.sm)
        .padding(.vertical, theme.spacing.xs)
    }
    .frame(maxHeight: .infinity)
}
```

- [ ] **Step 3: Add workspaceSections computed property**

```swift
private var workspaceSections: some View {
    ForEach(workspaces.filter { !$0.isDefault }) { workspace in
        VStack(alignment: .leading, spacing: 0) {
            workspaceHeader(workspace)
            if expandedWorkspaces.contains(workspace.id) {
                let sessions = items.filter { $0.workspaceId == workspace.id }
                ForEach(sessions) { item in
                    sessionRow(item)
                        .padding(.leading, theme.spacing.md)
                }
            }
        }
    }
}
```

- [ ] **Step 4: Add workspaceHeader view builder**

```swift
private func workspaceHeader(_ workspace: WorkspaceEntry) -> some View {
    HStack(spacing: theme.spacing.sm) {
        Button(action: { toggleWorkspace(workspace.id) }) {
            HStack(spacing: theme.spacing.sm) {
                Image(systemName: expandedWorkspaces.contains(workspace.id) ? "chevron.down" : "chevron.right")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(theme.colors.textSecondary)
                    .frame(width: 12)
                Image(systemName: "folder")
                    .font(.system(size: 13))
                    .foregroundStyle(theme.colors.textSecondary)
                Text(workspace.name)
                    .font(theme.typography.bodyFont)
                    .foregroundStyle(theme.colors.textPrimary)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, theme.spacing.md)
            .padding(.vertical, theme.spacing.sm)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)

        Button(action: { onNewSessionInWorkspace(workspace.id) }) {
            Image(systemName: "plus")
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(theme.colors.textSecondary)
                .frame(width: 24, height: 24)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help("在 \(workspace.name) 中新建对话")
        .padding(.trailing, theme.spacing.sm)
    }
    .background(theme.colors.surface)
    .clipShape(RoundedRectangle(cornerRadius: theme.radius.md))
}
```

- [ ] **Step 5: Add defaultSection computed property**

```swift
private var defaultSection: some View {
    let defaultSessions = items.filter { $0.workspaceId == nil }
    return Group {
        if !defaultSessions.isEmpty {
            if !workspaces.filter({ !$0.isDefault }).isEmpty {
                HStack(spacing: theme.spacing.sm) {
                    Rectangle()
                        .fill(theme.colors.border)
                        .frame(height: 0.5)
                    Text("默认")
                        .font(theme.typography.captionFont)
                        .foregroundStyle(theme.colors.textSecondary)
                    Rectangle()
                        .fill(theme.colors.border)
                        .frame(height: 0.5)
                }
                .padding(.horizontal, theme.spacing.md)
                .padding(.vertical, theme.spacing.sm)
            }

            ForEach(defaultSessions) { item in
                sessionRow(item)
            }
        }
    }
}
```

- [ ] **Step 6: Extract sessionRow helper**

```swift
private func sessionRow(_ item: SessionListItem) -> some View {
    SessionHistoryRowView(
        item: item,
        isActive: activeSessionID == item.id,
        onSelect: { onSelect(item.id) }
    )
    .contextMenu {
        Button("删除", role: .destructive) {
            onRequestDelete(item.id)
        }
    }
}
```

- [ ] **Step 7: Add toggleWorkspace helper**

```swift
private func toggleWorkspace(_ id: String) {
    if expandedWorkspaces.contains(id) {
        expandedWorkspaces.remove(id)
    } else {
        expandedWorkspaces.insert(id)
    }
}
```

- [ ] **Step 8: Update SessionWindowView to pass workspaces**

In `SessionWindowView.swift`, add a property and update the sidebar call:

```swift
struct SessionWindowView: View {
    @Bindable var viewModel: SessionWindowViewModel
    let workspaces: [WorkspaceEntry]
    @Environment(\.appTheme) private var theme
    @State private var draft = ""

    var body: some View {
        HStack(spacing: 0) {
            SessionHistorySidebarView(
                items: viewModel.historyList,
                workspaces: workspaces,
                activeSessionID: viewModel.activeTab?.sessionID,
                onSelect: viewModel.openHistorySession,
                onRequestDelete: viewModel.requestDeleteSession,
                onNewSession: { viewModel.createNewSession() },
                onNewSessionInWorkspace: { wsId in viewModel.createNewSession(workspaceId: wsId) }
            )
            .frame(width: 240)
            // ... rest unchanged
```

- [ ] **Step 9: Update ProductionSessionWindowPresenter to inject workspaces**

In `apps/desktop/Sources/AppServices/AppServicesProductionImpls.swift`, update the `present` method. The `SessionWindowPresenting` protocol and `ProductionSessionWindowPresenter` need to provide workspaces.

First, update the protocol in `AppServices.swift` to include a workspace source, or simply have `SessionWindowView` read workspaces from a shared `WorkspaceSettingsViewModel` via Environment.

Simpler approach — make `SessionWindowView` own a `WorkspaceSettingsViewModel`:

```swift
struct SessionWindowView: View {
    @Bindable var viewModel: SessionWindowViewModel
    @Environment(\.appTheme) private var theme
    @State private var draft = ""
    @State private var workspaceVM = WorkspaceSettingsViewModel()

    var body: some View {
        HStack(spacing: 0) {
            SessionHistorySidebarView(
                items: viewModel.historyList,
                workspaces: workspaceVM.workspaces,
                activeSessionID: viewModel.activeTab?.sessionID,
                onSelect: viewModel.openHistorySession,
                onRequestDelete: viewModel.requestDeleteSession,
                onNewSession: { viewModel.createNewSession() },
                onNewSessionInWorkspace: { wsId in viewModel.createNewSession(workspaceId: wsId) }
            )
            .frame(width: 240)

            SessionWorkspaceView(
                tabs: viewModel.tabs,
                activeTabID: viewModel.activeTabID,
                activeTab: viewModel.activeTab,
                draft: $draft,
                onActivateTab: viewModel.activateTab,
                onCloseTab: viewModel.closeTab,
                onNewTab: { viewModel.createNewSession() },
                onStopActiveTab: viewModel.stopActiveTab,
                onSendPrompt: { text in viewModel.sendPrompt(text) }
            )
        }
        .background(theme.colors.background)
        .alert("删除会话？", isPresented: pendingHistoryDeleteBinding) {
            Button("取消", role: .cancel) {
                viewModel.cancelDeleteSession()
            }
            Button("删除", role: .destructive) {
                viewModel.confirmDeleteSession()
            }
        } message: {
            Text("删除后无法恢复本地历史文件。")
        }
        .onAppear {
            workspaceVM.reload()
        }
    }

    private var pendingHistoryDeleteBinding: Binding<Bool> {
        Binding(
            get: { viewModel.pendingHistoryDeletionID != nil },
            set: { isPresented in
                if !isPresented { viewModel.cancelDeleteSession() }
            }
        )
    }
}
```

This approach avoids changing the presenter protocol — `SessionWindowView` creates its own `WorkspaceSettingsViewModel` and reads the workspace list on appear.

- [ ] **Step 10: Run Swift build and tests**

Run: `bash ./scripts/swiftw build && bash ./scripts/swiftw test`
Expected: Build succeeds, all tests pass.

- [ ] **Step 11: Commit**

```bash
git add apps/desktop/Sources/SessionWindow/SessionHistorySidebarView.swift apps/desktop/Sources/SessionWindow/SessionWindowView.swift
git commit -m "feat(desktop): refactor sidebar to group sessions by workspace"
```

---

## Task 6: Final Verification and Docs

**Files:**
- Modify: `docs/manual-qa.md`
- Modify: `apps/desktop/Sources/SessionWindow/session-window.md`

- [ ] **Step 1: Run full test suite**

Run: `bash ./scripts/test.sh && bash ./scripts/swiftw test`
Expected: All tests pass.

- [ ] **Step 2: Run Swift build**

Run: `bash ./scripts/swiftw build`
Expected: Build succeeds.

- [ ] **Step 3: Update session-window.md**

Add a note about the sidebar's workspace grouping behavior to the module doc.

- [ ] **Step 4: Add manual QA items to docs/manual-qa.md**

Add entries:
- 侧边栏 workspace 分组：workspace 列表正确显示，点击展开/折叠
- workspace 行右侧 "+" 按钮：点击后在该 workspace 下创建新对话
- 默认分组：无 workspaceId 的会话显示在 "默认" 分隔线下方
- 搜索模式：搜索时忽略分组，平铺显示匹配结果
- 空 workspace：无会话的 workspace 仍然显示

- [ ] **Step 5: Commit**

```bash
git add docs/manual-qa.md apps/desktop/Sources/SessionWindow/session-window.md
git commit -m "docs: update session-window docs and manual-qa for workspace grouping"
```

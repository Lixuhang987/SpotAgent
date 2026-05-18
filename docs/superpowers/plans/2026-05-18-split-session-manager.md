# Split SessionManager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 agent-server 的 `SessionManager` 拆成 `SessionRouter`、`SessionRuntimeOrchestrator`、`SessionPersistence`、`MessageTranslator` 四个边界清晰的模块。

**Architecture:** `SessionRouter` 只处理 `SessionMessage` 协议分派和响应格式；`SessionRuntimeOrchestrator` 拥有一轮 `user_message` 的 runtime 生命周期；`SessionPersistence` 是唯一直接持有 `SessionStore` 的模块；`MessageTranslator` 保持纯函数翻译层。`server.ts` 作为组合根负责创建 store、runtime、persistence、orchestrator、router。

**Tech Stack:** TypeScript、Vitest、Node WebSocket server、`packages/core` 的 runtime/protocol/storage 类型。

---

### Task 1: RED 测试拆分

**Files:**
- Create: `apps/agent-server/src/SessionPersistence.test.ts`
- Create: `apps/agent-server/src/SessionRuntimeOrchestrator.test.ts`
- Create: `apps/agent-server/src/SessionRouter.test.ts`
- Create: `apps/agent-server/src/MessageTranslator.test.ts`
- Modify: `scripts/test.sh`
- Delete later: `apps/agent-server/src/SessionManager.test.ts`

- [ ] **Step 1: 写 SessionPersistence failing tests**

覆盖 `createSession` / `renameSession` / `listSessions` / `deleteSession`、`persistUserMessage` + `autoTitle`、`getMessages`、`getConversationMessages`、`persistRunResult`、`persistError`。测试从 `./SessionPersistence.ts` 导入 `SessionPersistence`，因此在模块创建前应失败。

```typescript
import { describe, expect, it } from "vitest";
import { InMemorySessionStore } from "../../../packages/core/src/storage/index.ts";
import { SessionPersistence } from "./SessionPersistence.ts";

describe("SessionPersistence", () => {
  it("wraps session CRUD operations", async () => {
    const persistence = new SessionPersistence(
      new InMemorySessionStore(),
      () => "2026-05-17T00:00:00.000Z",
    );

    const session = await persistence.createSession("测试会话");
    await persistence.renameSession(session.metadata.id, "新标题");
    expect((await persistence.getSession(session.metadata.id))?.metadata.title).toBe("新标题");
    expect(await persistence.listSessions()).toHaveLength(1);
    await persistence.deleteSession(session.metadata.id);
    expect(await persistence.getSession(session.metadata.id)).toBeNull();
  });
});
```

- [ ] **Step 2: 写 SessionRuntimeOrchestrator failing tests**

覆盖用户消息写入、历史回传、assistant 流式事件推送、`tool_message` 推送、tool audit 事件落库、runtime error 推送与落库、`runOptions.sessionId` 透传。

```typescript
import { SessionRuntimeOrchestrator } from "./SessionRuntimeOrchestrator.ts";
import { SessionPersistence } from "./SessionPersistence.ts";
```

- [ ] **Step 3: 写 SessionRouter failing tests**

覆盖 `list_sessions_request`、`load_session_request`、`delete_session_request`、`user_message` 分派，以及 `handleSocketMessage(router, socket, raw)` 输出 JSON。

```typescript
import { SessionRouter } from "./SessionRouter.ts";
import { handleSocketMessage } from "./server.ts";
```

- [ ] **Step 4: 写 MessageTranslator tests**

覆盖 `toSessionMessage` 的 assistant/tool 翻译、`toAuditEvent` 的 tool 事件、`composeUserContent`、`deriveTitle`、`agentMessagesToConversation`。这些测试应在 RED 阶段通过或保持通过，因为该模块已存在；它们用于锁定“新增 tool_message 只改 translator”的边界。

- [ ] **Step 5: 更新 test.sh 并运行 RED**

```bash
bash ./scripts/test.sh
```

Expected: FAIL，原因是 `SessionPersistence.ts`、`SessionRuntimeOrchestrator.ts`、`SessionRouter.ts` 尚不存在，或 `server.ts` 尚未暴露 router 类型。

### Task 2: 实现 SessionPersistence

**Files:**
- Create: `apps/agent-server/src/SessionPersistence.ts`

- [ ] **Step 1: 创建类和 CRUD 方法**

实现构造函数、`createSession`、`deleteSession`、`renameSession`、`listSessions`、`getSession`，并把 `generateSessionId()` 留在此文件内。

- [ ] **Step 2: 实现高层持久化方法**

实现 `ensureSession`、`persistUserMessage`、`autoTitle`、`getMessages`、`getConversationMessages`、`persistRunResult`、`persistError`。`persistUserMessage` 使用 `composeUserContent`，`autoTitle` 使用 `deriveTitle`，`getConversationMessages` 使用 `agentMessagesToConversation`。

- [ ] **Step 3: 跑单文件验证**

```bash
pnpm exec vitest run apps/agent-server/src/SessionPersistence.test.ts
```

Expected: PASS。

### Task 3: 实现 SessionRuntimeOrchestrator

**Files:**
- Create: `apps/agent-server/src/SessionRuntimeOrchestrator.ts`

- [ ] **Step 1: 定义 RuntimeLike 与 handleUserMessage**

`handleUserMessage` 按 `ensureSession → persistUserMessage → autoTitle → getMessages → runtime.runWithMessages → persistRunResult` 顺序执行，并把 `{ sessionId }` 传入 runtime run options。

- [ ] **Step 2: 翻译 runtime events**

runtime callback 调用 `toSessionMessage(sessionId, event, now())`，非空则 `push`；调用 `toAuditEvent(event, now())`，非空则收集到 `events`，最终交给 `persistRunResult`。

- [ ] **Step 3: 处理 runtime error**

catch 中使用 `toErrorMessage(error)` 生成 `error` 协议帧，并调用 `persistence.persistError(sessionId, message)`。

- [ ] **Step 4: 跑单文件验证**

```bash
pnpm exec vitest run apps/agent-server/src/SessionRuntimeOrchestrator.test.ts
```

Expected: PASS。

### Task 4: 实现 SessionRouter 并接入 server.ts

**Files:**
- Create: `apps/agent-server/src/SessionRouter.ts`
- Modify: `apps/agent-server/src/server.ts`
- Delete: `apps/agent-server/src/SessionManager.ts`

- [ ] **Step 1: 创建 SessionRouter**

导出 `PushMessage` 类型。`receive` 使用 switch 分派：CRUD request 由 router 格式化响应，`user_message` 委托 `orchestrator.handleUserMessage(message, push)`，其它类型直接忽略。保留 `createSession`、`deleteSession`、`renameSession`、`listSessions`、`getSession`、`getSessionHistory` 便利方法，全部委托 persistence。

- [ ] **Step 2: 改 server.ts 组合根**

`startServer` 与 `handleSocketMessage` 参数改为 `router: SessionRouter`。`startDefaultServer` 构造 `SessionPersistence(store)`、`SessionRuntimeOrchestrator(runtime, persistence)`、`SessionRouter(orchestrator, persistence)`，再传给 `startServer`。

- [ ] **Step 3: 删除 SessionManager.ts**

确认代码中不再 import `./SessionManager.ts`。

- [ ] **Step 4: 跑 router 验证**

```bash
pnpm exec vitest run apps/agent-server/src/SessionRouter.test.ts
```

Expected: PASS。

### Task 5: 文档与全量验证

**Files:**
- Modify: `apps/agent-server/agent-server.md`
- Modify: `docs/TODO.md`
- Modify: `handAgent.md`
- Modify as needed: `apps/apps.md`
- Modify as needed: `packages/core/src/conversation/conversation.md`
- Modify as needed: `packages/core/src/protocol/protocol.md`
- Modify as needed: `packages/core/src/runtime/runtime.md`
- Modify as needed: `packages/core/src/storage/storage.md`

- [ ] **Step 1: 更新文档引用**

把 `SessionManager` 作为实现类的引用替换为 `SessionRouter + SessionRuntimeOrchestrator + SessionPersistence + MessageTranslator`。历史设计稿中的 `SessionManager` 可作为历史记录保留。

- [ ] **Step 2: 勾选 TODO 10.5**

把 `docs/TODO.md` 中 10.5 从 `[ ]` 改为 `[x]`，并保留验收说明。

- [ ] **Step 3: 跑全量 TypeScript 验证**

```bash
bash ./scripts/test.sh
```

Expected: PASS。

- [ ] **Step 4: 跑 Swift 验证**

```bash
bash ./scripts/swiftw test
bash ./scripts/swiftw build
```

Expected: PASS。

- [ ] **Step 5: 提交并按仓库约定合并清理**

```bash
git status --short
git add <changed-files>
git commit -m "refactor(agent-server): split session manager"
```

回到主 checkout 后执行非破坏性合并；合并完成后删除 `.worktrees/split-session-manager` worktree 与 `codex/split-session-manager` 分支。

# 设计：拆 SessionManager（god class → 4 个模块）

对应 TODO 10.5。

## 背景

`SessionManager`（208 行）在 commit 9a3ab8b 中已抽出 `MessageTranslator`（175 行纯函数），但仍同时承担协议路由、runtime 编排、持久化三项职责。本次拆分将其分解为 3 个新模块 + 已有的 MessageTranslator，共 4 个。

## 决策记录

| 决策点 | 选择 | 理由 |
|--------|------|------|
| SessionManager 是否保留 | 否，重命名为 SessionRouter | 减少概念数量，Router 即 facade |
| SessionPersistence 粒度 | 完整会话仓库（高层方法） | Orchestrator 不需要知道 store 调用顺序 |
| Orchestrator pushMessage | 每次调用传入 | 无状态，易测试 |
| 编排方案 | A：Orchestrator 拥有完整 turn | Router 极薄，编排内聚 |

## 模块设计

### 1. SessionRouter（原 SessionManager）

**文件**：`apps/agent-server/src/SessionRouter.ts`
**职责**：接收 `SessionMessage`，按 `type` 分派到对应处理器。
**预估行数**：~60 行。

```typescript
import type { SessionMessage } from "packages/core/src/protocol/SessionMessage.ts";
import type { SessionRuntimeOrchestrator } from "./SessionRuntimeOrchestrator.ts";
import type { SessionPersistence } from "./SessionPersistence.ts";

type PushMessage = (message: SessionMessage) => void;

export class SessionRouter {
  constructor(
    private readonly orchestrator: SessionRuntimeOrchestrator,
    private readonly persistence: SessionPersistence,
  ) {}

  async receive(message: SessionMessage, push: PushMessage): Promise<void> {
    switch (message.type) {
      case "list_sessions_request":
        return this.handleListSessions(message, push);
      case "load_session_request":
        return this.handleLoadSession(message, push);
      case "delete_session_request":
        return this.handleDeleteSession(message);
      case "user_message":
        return this.orchestrator.handleUserMessage(message, push);
      default:
        return;
    }
  }

  // CRUD 响应格式化，委托 persistence 获取数据
  private async handleListSessions(message, push) { /* ... */ }
  private async handleLoadSession(message, push) { /* ... */ }
  private async handleDeleteSession(message) { /* ... */ }

  // 便利方法（保持 server.ts 兼容）
  async createSession(title?: string) { return this.persistence.createSession(title); }
  async deleteSession(sessionId: string) { return this.persistence.deleteSession(sessionId); }
  async renameSession(sessionId: string, title: string) { return this.persistence.renameSession(sessionId, title); }
  async listSessions() { return this.persistence.listSessions(); }
  async getSession(sessionId: string) { return this.persistence.getSession(sessionId); }
  async getSessionHistory(sessionId: string) { return this.persistence.getMessages(sessionId); }
}
```

**关键约束**：
- Router 不持有 runtime 引用，不直接调用 store。
- 新增消息类型只需在 switch 中加一个 case。
- CRUD 响应的 JSON 格式化（如 `list_sessions_response` 的 payload 结构）由 Router 负责，因为这是协议层关注点。

### 2. SessionRuntimeOrchestrator

**文件**：`apps/agent-server/src/SessionRuntimeOrchestrator.ts`
**职责**：编排一轮 `user_message` 的完整生命周期（persist → run → persist）。
**预估行数**：~70 行。

```typescript
import type { AgentMessage } from "packages/core/src/runtime/AgentMessage.ts";
import type { AgentRuntimeEvent, AgentRuntimeRunOptions, AgentRunResult } from "packages/core/src/runtime/AgentRuntime.ts";
import type { SessionMessage } from "packages/core/src/protocol/SessionMessage.ts";
import type { SessionEvent } from "packages/core/src/storage/index.ts";
import type { SessionPersistence } from "./SessionPersistence.ts";
import { toSessionMessage, toAuditEvent, toErrorMessage } from "./MessageTranslator.ts";

type RuntimeLike = {
  runWithMessages(
    messages: AgentMessage[],
    onEvent: (event: AgentRuntimeEvent) => void,
    runOptions?: AgentRuntimeRunOptions,
  ): Promise<AgentRunResult>;
};

type PushMessage = (message: SessionMessage) => void;

export class SessionRuntimeOrchestrator {
  constructor(
    private readonly runtime: RuntimeLike,
    private readonly persistence: SessionPersistence,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async handleUserMessage(
    message: Extract<SessionMessage, { type: "user_message" }>,
    push: PushMessage,
  ): Promise<void> {
    const { sessionId } = message;

    // 1. 确保 session 存在
    await this.persistence.ensureSession(sessionId);

    // 2. 持久化 user message
    await this.persistence.persistUserMessage(
      sessionId,
      message.payload.text,
      message.payload.attachments,
    );

    // 3. 自动生成标题（首条消息时）
    await this.persistence.autoTitle(sessionId, message.payload.text);

    // 4. 获取完整历史，跑 runtime
    const history = await this.persistence.getMessages(sessionId);

    try {
      const events: SessionEvent[] = [];
      const result = await this.runtime.runWithMessages(
        history,
        (event) => {
          const sessionMsg = toSessionMessage(sessionId, event, this.now());
          if (sessionMsg) push(sessionMsg);
          const audit = toAuditEvent(event, this.now());
          if (audit) events.push(audit);
        },
        { sessionId },
      );

      // 5. 持久化 runtime 结果
      await this.persistence.persistRunResult(sessionId, result.messages, events);
    } catch (error) {
      // 6. 错误处理：推送 error frame + 持久化 error event
      push({
        type: "error",
        sessionId,
        messageId: `${sessionId}-error`,
        timestamp: this.now(),
        payload: { message: toErrorMessage(error) },
      });
      await this.persistence.persistError(sessionId, toErrorMessage(error));
    }
  }
}
```

**关键约束**：
- 不直接持有 store 引用，通过 SessionPersistence 操作数据。
- `pushMessage` 每次调用传入，Orchestrator 无连接状态。
- 错误处理包含推送 + 持久化两步，都在 Orchestrator 内完成。

### 3. SessionPersistence

**文件**：`apps/agent-server/src/SessionPersistence.ts`
**职责**：所有 store 操作的高层封装，隐藏 store 接口细节和调用顺序。
**预估行数**：~80 行。

```typescript
import type { SessionStore, SessionSummary, SessionEvent, PersistedSession } from "packages/core/src/storage/index.ts";
import type { AgentMessage } from "packages/core/src/runtime/AgentMessage.ts";
import { composeUserContent, deriveTitle, agentMessagesToConversation } from "./MessageTranslator.ts";

export class SessionPersistence {
  constructor(
    private readonly store: SessionStore,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  // --- CRUD ---
  async createSession(title?: string): Promise<PersistedSession> {
    const id = generateSessionId();
    return this.store.create({ id, title, createdAt: this.now() });
  }

  async deleteSession(sessionId: string): Promise<void> {
    return this.store.delete(sessionId);
  }

  async renameSession(sessionId: string, title: string): Promise<void> {
    return this.store.updateTitle(sessionId, title);
  }

  async listSessions(): Promise<SessionSummary[]> {
    return this.store.list();
  }

  async getSession(sessionId: string): Promise<PersistedSession | null> {
    return this.store.get(sessionId);
  }

  // --- 高层操作 ---
  async ensureSession(sessionId: string): Promise<void> {
    const existing = await this.store.get(sessionId);
    if (!existing) {
      await this.store.create({ id: sessionId, createdAt: this.now() });
    }
  }

  async persistUserMessage(
    sessionId: string,
    text: string,
    attachments?: Array<{ type: string; [key: string]: unknown }>,
  ): Promise<void> {
    const composedText = composeUserContent(text, attachments);
    const userMessage: AgentMessage = { role: "user", content: composedText };
    await this.store.appendMessages(sessionId, [userMessage], this.now());
  }

  async autoTitle(sessionId: string, text: string): Promise<void> {
    const session = await this.store.get(sessionId);
    if (!session) return;
    if (!session.metadata.title && session.messages.length === 1) {
      await this.store.updateTitle(sessionId, deriveTitle(text));
    }
  }

  async getMessages(sessionId: string): Promise<AgentMessage[]> {
    const session = await this.store.get(sessionId);
    return session?.messages ?? [];
  }

  async getConversationMessages(sessionId: string) {
    const session = await this.store.get(sessionId);
    return session ? agentMessagesToConversation(session.messages) : [];
  }

  async persistRunResult(
    sessionId: string,
    messages: AgentMessage[],
    events: SessionEvent[],
  ): Promise<void> {
    await this.store.setMessages(sessionId, messages, this.now());
    if (events.length > 0) {
      await this.store.appendEvents(sessionId, events);
    }
  }

  async persistError(sessionId: string, errorMessage: string): Promise<void> {
    await this.store.appendEvents(sessionId, [
      { type: "error", timestamp: this.now(), message: errorMessage },
    ]);
  }
}

function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
```

**关键约束**：
- 唯一持有 `SessionStore` 引用的模块。
- `composeUserContent` / `deriveTitle` / `agentMessagesToConversation` 从 MessageTranslator import（纯函数）。
- `autoTitle` 封装了"仅首条消息时生成标题"的业务规则。

### 4. MessageTranslator（已完成，不变）

**文件**：`apps/agent-server/src/MessageTranslator.ts`（175 行）
**职责**：纯函数，`AgentRuntimeEvent` ↔ `SessionMessage` / `SessionEvent` 翻译。
**不变**。

## 依赖图

```
server.ts (组合根)
  ├─ SessionPersistence(store, now)
  ├─ SessionRuntimeOrchestrator(runtime, persistence, now)
  └─ SessionRouter(orchestrator, persistence)
       │
       ├── receive(message, push) ──┐
       │                            │
       │  CRUD messages ───────────►│ persistence.listSessions / getSession / ...
       │  user_message ────────────►│ orchestrator.handleUserMessage(message, push)
       │                            │
       └────────────────────────────┘

SessionRuntimeOrchestrator
  ├─ persistence.ensureSession / persistUserMessage / autoTitle / getMessages / persistRunResult / persistError
  ├─ runtime.runWithMessages(...)
  └─ MessageTranslator.toSessionMessage / toAuditEvent / toErrorMessage (import)

SessionPersistence
  ├─ store (SessionStore interface)
  └─ MessageTranslator.composeUserContent / deriveTitle / agentMessagesToConversation (import)
```

## 共享类型

`PushMessage` 类型当前定义在 `SessionManager.ts`，拆分后由 `SessionRouter.ts` 导出（Router 是对外入口，定义协议层类型合理）。Orchestrator 和测试从 Router import 此类型。

```typescript
// SessionRouter.ts 导出
export type PushMessage = (message: SessionMessage) => void;
```

## server.ts 改动

```typescript
// 之前
import { SessionManager } from "./SessionManager.ts";
const manager = new SessionManager(runtime, pushMessage, { store, now });
// handleSocketMessage(manager, ...) 签名: manager: SessionManager

// 之后
import { SessionPersistence } from "./SessionPersistence.ts";
import { SessionRuntimeOrchestrator } from "./SessionRuntimeOrchestrator.ts";
import { SessionRouter } from "./SessionRouter.ts";

const persistence = new SessionPersistence(store, now);
const orchestrator = new SessionRuntimeOrchestrator(runtime, persistence, now);
const router = new SessionRouter(orchestrator, persistence);
// handleSocketMessage(router, ...) 签名改为: router: SessionRouter
```

## 测试拆分

| 新测试文件 | 来源 | 覆盖内容 |
|---|---|---|
| `SessionRouter.test.ts` | 原 "forwards websocket messages" + CRUD 相关 case | dispatch 正确性、CRUD 响应格式 |
| `SessionRuntimeOrchestrator.test.ts` | 原 "pushes assistant delta" + "passes history" + "error" + "tool_message" + "audit" case | 完整 turn 编排、流式推送、错误处理 |
| `SessionPersistence.test.ts` | 原 "lists sessions" + "exposes history" + "auto title" + "composes user content" case | CRUD、persistUserMessage、autoTitle、persistRunResult |
| `MessageTranslator.test.ts` | 原翻译相关 case（tool_message emit、audit event） | toSessionMessage / toAuditEvent / composeUserContent / deriveTitle |

原 `SessionManager.test.ts` 删除。

## 验收标准

1. `SessionManager.ts` 不再存在，替换为 `SessionRouter.ts` + `SessionRuntimeOrchestrator.ts` + `SessionPersistence.ts`
2. `SessionManager.test.ts` 拆为 4 个测试文件，所有原有 case 保留
3. `server.ts` 改为构造 Persistence → Orchestrator → Router，调用 `router.receive()`
4. 新增 `tool_message` 形态只需改 `MessageTranslator`，不需要动其他模块
5. `bash ./scripts/test.sh` 全量通过
6. `agent-server.md` 文档更新，反映新文件结构

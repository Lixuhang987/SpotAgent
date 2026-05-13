# Agent Local Streaming Bridge MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把当前前端直跑 `AgentRuntime` 的实现改造成“独立 Node Agent Server + 本地 WebSocket + SessionManager + 前端单份 messages 状态”的最小可运行闭环。

> **执行状态：** 本 worktree 已完成 Task 1-5 的实现与验证，以下条目保留为执行记录与回溯依据。

**Architecture:** `apps/desktop/Web/` 只负责 UI、WebSocket 连接与统一会话状态；`apps/agent-server/` 负责本地 Node 服务、`SessionManager` 和 runtime 驱动；`packages/core/` 负责协议类型、消息模型与可流式观察的 runtime。第一版只做内存 session，不实现持久化与历史查询，但保留 `sessionId` 和 `session_snapshot` 形态。

**Tech Stack:** TypeScript、React、Node.js、WebSocket、Vitest、Swift、WKWebView、Vercel AI SDK / OpenAI API

---

## 文件结构

- `apps/agent-server/package.json`
  - Node Agent Server 入口脚本与依赖声明。
- `apps/agent-server/src/server.ts`
  - 本地 WebSocket 服务启动与连接分发。
- `apps/agent-server/src/SessionManager.ts`
  - 单个 `SessionManager`，负责 session 内存状态、历史组装、runtime 调用与消息回推。
- `packages/core/src/protocol/SessionMessage.ts`
  - Web 与 Node 共用的单一消息协议类型定义。
- `packages/core/src/conversation/ConversationMessage.ts`
  - 前后端共用的标准 message 模型。
- `packages/core/src/runtime/AgentRuntime.ts`
  - 增加基于完整 `messages` 上下文运行与流式 sink。
- `packages/core/tests/runtime-stream.test.ts`
  - runtime 流式事件测试。
- `apps/desktop/Web/App.tsx`
  - 改为连接 WebSocket、维护统一 `messages` 状态、派生气泡视图。
- `apps/desktop/Web/bridge.ts`
  - 宿主注入的连接地址桥接。
- `apps/desktop/Web/BubbleList.tsx`
  - 从统一消息状态派生气泡展示。
- `apps/desktop/Web/PromptBox.tsx`
  - 输入消息并发出 `user_message`。
- `apps/desktop/Web/sessionState.ts`
  - 前端统一会话状态与 reducer。
- `apps/desktop/Web/sessionState.test.ts`
  - 前端状态归并与流式 delta 测试。
- `apps/desktop/HandAgentApp.swift`
  - 启动 Node Agent Server 并把 WebSocket 地址注入 WebView。
- `docs/superpowers/specs/2026-05-11-agent-local-streaming-bridge-design.md`
  - 当前设计稿，实施时保持同步。

### Task 1: 定义共享协议与消息模型

**Files:**
- Create: `packages/core/src/protocol/SessionMessage.ts`
- Create: `packages/core/src/conversation/ConversationMessage.ts`
- Test: `apps/desktop/Web/sessionState.test.ts`

- [ ] **Step 1: 写前端状态归并的失败测试**

```ts
import { describe, expect, it } from "vitest";
import { reduceSessionMessage, createEmptyConversationState } from "../sessionState";
import type { SessionMessage } from "../../../packages/core/src/protocol/SessionMessage";

describe("sessionState reducer", () => {
  it("merges assistant deltas into one assistant message", () => {
    const start: SessionMessage = {
      type: "assistant_message_start",
      sessionId: "s1",
      messageId: "m1",
      timestamp: "2026-05-11T00:00:00.000Z",
      payload: { role: "assistant" },
    };
    const deltaA: SessionMessage = {
      type: "assistant_message_delta",
      sessionId: "s1",
      messageId: "m1",
      timestamp: "2026-05-11T00:00:00.100Z",
      payload: { text: "你" },
    };
    const deltaB: SessionMessage = {
      type: "assistant_message_delta",
      sessionId: "s1",
      messageId: "m1",
      timestamp: "2026-05-11T00:00:00.200Z",
      payload: { text: "好" },
    };

    let state = createEmptyConversationState("s1");
    state = reduceSessionMessage(state, start);
    state = reduceSessionMessage(state, deltaA);
    state = reduceSessionMessage(state, deltaB);

    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]?.text).toBe("你好");
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd /Users/mu9/.config/superpowers/worktrees/handAgent/codex-use-env-openai-key/apps/desktop/Web && pnpm run test:hotkey -- sessionState.test.ts`

Expected: FAIL with `Cannot find module '../sessionState'` or missing exported members

- [ ] **Step 3: 定义共享协议类型**

```ts
export type SessionMessage =
  | {
      type: "open_session";
      sessionId: string;
      messageId: string;
      timestamp: string;
      payload: { workspaceRoot?: string };
    }
  | {
      type: "user_message";
      sessionId: string;
      messageId: string;
      timestamp: string;
      payload: { text: string; selection?: string | null };
    }
  | {
      type: "interrupt";
      sessionId: string;
      messageId: string;
      timestamp: string;
      payload: {};
    }
  | {
      type: "assistant_message_start";
      sessionId: string;
      messageId: string;
      timestamp: string;
      payload: { role: "assistant" };
    }
  | {
      type: "assistant_message_delta";
      sessionId: string;
      messageId: string;
      timestamp: string;
      payload: { text: string };
    }
  | {
      type: "assistant_message_end";
      sessionId: string;
      messageId: string;
      timestamp: string;
      payload: { status: "completed" };
    }
  | {
      type: "tool_message";
      sessionId: string;
      messageId: string;
      timestamp: string;
      payload: { name: string; text: string; status: "running" | "completed" | "failed" };
    }
  | {
      type: "status";
      sessionId: string;
      messageId: string;
      timestamp: string;
      payload: { value: "idle" | "running" | "failed" };
    }
  | {
      type: "error";
      sessionId: string;
      messageId: string;
      timestamp: string;
      payload: { message: string };
    }
  | {
      type: "session_snapshot";
      sessionId: string;
      messageId: string;
      timestamp: string;
      payload: {
        messages: ConversationMessage[];
        status: "idle" | "running" | "failed";
      };
    };
```

```ts
export type ConversationMessage = {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  text: string;
  status: "streaming" | "completed" | "failed";
  createdAt: string;
  updatedAt: string;
  toolCall?: {
    name: string;
  };
  error?: string;
};
```

- [ ] **Step 4: 让测试通过所需的最小前端状态 helper 先有空壳**

```ts
export type ConversationState = {
  sessionId: string;
  messages: ConversationMessage[];
  status: "idle" | "running" | "failed";
  error: string | null;
};

export function createEmptyConversationState(sessionId: string): ConversationState {
  return {
    sessionId,
    messages: [],
    status: "idle",
    error: null,
  };
}

export function reduceSessionMessage(
  state: ConversationState,
  message: SessionMessage,
): ConversationState {
  return state;
}
```

- [ ] **Step 5: 运行测试确认仍然失败但失败原因正确**

Run: `cd /Users/mu9/.config/superpowers/worktrees/handAgent/codex-use-env-openai-key/apps/desktop/Web && pnpm run test:hotkey -- sessionState.test.ts`

Expected: FAIL because text is `""` instead of `"你好"`

- [ ] **Step 6: 实现最小 reducer 逻辑**

```ts
export function reduceSessionMessage(
  state: ConversationState,
  message: SessionMessage,
): ConversationState {
  if (message.type === "assistant_message_start") {
    return {
      ...state,
      messages: [
        ...state.messages,
        {
          id: message.messageId,
          role: "assistant",
          text: "",
          status: "streaming",
          createdAt: message.timestamp,
          updatedAt: message.timestamp,
        },
      ],
    };
  }

  if (message.type === "assistant_message_delta") {
    return {
      ...state,
      messages: state.messages.map((item) =>
        item.id === message.messageId
          ? {
              ...item,
              text: `${item.text}${message.payload.text}`,
              updatedAt: message.timestamp,
            }
          : item
      ),
    };
  }

  return state;
}
```

- [ ] **Step 7: 运行测试确认通过**

Run: `cd /Users/mu9/.config/superpowers/worktrees/handAgent/codex-use-env-openai-key/apps/desktop/Web && pnpm run test:hotkey -- sessionState.test.ts`

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add /Users/mu9/.config/superpowers/worktrees/handAgent/codex-use-env-openai-key/packages/core/src/protocol/SessionMessage.ts /Users/mu9/.config/superpowers/worktrees/handAgent/codex-use-env-openai-key/packages/core/src/conversation/ConversationMessage.ts /Users/mu9/.config/superpowers/worktrees/handAgent/codex-use-env-openai-key/apps/desktop/Web/sessionState.ts /Users/mu9/.config/superpowers/worktrees/handAgent/codex-use-env-openai-key/apps/desktop/Web/sessionState.test.ts
git commit -m "feat: add shared session message protocol"
```

### Task 2: 让 AgentRuntime 支持基于完整 messages 运行并发出流式事件

**Files:**
- Modify: `packages/core/src/runtime/AgentRuntime.ts`
- Create: `packages/core/tests/runtime-stream.test.ts`

- [ ] **Step 1: 写 runtime 流式事件失败测试**

```ts
import { describe, expect, it } from "vitest";
import { AgentRuntime } from "../src/runtime/AgentRuntime";
import { ToolRegistry } from "../src/tools/ToolRegistry";

describe("AgentRuntime stream mode", () => {
  it("emits assistant stream events while completing a run", async () => {
    const emitted: string[] = [];
    const client = {
      async complete() {
        return {
          message: { role: "assistant", content: "done" },
          toolCalls: [],
        };
      },
    };

    const runtime = new AgentRuntime(client, new ToolRegistry());
    await runtime.runWithMessages(
      [{ role: "user", content: "测试" }],
      (event) => emitted.push(event.type),
    );

    expect(emitted).toEqual([
      "assistant_message_start",
      "assistant_message_delta",
      "assistant_message_end",
    ]);
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd /Users/mu9/.config/superpowers/worktrees/handAgent/codex-use-env-openai-key/apps/desktop/Web && pnpm exec vitest run /Users/mu9/.config/superpowers/worktrees/handAgent/codex-use-env-openai-key/packages/core/tests/runtime-stream.test.ts`

Expected: FAIL with `runtime.runWithMessages is not a function`

- [ ] **Step 3: 为 runtime 增加最小流式入口**

```ts
export type AgentRuntimeStreamEvent =
  | { type: "assistant_message_start"; messageId: string; text: string }
  | { type: "assistant_message_delta"; messageId: string; text: string }
  | { type: "assistant_message_end"; messageId: string };

async runWithMessages(
  messages: AgentMessage[],
  onEvent: (event: AgentRuntimeStreamEvent) => void,
): Promise<AgentRunResult> {
  const completion = await this.client.complete(messages, this.toolRegistry.list());
  const messageId = "assistant-1";
  onEvent({ type: "assistant_message_start", messageId, text: "" });
  onEvent({ type: "assistant_message_delta", messageId, text: completion.message.content });
  onEvent({ type: "assistant_message_end", messageId });
  return {
    messages: [...messages, completion.message],
    bubbles: [{ id: messageId, text: completion.message.content }],
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd /Users/mu9/.config/superpowers/worktrees/handAgent/codex-use-env-openai-key/apps/desktop/Web && pnpm exec vitest run /Users/mu9/.config/superpowers/worktrees/handAgent/codex-use-env-openai-key/packages/core/tests/runtime-stream.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add /Users/mu9/.config/superpowers/worktrees/handAgent/codex-use-env-openai-key/packages/core/src/runtime/AgentRuntime.ts /Users/mu9/.config/superpowers/worktrees/handAgent/codex-use-env-openai-key/packages/core/tests/runtime-stream.test.ts
git commit -m "feat: add runtime streaming entrypoint"
```

### Task 3: 实现本地 Node Agent Server 与 SessionManager

**Files:**
- Create: `apps/agent-server/package.json`
- Create: `apps/agent-server/src/server.ts`
- Create: `apps/agent-server/src/SessionManager.ts`
- Test: `packages/core/tests/runtime-stream.test.ts`

- [ ] **Step 1: 写 SessionManager 的失败测试**

```ts
import { describe, expect, it } from "vitest";
import { SessionManager } from "../../apps/agent-server/src/SessionManager";

describe("SessionManager", () => {
  it("stores a user message, rebuilds history, and streams assistant output", async () => {
    const pushed: string[] = [];
    const runtime = {
      async runWithMessages(messages, onEvent) {
        onEvent({ type: "assistant_message_start", messageId: "a1", text: "" });
        onEvent({ type: "assistant_message_delta", messageId: "a1", text: "done" });
        onEvent({ type: "assistant_message_end", messageId: "a1" });
        return {
          messages: [...messages, { role: "assistant", content: "done" }],
          bubbles: [{ id: "a1", text: "done" }],
        };
      },
    };

    const manager = new SessionManager(runtime as never);
    await manager.receive({
      type: "user_message",
      sessionId: "s1",
      messageId: "u1",
      timestamp: "2026-05-11T00:00:00.000Z",
      payload: { text: "hi" },
    }, (message) => pushed.push(message.type));

    expect(pushed).toContain("assistant_message_delta");
    expect(manager.getSession("s1")?.messages).toHaveLength(2);
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd /Users/mu9/.config/superpowers/worktrees/handAgent/codex-use-env-openai-key/apps/desktop/Web && pnpm exec vitest run /Users/mu9/.config/superpowers/worktrees/handAgent/codex-use-env-openai-key/apps/agent-server/src/SessionManager.test.ts`

Expected: FAIL with missing file or missing class

- [ ] **Step 3: 实现最小 SessionManager**

```ts
type SessionRecord = {
  sessionId: string;
  messages: ConversationMessage[];
  status: "idle" | "running" | "failed";
};

export class SessionManager {
  private readonly sessions = new Map<string, SessionRecord>();

  constructor(
    private readonly runtime: {
      runWithMessages: (
        messages: { role: string; content: string }[],
        onEvent: (event: { type: string; messageId: string; text?: string }) => void,
      ) => Promise<unknown>;
    },
  ) {}

  getSession(sessionId: string) {
    return this.sessions.get(sessionId);
  }

  async receive(message: SessionMessage, push: (message: SessionMessage) => void) {
    if (message.type !== "user_message") {
      return;
    }

    const current = this.sessions.get(message.sessionId) ?? {
      sessionId: message.sessionId,
      messages: [],
      status: "idle" as const,
    };

    current.messages.push({
      id: message.messageId,
      role: "user",
      text: message.payload.text,
      status: "completed",
      createdAt: message.timestamp,
      updatedAt: message.timestamp,
    });

    this.sessions.set(message.sessionId, current);

    await this.runtime.runWithMessages(
      current.messages.map((item) => ({
        role: item.role,
        content: item.text,
      })),
      (event) => {
        push({
          type: event.type as "assistant_message_start" | "assistant_message_delta" | "assistant_message_end",
          sessionId: message.sessionId,
          messageId: event.messageId,
          timestamp: message.timestamp,
          payload:
            event.type === "assistant_message_delta"
              ? { text: event.text ?? "" }
              : event.type === "assistant_message_end"
                ? { status: "completed" }
                : { role: "assistant" },
        });
      },
    );
  }
}
```

- [ ] **Step 4: 实现最小 WebSocket 服务入口**

```ts
import { WebSocketServer } from "ws";
import { SessionManager } from "./SessionManager";

const wss = new WebSocketServer({ port: 4317 });
const manager = new SessionManager(/* runtime instance */);

wss.on("connection", (socket) => {
  socket.on("message", async (raw) => {
    const message = JSON.parse(raw.toString());
    await manager.receive(message, (outgoing) => {
      socket.send(JSON.stringify(outgoing));
    });
  });
});
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cd /Users/mu9/.config/superpowers/worktrees/handAgent/codex-use-env-openai-key/apps/desktop/Web && pnpm exec vitest run /Users/mu9/.config/superpowers/worktrees/handAgent/codex-use-env-openai-key/apps/agent-server/src/SessionManager.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add /Users/mu9/.config/superpowers/worktrees/handAgent/codex-use-env-openai-key/apps/agent-server
git commit -m "feat: add local websocket agent server"
```

### Task 4: 前端切到 WebSocket 和统一 messages 状态

**Files:**
- Modify: `apps/desktop/Web/App.tsx`
- Modify: `apps/desktop/Web/PromptBox.tsx`
- Modify: `apps/desktop/Web/BubbleList.tsx`
- Modify: `apps/desktop/Web/bridge.ts`
- Create: `apps/desktop/Web/sessionState.ts`
- Test: `apps/desktop/Web/sessionState.test.ts`

- [ ] **Step 1: 写前端接入 WebSocket 的失败测试**

```ts
import { describe, expect, it } from "vitest";
import { createEmptyConversationState, reduceSessionMessage } from "./sessionState";

describe("session snapshot handling", () => {
  it("replaces local state from a session snapshot", () => {
    const next = reduceSessionMessage(
      createEmptyConversationState("s1"),
      {
        type: "session_snapshot",
        sessionId: "s1",
        messageId: "snap-1",
        timestamp: "2026-05-11T00:00:00.000Z",
        payload: {
          status: "idle",
          messages: [
            {
              id: "u1",
              role: "user",
              text: "hello",
              status: "completed",
              createdAt: "2026-05-11T00:00:00.000Z",
              updatedAt: "2026-05-11T00:00:00.000Z",
            },
          ],
        },
      },
    );

    expect(next.messages[0]?.text).toBe("hello");
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd /Users/mu9/.config/superpowers/worktrees/handAgent/codex-use-env-openai-key/apps/desktop/Web && pnpm run test:hotkey -- sessionState.test.ts`

Expected: FAIL because `session_snapshot` is not handled

- [ ] **Step 3: 实现 `session_snapshot`、`tool_message`、`status` 的 reducer**

```ts
if (message.type === "session_snapshot") {
  return {
    sessionId: message.sessionId,
    messages: message.payload.messages,
    status: message.payload.status,
    error: null,
  };
}
```

- [ ] **Step 4: 改造 `App.tsx` 使用 WebSocket 和 reducer**

```ts
const [state, setState] = useState(() => createEmptyConversationState("default"));

useEffect(() => {
  const socket = new WebSocket(serverUrl);
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    setState((current) => reduceSessionMessage(current, message));
  });
  return () => socket.close();
}, [serverUrl]);
```

```ts
socket.send(JSON.stringify({
  type: "user_message",
  sessionId: state.sessionId,
  messageId: crypto.randomUUID(),
  timestamp: new Date().toISOString(),
  payload: { text: nextPrompt, selection: null },
}));
```

- [ ] **Step 5: 从统一状态派生气泡视图**

```ts
const bubbleItems = state.messages
  .filter((item) => item.role === "user" || item.role === "assistant")
  .slice(-6)
  .map((item) => ({
    id: item.id,
    text: item.text,
    kind: item.role === "user" ? "user" : "assistant",
  }));
```

- [ ] **Step 6: 运行 Web 侧测试确认通过**

Run: `cd /Users/mu9/.config/superpowers/worktrees/handAgent/codex-use-env-openai-key/apps/desktop/Web && pnpm run test:hotkey`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add /Users/mu9/.config/superpowers/worktrees/handAgent/codex-use-env-openai-key/apps/desktop/Web/App.tsx /Users/mu9/.config/superpowers/worktrees/handAgent/codex-use-env-openai-key/apps/desktop/Web/PromptBox.tsx /Users/mu9/.config/superpowers/worktrees/handAgent/codex-use-env-openai-key/apps/desktop/Web/BubbleList.tsx /Users/mu9/.config/superpowers/worktrees/handAgent/codex-use-env-openai-key/apps/desktop/Web/bridge.ts /Users/mu9/.config/superpowers/worktrees/handAgent/codex-use-env-openai-key/apps/desktop/Web/sessionState.ts /Users/mu9/.config/superpowers/worktrees/handAgent/codex-use-env-openai-key/apps/desktop/Web/sessionState.test.ts
git commit -m "feat: connect web ui to local websocket session"
```

### Task 5: 宿主启动 Node 服务并注入连接地址

**Files:**
- Modify: `apps/desktop/HandAgentApp.swift`
- Modify: `docs/superpowers/specs/2026-05-11-agent-local-streaming-bridge-design.md`

- [ ] **Step 1: 写宿主地址注入的失败检查**

Run: `swift build`

Expected: Existing build succeeds now, but no Node server lifecycle exists yet

- [ ] **Step 2: 在宿主中增加 Node 进程启动逻辑**

```swift
private var agentProcess: Process?
private let agentPort = 4317

private func startAgentServer() {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
    process.arguments = [
        "node",
        "/Users/mu9/.config/superpowers/worktrees/handAgent/codex-use-env-openai-key/apps/agent-server/src/server.ts"
    ]
    process.environment = ProcessInfo.processInfo.environment
    try? process.run()
    agentProcess = process
}
```

- [ ] **Step 3: 将 WebSocket 地址注入 WebView**

```swift
private func publishAgentEndpoint() {
    let endpoint = "ws://127.0.0.1:4317/api/session"
    webView.evaluateJavaScript("""
    window.__HANDAGENT_SERVER_URL__ = "\(endpoint)";
    """)
}
```

- [ ] **Step 4: 在前端桥接里读取该地址**

```ts
export function readAgentServerUrl(): string {
  const value = (window as typeof window & { __HANDAGENT_SERVER_URL__?: string }).__HANDAGENT_SERVER_URL__;
  return value ?? "ws://127.0.0.1:4317/api/session";
}
```

- [ ] **Step 5: 运行仓库要求的最小验证**

Run: `cd /Users/mu9/.config/superpowers/worktrees/handAgent/codex-use-env-openai-key/apps/desktop/Web && pnpm run build`

Expected: PASS

Run: `cd /Users/mu9/.config/superpowers/worktrees/handAgent/codex-use-env-openai-key/apps/desktop/Web && pnpm run test:hotkey`

Expected: PASS

Run: `cd /Users/mu9/.config/superpowers/worktrees/handAgent/codex-use-env-openai-key/apps/desktop/Web && pnpm exec vitest run /Users/mu9/.config/superpowers/worktrees/handAgent/codex-use-env-openai-key/packages/core/tests/runtime.test.ts /Users/mu9/.config/superpowers/worktrees/handAgent/codex-use-env-openai-key/packages/core/tests/selection.test.ts /Users/mu9/.config/superpowers/worktrees/handAgent/codex-use-env-openai-key/packages/core/tests/context-tools.test.ts /Users/mu9/.config/superpowers/worktrees/handAgent/codex-use-env-openai-key/packages/core/tests/file-tools.test.ts /Users/mu9/.config/superpowers/worktrees/handAgent/codex-use-env-openai-key/packages/core/tests/runtime-stream.test.ts`

Expected: PASS

Run: `cd /Users/mu9/.config/superpowers/worktrees/handAgent/codex-use-env-openai-key && swift build`

Expected: PASS

- [ ] **Step 6: 更新设计文档并 Commit**

```bash
git add /Users/mu9/.config/superpowers/worktrees/handAgent/codex-use-env-openai-key/apps/desktop/HandAgentApp.swift /Users/mu9/.config/superpowers/worktrees/handAgent/codex-use-env-openai-key/docs/superpowers/specs/2026-05-11-agent-local-streaming-bridge-design.md /Users/mu9/.config/superpowers/worktrees/handAgent/codex-use-env-openai-key/docs/superpowers/plans/2026-05-11-agent-local-streaming-bridge-mvp.md
git commit -m "feat: wire desktop host to local agent server"
```

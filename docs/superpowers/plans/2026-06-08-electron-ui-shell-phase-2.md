# Electron UI Shell Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 `/api/activity` 轻量活动流，并在 `HANDAGENT_ELECTRON_SHELL=1` 路径下用 Electron/React StatusBubble 替代 Swift StatusBubble。

**Architecture:** Phase 2 把运行态展示从 Swift `ThreadRegistry` 派生改为 agent-server 统一发布的 activity stream。agent-server 从现有 `ThreadNotification` / `ServerRequest` 派生轻量 `AgentActivityEvent`，Electron activity renderer 直接订阅 `/api/activity`；Swift 仍保留 PromptPanel、Settings、Hotkey、focus 恢复和 `/api/platform`，但 Electron flag 路径不再显示旧 Swift StatusBubble。

**Tech Stack:** TypeScript, Vitest, Node WebSocket server, React 19, Vite, Electron BrowserWindow/preload/contextBridge, Swift 6, AppKit, XCTest, newline-delimited JSON over stdio.

---

## Scope Check

本计划只实现迁移 spec 的 Phase 2：

- 在 core 协议层新增 `AgentActivityEvent` / `AgentActivityStatus` DTO。
- 在 agent-server 新增 `AgentActivityPublisher`，从 thread 通知和 server request 派生 `idle / starting / running / tool_running / waiting / completed / error`。
- 在同一端口新增 `ws://127.0.0.1:4317/api/activity`，连接后立即发送 `activity.snapshot`，状态变化时广播 `activity.changed`。
- 在 Electron shell 新增 activity renderer 构建入口、preload 和 `ActivityWindowController`。
- `activity_window.show` command 在 Phase 2 变成可用命令；Electron StatusBubble 点击时请求 Electron main 聚焦 ThreadWindow，无法聚焦时回告 Swift 显示 PromptPanel。
- Electron flag 路径停用 Swift StatusBubble；默认未设置 `HANDAGENT_ELECTRON_SHELL` 时，现有 Swift StatusBubble 行为保持不变。

本计划不实现桌宠，不把 activity stream 接入 ThreadWindow，不迁移 PromptPanel 或 Settings，不改 platform tool 边界，不处理打包签名和 `utilityProcess` 固化。

## File Map

| 操作 | 路径 | 职责 |
|------|------|------|
| Create | `packages/core/src/protocol/AgentActivity.ts` | 定义 activity stream DTO |
| Modify | `packages/core/tests/protocol/thread-command-notification.test.ts` | 覆盖 activity DTO 与 thread protocol 分离 |
| Create | `apps/agent-server/src/activity/AgentActivityPublisher.ts` | 维护 activity snapshot、派生规则和 subscriber 广播 |
| Create | `apps/agent-server/src/activity/activity.md` | 记录 activity 模块职责 |
| Create | `apps/agent-server/tests/activity/AgentActivityPublisher.test.ts` | 覆盖状态派生、snapshot、subscriber 广播 |
| Modify | `apps/agent-server/src/src.md` | 索引新增 `activity/` 子目录 |
| Modify | `apps/agent-server/tests/tests.md` | 索引新增 `tests/activity/` |
| Modify | `apps/agent-server/src/thread/ThreadNotificationPublisher.ts` | 把 thread/server request publish 事件旁路给 activity publisher |
| Modify | `apps/agent-server/tests/thread/ThreadNotificationPublisher.test.ts` | 覆盖 publish observer 不影响 thread 分发 |
| Modify | `apps/agent-server/src/server/server.ts` | 新增 `/api/activity` WebSocket 分支并接线生产 activity publisher |
| Modify | `apps/agent-server/tests/server/server.test.ts` | 覆盖 `/api/activity` snapshot、changed 和未知 path close |
| Modify | `apps/electron-shell/package.json` | 增加 React/Vite renderer 构建依赖和 build 脚本 |
| Create | `apps/electron-shell/tsconfig.activity-window.json` | Electron activity renderer typecheck 配置 |
| Create | `apps/electron-shell/vite.activity-window.config.ts` | activity renderer Vite 构建配置 |
| Create | `apps/electron-shell/src/activity-window/index.html` | StatusBubble renderer HTML 入口 |
| Create | `apps/electron-shell/src/activity-window/main.tsx` | React bootstrap |
| Create | `apps/electron-shell/src/activity-window/App.tsx` | StatusBubble UI |
| Create | `apps/electron-shell/src/activity-window/activitySocketClient.ts` | `/api/activity` WebSocket client |
| Create | `apps/electron-shell/src/activity-window/activityState.ts` | renderer activity state reducer 与 display 映射 |
| Create | `apps/electron-shell/src/activity-window/styles.css` | frameless bubble 视觉样式 |
| Create | `apps/electron-shell/tests/activity-window/activityState.test.ts` | renderer state 单测 |
| Create | `apps/electron-shell/tests/activity-window/activitySocketClient.test.ts` | renderer socket client 单测 |
| Create | `apps/electron-shell/src/preload/activityWindowPreload.ts` | 暴露 activity URL 和 click-to-focus IPC |
| Create | `apps/electron-shell/tests/preload/activityWindowPreload.test.ts` | preload 单测 |
| Create | `apps/electron-shell/src/main/windows/activityWindowController.ts` | Electron StatusBubble BrowserWindow 生命周期 |
| Create | `apps/electron-shell/tests/windows/activityWindowController.test.ts` | Electron activity window 单测 |
| Modify | `apps/electron-shell/src/main/protocol/electronShellProtocol.ts` | 增加 `prompt_panel.show_requested` event，激活 `activity_window.show` |
| Modify | `apps/electron-shell/tests/protocol/electronShellProtocol.test.ts` | 覆盖新增 event 和 command |
| Modify | `apps/electron-shell/src/main/electronShellRuntime.ts` | 注入 activity window host，处理 show command 与 bubble click fallback |
| Modify | `apps/electron-shell/tests/main/electronShellRuntime.test.ts` | 覆盖 activity command ack 与 PromptPanel fallback event |
| Modify | `apps/electron-shell/src/main/main.ts` | 接线 activity BrowserWindow、preload、IPC 和 renderer crash event |
| Modify | `apps/desktop/Sources/AppServices/ElectronShell/ElectronShellProtocol.swift` | Swift DTO 增加 prompt panel request event |
| Modify | `apps/desktop/TestsSwift/AppServices/ElectronShell/ElectronShellProtocolTests.swift` | Swift DTO 编解码覆盖新增 event |
| Create | `apps/desktop/Sources/AppServices/ElectronShell/ActivityWindowCommanding.swift` | Swift 侧 Electron activity window command client 协议 |
| Modify | `apps/desktop/Sources/AppServices/ElectronShell/ElectronBackedAppServer.swift` | 实现 activity show command 与 prompt request 回调 |
| Modify | `apps/desktop/TestsSwift/AppServices/ElectronShell/ElectronBackedAppServerTests.swift` | 覆盖 activity show、ack、prompt request |
| Modify | `apps/desktop/Sources/AppServices/AppServices.swift` | Electron flag 路径提供 activity client，并默认停用 Swift StatusBubble |
| Modify | `apps/desktop/TestsSwift/AppServices/AppServicesTests.swift` | 覆盖 Electron flag 下 Swift StatusBubble 停用 |
| Modify | `apps/desktop/Sources/Coordinator/AppCoordinator.swift` | app-server 可用后显示 Electron StatusBubble；处理 Electron 请求打开 PromptPanel |
| Modify | `apps/desktop/TestsSwift/Coordinator/AppCoordinatorTests.swift` | 覆盖 Electron activity window show 与 prompt fallback |
| Modify | `handAgent.md` | 更新 Phase 2 架构和 `/api/activity` 边界 |
| Modify | `apps/apps.md` | 更新 apps 层状态反馈流转 |
| Modify | `apps/agent-server/agent-server.md` | 记录 `/api/activity` 入口 |
| Modify | `apps/agent-server/src/server/server.md` | 记录 `/api/activity` path 分派 |
| Modify | `apps/agent-server/src/thread/thread.md` | 说明 thread publisher 会旁路 activity |
| Modify | `packages/core/src/protocol/protocol.md` | 索引 `AgentActivity.ts` |
| Modify | `apps/electron-shell/electron-shell.md` | 记录 Phase 2 StatusBubble host |
| Modify | `apps/desktop/desktop.md` | 更新 Electron flag 下 StatusBubble 路径 |
| Modify | `apps/desktop/Sources/StatusBubble/status-bubble.md` | 标明 Swift StatusBubble 只服务默认路径 |
| Modify | `apps/desktop/Sources/AppServices/app-services.md` | 记录 `showsStatusBubble` 与 `showsFatalAlert` 的独立职责 |
| Modify | `apps/desktop/Sources/AppServices/ElectronShell/electron-shell.md` | 记录 activity command 与 prompt request event |
| Modify | `docs/manual-qa.md` | 增加 Electron UI Shell Phase 2 手工验收项 |

## External Facts To Preserve

- Electron `BrowserWindow` 支持 `show: false` 创建隐藏窗口，也支持 `showInactive()` 以不激活应用的方式显示窗口；StatusBubble 展示应使用 `showInactive()`，避免打断 PromptPanel 或前台应用焦点。
- Activity renderer 继续使用 `contextIsolation: true`、`nodeIntegration: false`；renderer 只能通过 WebSocket 订阅 `/api/activity`，通过 preload 暴露的单一方法请求 Electron main 聚焦 ThreadWindow。
- `/api/activity` 不承载 `ThreadCommand`、`ClientResponse`、`ThreadNotification` 或 `ServerRequest`；它只发送 `AgentActivityEvent`。
- Activity stream 不暴露完整消息内容；`latestSummary` 只使用短状态文案或最多 80 字的用户主动输入预览。
- Swift 不解析 activity stream，不 mirror thread 状态；Electron flag 路径下 StatusBubble 的实时展示属于 Electron renderer。
- 默认路径继续显示 Swift StatusBubble，并继续从 Swift `ThreadRegistry` 派生。

## Tasks

### Task 1: 新增 core activity DTO

**Files:**
- Create: `packages/core/src/protocol/AgentActivity.ts`
- Modify: `packages/core/tests/protocol/thread-command-notification.test.ts`

- [ ] **Step 1: 写 activity DTO 失败测试**

在 `packages/core/tests/protocol/thread-command-notification.test.ts` 增加：

```typescript
import type { AgentActivityEvent } from "../../src/protocol/AgentActivity.ts";
```

在 `describe("thread command/notification protocol", () => {` 对应的测试块内增加：

```typescript
it("models activity stream separately from thread notifications", () => {
  const snapshot: AgentActivityEvent = {
    channel: "activity",
    type: "activity.snapshot",
    activeThreadId: "thread-1",
    status: "running",
    latestSummary: "正在回复",
    waitingRequest: null,
    error: null,
    updatedAt: "2026-06-08T00:00:00.000Z",
  };
  const changed: AgentActivityEvent = {
    channel: "activity",
    type: "activity.changed",
    activeThreadId: "thread-1",
    status: "tool_running",
    latestSummary: "正在使用 file.read",
    waitingRequest: null,
    error: null,
    updatedAt: "2026-06-08T00:00:01.000Z",
  };

  expect(snapshot.channel).toBe("activity");
  expect(snapshot.type).toBe("activity.snapshot");
  expect(changed.status).toBe("tool_running");
});
```

运行：

```bash
pnpm exec vitest run packages/core/tests/protocol/thread-command-notification.test.ts
```

预期：FAIL，`AgentActivity.ts` 尚不存在。

- [ ] **Step 2: 创建 activity DTO**

创建 `packages/core/src/protocol/AgentActivity.ts`：

```typescript
export type AgentActivityStatus =
  | "idle"
  | "starting"
  | "running"
  | "tool_running"
  | "waiting"
  | "completed"
  | "error";

export type AgentActivityWaitingRequest = "permission" | "workspace";

export type AgentActivityEvent =
  | {
      channel: "activity";
      type: "activity.snapshot";
      activeThreadId: string | null;
      status: AgentActivityStatus;
      latestSummary: string | null;
      waitingRequest: AgentActivityWaitingRequest | null;
      error: string | null;
      updatedAt: string;
    }
  | {
      channel: "activity";
      type: "activity.changed";
      activeThreadId: string | null;
      status: AgentActivityStatus;
      latestSummary: string | null;
      waitingRequest: AgentActivityWaitingRequest | null;
      error: string | null;
      updatedAt: string;
    };
```

- [ ] **Step 3: 验证 core 协议测试通过**

运行：

```bash
pnpm exec vitest run packages/core/tests/protocol/thread-command-notification.test.ts
```

预期：PASS。

- [ ] **Step 4: 提交 activity DTO**

运行：

```bash
git add packages/core/src/protocol/AgentActivity.ts \
  packages/core/tests/protocol/thread-command-notification.test.ts
git commit -m "feat: add agent activity protocol"
```

### Task 2: 实现 agent-server activity publisher

**Files:**
- Create: `apps/agent-server/src/activity/AgentActivityPublisher.ts`
- Create: `apps/agent-server/src/activity/activity.md`
- Create: `apps/agent-server/tests/activity/AgentActivityPublisher.test.ts`
- Modify: `apps/agent-server/src/src.md`
- Modify: `apps/agent-server/tests/tests.md`

- [ ] **Step 1: 写 activity publisher 失败测试**

创建 `apps/agent-server/tests/activity/AgentActivityPublisher.test.ts`：

```typescript
import { describe, expect, it } from "vitest";
import type { AgentActivityEvent } from "@handagent/core/protocol/AgentActivity.ts";
import { AgentActivityPublisher } from "../../src/activity/AgentActivityPublisher.ts";

describe("AgentActivityPublisher", () => {
  it("sends an idle snapshot when a subscriber attaches", () => {
    const events: AgentActivityEvent[] = [];
    const publisher = new AgentActivityPublisher(() => "2026-06-08T00:00:00.000Z");

    publisher.attachConnection("activity-1", (event) => events.push(event));

    expect(events).toEqual([
      {
        channel: "activity",
        type: "activity.snapshot",
        activeThreadId: null,
        status: "idle",
        latestSummary: null,
        waitingRequest: null,
        error: null,
        updatedAt: "2026-06-08T00:00:00.000Z",
      },
    ]);
  });

  it("derives running, tool, completed, and error states from thread notifications", () => {
    const events: AgentActivityEvent[] = [];
    let now = "2026-06-08T00:00:00.000Z";
    const publisher = new AgentActivityPublisher(() => now);
    publisher.attachConnection("activity-1", (event) => events.push(event));

    now = "2026-06-08T00:00:01.000Z";
    publisher.observe({
      type: "user.message.recorded",
      threadId: "thread-1",
      notificationId: "n-user",
      timestamp: now,
      payload: {
        messageId: "user-1",
        text: "请总结这个项目的 Electron 状态",
      },
    });
    now = "2026-06-08T00:00:02.000Z";
    publisher.observe({
      type: "turn.started",
      threadId: "thread-1",
      notificationId: "n-turn",
      turnId: "turn-1",
      timestamp: now,
      payload: {},
    });
    now = "2026-06-08T00:00:03.000Z";
    publisher.observe({
      type: "tool.started",
      threadId: "thread-1",
      notificationId: "n-tool",
      turnId: "turn-1",
      itemId: "tool-1",
      timestamp: now,
      payload: { name: "file.read", input: { path: "handAgent.md" } },
    });
    now = "2026-06-08T00:00:04.000Z";
    publisher.observe({
      type: "turn.completed",
      threadId: "thread-1",
      notificationId: "n-done",
      turnId: "turn-1",
      timestamp: now,
      payload: { status: "completed" },
    });
    now = "2026-06-08T00:00:05.000Z";
    publisher.observe({
      type: "thread.error",
      threadId: "thread-1",
      notificationId: "n-error",
      timestamp: now,
      payload: { message: "provider failed" },
    });

    expect(events.slice(1).map((event) => ({
      type: event.type,
      status: event.status,
      activeThreadId: event.activeThreadId,
      latestSummary: event.latestSummary,
      waitingRequest: event.waitingRequest,
      error: event.error,
    }))).toEqual([
      {
        type: "activity.changed",
        status: "starting",
        activeThreadId: "thread-1",
        latestSummary: "请总结这个项目的 Electron 状态",
        waitingRequest: null,
        error: null,
      },
      {
        type: "activity.changed",
        status: "running",
        activeThreadId: "thread-1",
        latestSummary: "正在回复",
        waitingRequest: null,
        error: null,
      },
      {
        type: "activity.changed",
        status: "tool_running",
        activeThreadId: "thread-1",
        latestSummary: "正在使用 file.read",
        waitingRequest: null,
        error: null,
      },
      {
        type: "activity.changed",
        status: "completed",
        activeThreadId: "thread-1",
        latestSummary: "已完成",
        waitingRequest: null,
        error: null,
      },
      {
        type: "activity.changed",
        status: "error",
        activeThreadId: "thread-1",
        latestSummary: "provider failed",
        waitingRequest: null,
        error: "provider failed",
      },
    ]);
  });

  it("derives waiting states from server requests", () => {
    const events: AgentActivityEvent[] = [];
    const publisher = new AgentActivityPublisher(() => "2026-06-08T00:00:00.000Z");
    publisher.attachConnection("activity-1", (event) => events.push(event));

    publisher.observe({
      type: "permission.requested",
      requestId: "thread-1:tool-1",
      threadId: "thread-1",
      timestamp: "2026-06-08T00:00:00.000Z",
      payload: {
        toolName: "file.write",
        toolCallId: "tool-1",
        arguments: { path: "a.txt" },
      },
    });
    publisher.observe({
      type: "workspace.requested",
      requestId: "thread-2:tool-2",
      threadId: "thread-2",
      timestamp: "2026-06-08T00:00:01.000Z",
      payload: {
        toolCallId: "tool-2",
        prompt: "请选择 workspace",
        candidates: [],
      },
    });

    expect(events.at(-2)).toMatchObject({
      type: "activity.changed",
      activeThreadId: "thread-1",
      status: "waiting",
      latestSummary: "等待权限确认",
      waitingRequest: "permission",
      error: null,
    });
    expect(events.at(-1)).toMatchObject({
      type: "activity.changed",
      activeThreadId: "thread-2",
      status: "waiting",
      latestSummary: "等待工作区选择",
      waitingRequest: "workspace",
      error: null,
    });
  });

  it("broadcasts changes to all current subscribers and stops sending to detached subscribers", () => {
    const first: AgentActivityEvent[] = [];
    const second: AgentActivityEvent[] = [];
    const publisher = new AgentActivityPublisher(() => "2026-06-08T00:00:00.000Z");
    publisher.attachConnection("first", (event) => first.push(event));
    publisher.attachConnection("second", (event) => second.push(event));
    publisher.detachConnection("second");

    publisher.observe({
      type: "turn.started",
      threadId: "thread-1",
      notificationId: "n-turn",
      turnId: "turn-1",
      timestamp: "2026-06-08T00:00:00.000Z",
      payload: {},
    });

    expect(first.map((event) => event.type)).toEqual(["activity.snapshot", "activity.changed"]);
    expect(second.map((event) => event.type)).toEqual(["activity.snapshot"]);
  });
});
```

运行：

```bash
pnpm exec vitest run apps/agent-server/tests/activity/AgentActivityPublisher.test.ts
```

预期：FAIL，`AgentActivityPublisher` 尚不存在。

- [ ] **Step 2: 创建 activity publisher**

创建 `apps/agent-server/src/activity/AgentActivityPublisher.ts`：

```typescript
import type { AgentActivityEvent } from "@handagent/core/protocol/AgentActivity.ts";
import type { ServerRequest } from "@handagent/core/protocol/ServerRequest.ts";
import type { ThreadNotification } from "@handagent/core/protocol/ThreadNotification.ts";

export type ActivitySourceEvent = ThreadNotification | ServerRequest;
type SendActivityEvent = (event: AgentActivityEvent) => void;

type ActivityState = Omit<AgentActivityEvent, "type">;

export class AgentActivityPublisher {
  private readonly connections = new Map<string, SendActivityEvent>();
  private state: ActivityState;

  constructor(private readonly now: () => string = () => new Date().toISOString()) {
    this.state = {
      channel: "activity",
      activeThreadId: null,
      status: "idle",
      latestSummary: null,
      waitingRequest: null,
      error: null,
      updatedAt: this.now(),
    };
  }

  attachConnection(connectionId: string, send: SendActivityEvent): void {
    this.connections.set(connectionId, send);
    send({ ...this.state, type: "activity.snapshot" });
  }

  detachConnection(connectionId: string): void {
    this.connections.delete(connectionId);
  }

  observe(event: ActivitySourceEvent): void {
    const next = this.deriveNextState(event);
    if (!next) {
      return;
    }
    this.state = next;
    this.broadcast({ ...next, type: "activity.changed" });
  }

  snapshot(): AgentActivityEvent {
    return { ...this.state, type: "activity.snapshot" };
  }

  private deriveNextState(event: ActivitySourceEvent): ActivityState | null {
    switch (event.type) {
      case "thread.started":
        return this.next({
          activeThreadId: event.threadId,
          status: "starting",
          latestSummary: event.payload.preview ? summarize(event.payload.preview) : "正在开始",
          waitingRequest: null,
          error: null,
        });
      case "user.message.recorded":
        return this.next({
          activeThreadId: event.threadId,
          status: "starting",
          latestSummary: summarize(event.payload.text),
          waitingRequest: null,
          error: null,
        });
      case "turn.started":
      case "assistant.delta":
        return this.next({
          activeThreadId: event.threadId,
          status: "running",
          latestSummary: "正在回复",
          waitingRequest: null,
          error: null,
        });
      case "tool.started":
        return this.next({
          activeThreadId: event.threadId,
          status: "tool_running",
          latestSummary: `正在使用 ${event.payload.name}`,
          waitingRequest: null,
          error: null,
        });
      case "permission.requested":
        return this.next({
          activeThreadId: event.threadId,
          status: "waiting",
          latestSummary: "等待权限确认",
          waitingRequest: "permission",
          error: null,
        });
      case "workspace.requested":
        return this.next({
          activeThreadId: event.threadId,
          status: "waiting",
          latestSummary: "等待工作区选择",
          waitingRequest: "workspace",
          error: null,
        });
      case "turn.completed":
        return this.next({
          activeThreadId: event.threadId,
          status: event.payload.status === "failed" ? "error" : "completed",
          latestSummary: event.payload.status === "interrupted" ? "已中断" : event.payload.status === "failed" ? "运行失败" : "已完成",
          waitingRequest: null,
          error: event.payload.status === "failed" ? "运行失败" : null,
        });
      case "thread.status.changed":
        if (event.payload.value === "idle") {
          return this.next({
            activeThreadId: event.threadId,
            status: "idle",
            latestSummary: "点击开始",
            waitingRequest: null,
            error: null,
          });
        }
        if (event.payload.value === "failed" || event.payload.value === "interrupted") {
          return this.next({
            activeThreadId: event.threadId,
            status: "error",
            latestSummary: event.payload.value === "interrupted" ? "已中断" : "运行失败",
            waitingRequest: null,
            error: event.payload.value === "interrupted" ? "已中断" : "运行失败",
          });
        }
        return null;
      case "thread.error":
        return this.next({
          activeThreadId: event.threadId ?? this.state.activeThreadId,
          status: "error",
          latestSummary: summarize(event.payload.message),
          waitingRequest: null,
          error: event.payload.message,
        });
      default:
        return null;
    }
  }

  private next(
    patch: Pick<ActivityState, "activeThreadId" | "status" | "latestSummary" | "waitingRequest" | "error">,
  ): ActivityState {
    return {
      channel: "activity",
      ...patch,
      updatedAt: this.now(),
    };
  }

  private broadcast(event: AgentActivityEvent): void {
    for (const send of this.connections.values()) {
      send(event);
    }
  }
}

function summarize(text: string): string {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (normalized.length <= 80) {
    return normalized;
  }
  return `${normalized.slice(0, 77)}...`;
}
```

- [ ] **Step 3: 新增 activity 模块文档**

创建 `apps/agent-server/src/activity/activity.md`：

```markdown
# activity

`activity/` 负责把完整 thread 通知和待回执请求派生为轻量 `/api/activity` stream，供 Electron StatusBubble 和后续桌宠订阅。

## 文件

| 文件 | 职责 |
|------|------|
| `AgentActivityPublisher.ts` | 维护当前 activity snapshot，接收 `ThreadNotification` / `ServerRequest`，向 activity subscribers 广播 `AgentActivityEvent` |

## 边界

- 不处理 WebSocket；socket 绑定在 `server/server.ts`。
- 不发送 `ThreadCommand`，不消费 `ClientResponse`。
- 不暴露完整消息内容；`latestSummary` 只使用短状态文案或最多 80 字的用户主动输入预览。
- 不替代 ThreadWindow 的 `/api/thread`。ThreadWindow 继续消费完整 thread 协议，StatusBubble 和桌宠消费 `/api/activity`。
```

在 `apps/agent-server/src/src.md` 的子目录索引表中加入：

```markdown
| `activity/` | [activity/activity.md](/Users/mu9/proj/handAgent/apps/agent-server/src/activity/activity.md) | 轻量 activity stream 派生与 subscriber 广播 |
```

在 `apps/agent-server/tests/tests.md` 的测试目录索引中加入 `activity/`：

```markdown
| `activity/` | activity stream 派生规则与 subscriber 广播测试 |
```

- [ ] **Step 4: 验证 activity publisher 测试通过**

运行：

```bash
pnpm exec vitest run apps/agent-server/tests/activity/AgentActivityPublisher.test.ts
```

预期：PASS。

- [ ] **Step 5: 提交 activity publisher**

运行：

```bash
git add apps/agent-server/src/activity/AgentActivityPublisher.ts \
  apps/agent-server/src/activity/activity.md \
  apps/agent-server/tests/activity/AgentActivityPublisher.test.ts \
  apps/agent-server/src/src.md \
  apps/agent-server/tests/tests.md
git commit -m "feat: add agent activity publisher"
```

### Task 3: 接线 `/api/activity` WebSocket

**Files:**
- Modify: `apps/agent-server/src/thread/ThreadNotificationPublisher.ts`
- Modify: `apps/agent-server/tests/thread/ThreadNotificationPublisher.test.ts`
- Modify: `apps/agent-server/src/server/server.ts`
- Modify: `apps/agent-server/tests/server/server.test.ts`

- [ ] **Step 1: 写 publisher observer 失败测试**

在 `apps/agent-server/tests/thread/ThreadNotificationPublisher.test.ts` 增加：

```typescript
it("observes published messages without changing thread fanout", () => {
  const observed: string[] = [];
  const publisher = new ThreadNotificationPublisher((event) => observed.push(event.type));
  const sent: string[] = [];
  publisher.attachConnection("c1", (event) => sent.push(event.type));
  publisher.subscribe("c1", "thread-1");

  publisher.publish({
    type: "turn.started",
    threadId: "thread-1",
    notificationId: "n1",
    turnId: "turn-1",
    timestamp: "2026-06-08T00:00:00.000Z",
    payload: {},
  });
  publisher.publishToConnection("c1", {
    type: "permission.requested",
    requestId: "thread-1:tool-1",
    threadId: "thread-1",
    timestamp: "2026-06-08T00:00:00.000Z",
    payload: {
      toolName: "file.write",
      toolCallId: "tool-1",
      arguments: { path: "a.txt" },
    },
  });

  expect(sent).toEqual(["turn.started", "permission.requested"]);
  expect(observed).toEqual(["turn.started", "permission.requested"]);
});
```

运行：

```bash
pnpm exec vitest run apps/agent-server/tests/thread/ThreadNotificationPublisher.test.ts
```

预期：FAIL，`ThreadNotificationPublisher` 构造函数尚不接受 observer。

- [ ] **Step 2: 修改 ThreadNotificationPublisher 支持 observer**

在 `apps/agent-server/src/thread/ThreadNotificationPublisher.ts` 中新增类型并修改构造函数：

```typescript
type PublishObserver = (event: PublishedThreadMessage) => void;
```

把 class 开头改为：

```typescript
export class ThreadNotificationPublisher {
  private readonly connections = new Map<string, ConnectionState>();

  constructor(private readonly observer: PublishObserver = () => {}) {}
```

在 `publish(event: PublishedThreadMessage)` 的第一行加入：

```typescript
this.observer(event);
```

把 `publishToConnection` 改为：

```typescript
publishToConnection(connectionId: string, event: PublishedThreadMessage): void {
  this.observer(event);
  this.connections.get(connectionId)?.send(event);
}
```

- [ ] **Step 3: 验证 publisher observer 测试通过**

运行：

```bash
pnpm exec vitest run apps/agent-server/tests/thread/ThreadNotificationPublisher.test.ts
```

预期：PASS。

- [ ] **Step 4: 写 `/api/activity` server 失败测试**

在 `apps/agent-server/tests/server/server.test.ts` 的 import 中加入：

```typescript
import { AgentActivityPublisher } from "../../src/activity/AgentActivityPublisher.ts";
import type { AgentActivityEvent } from "@handagent/core/protocol/AgentActivity.ts";
```

在 server 测试中增加：

```typescript
describe("attachActivitySocketHandlers", () => {
  it("sends a snapshot on activity socket attach and removes subscriber on close", () => {
    const socket = new FakeSocket();
    const publisher = new AgentActivityPublisher(() => "2026-06-08T00:00:00.000Z");

    attachActivitySocketHandlers(socket as never, { activityPublisher: publisher });

    expect(lastSent<AgentActivityEvent>(socket)).toEqual({
      channel: "activity",
      type: "activity.snapshot",
      activeThreadId: null,
      status: "idle",
      latestSummary: null,
      waitingRequest: null,
      error: null,
      updatedAt: "2026-06-08T00:00:00.000Z",
    });

    socket.emit("close");
    publisher.observe({
      type: "turn.started",
      threadId: "thread-1",
      notificationId: "n1",
      turnId: "turn-1",
      timestamp: "2026-06-08T00:00:00.000Z",
      payload: {},
    });

    expect(socket.sent).toHaveLength(1);
  });
});
```

在 `startServer` 的集成测试区域增加：

```typescript
it("routes /api/activity websocket clients to the activity publisher", async () => {
  const activityPublisher = new AgentActivityPublisher(() => "2026-06-08T00:00:00.000Z");
  const server = await startServer({
    ...makeHandlerDependencies(),
    activityPublisher,
    port: 0,
  });
  const address = server.address() as AddressInfo;
  const socket = new WebSocket(`ws://127.0.0.1:${address.port}/api/activity`);

  const [raw] = await once(socket, "message");
  const snapshot = JSON.parse(raw.toString()) as AgentActivityEvent;

  expect(snapshot.type).toBe("activity.snapshot");
  socket.close();
  server.close();
});
```

运行：

```bash
pnpm exec vitest run apps/agent-server/tests/server/server.test.ts
```

预期：FAIL，`attachActivitySocketHandlers` 和 `startServer.activityPublisher` 尚不存在。

- [ ] **Step 5: 修改 server 接线 activity socket**

在 `apps/agent-server/src/server/server.ts` import 区加入：

```typescript
import type { AgentActivityEvent } from "@handagent/core/protocol/AgentActivity.ts";
import { AgentActivityPublisher } from "../activity/AgentActivityPublisher.ts";
```

新增 socket handler：

```typescript
export function attachActivitySocketHandlers(
  socket: ThreadSocket,
  {
    activityPublisher,
  }: {
    activityPublisher: AgentActivityPublisher;
  },
): void {
  const connectionId = `activity-${++nextConnectionId}`;
  const sendActivity = (outgoing: AgentActivityEvent) => {
    socket.send(JSON.stringify(outgoing));
  };

  activityPublisher.attachConnection(connectionId, sendActivity);
  socket.on("close", () => {
    activityPublisher.detachConnection(connectionId);
  });
}
```

在 `startServer` 参数中加入：

```typescript
  activityPublisher,
```

并在类型中加入：

```typescript
  activityPublisher?: AgentActivityPublisher;
```

在 `startServer` 内新增 WebSocketServer：

```typescript
const activityWebSocketServer = new WebSocketServer({ noServer: true });
```

在 connection handler 后加入：

```typescript
activityWebSocketServer.on("connection", (socket) => {
  if (!activityPublisher) {
    socket.close();
    return;
  }
  attachActivitySocketHandlers(socket, { activityPublisher });
});
```

在 upgrade 分支中，在 `/api/thread` 前或后加入：

```typescript
if (path === "/api/activity") {
  activityWebSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
    activityWebSocketServer.emit("connection", webSocket, request);
  });
  return;
}
```

在 `startDefaultServer` 中把 publisher 构造改为：

```typescript
const activityPublisher = new AgentActivityPublisher();
const eventPublisher = new ThreadNotificationPublisher((event) => {
  activityPublisher.observe(event);
});
```

并在 `return startServer({` 的参数对象中加入：

```typescript
activityPublisher,
```

- [ ] **Step 6: 验证 server activity tests 通过**

运行：

```bash
pnpm exec vitest run apps/agent-server/tests/thread/ThreadNotificationPublisher.test.ts apps/agent-server/tests/server/server.test.ts apps/agent-server/tests/activity/AgentActivityPublisher.test.ts
```

预期：PASS。

- [ ] **Step 7: 提交 `/api/activity` 接线**

运行：

```bash
git add apps/agent-server/src/thread/ThreadNotificationPublisher.ts \
  apps/agent-server/tests/thread/ThreadNotificationPublisher.test.ts \
  apps/agent-server/src/server/server.ts \
  apps/agent-server/tests/server/server.test.ts
git commit -m "feat: expose agent activity websocket"
```

### Task 4: 新增 Electron StatusBubble renderer

**Files:**
- Modify: `apps/electron-shell/package.json`
- Create: `apps/electron-shell/tsconfig.activity-window.json`
- Create: `apps/electron-shell/vite.activity-window.config.ts`
- Create: `apps/electron-shell/src/activity-window/index.html`
- Create: `apps/electron-shell/src/activity-window/main.tsx`
- Create: `apps/electron-shell/src/activity-window/App.tsx`
- Create: `apps/electron-shell/src/activity-window/activitySocketClient.ts`
- Create: `apps/electron-shell/src/activity-window/activityState.ts`
- Create: `apps/electron-shell/src/activity-window/styles.css`
- Create: `apps/electron-shell/tests/activity-window/activityState.test.ts`
- Create: `apps/electron-shell/tests/activity-window/activitySocketClient.test.ts`

- [ ] **Step 1: 写 renderer state 失败测试**

创建 `apps/electron-shell/tests/activity-window/activityState.test.ts`：

```typescript
import { describe, expect, it } from "vitest";
import { activityDisplay, initialActivityState, reduceActivityEvent } from "../../src/activity-window/activityState.js";

describe("activityState", () => {
  it("reduces snapshots and changes", () => {
    const snapshot = reduceActivityEvent(initialActivityState, {
      channel: "activity",
      type: "activity.snapshot",
      activeThreadId: null,
      status: "idle",
      latestSummary: null,
      waitingRequest: null,
      error: null,
      updatedAt: "2026-06-08T00:00:00.000Z",
    });
    const changed = reduceActivityEvent(snapshot, {
      channel: "activity",
      type: "activity.changed",
      activeThreadId: "thread-1",
      status: "tool_running",
      latestSummary: "正在使用 file.read",
      waitingRequest: null,
      error: null,
      updatedAt: "2026-06-08T00:00:01.000Z",
    });

    expect(snapshot.status).toBe("idle");
    expect(changed.activeThreadId).toBe("thread-1");
    expect(activityDisplay(changed)).toEqual({
      label: "工具运行中",
      detail: "正在使用 file.read",
      tone: "tool",
    });
  });
});
```

运行：

```bash
pnpm --filter handagent-electron-shell test activityState.test.ts
```

预期：FAIL，activity renderer 文件尚不存在。

- [ ] **Step 2: 创建 renderer state**

创建 `apps/electron-shell/src/activity-window/activityState.ts`：

```typescript
import type { AgentActivityEvent, AgentActivityStatus } from "@handagent/core/protocol/AgentActivity.ts";

export type ActivityState = {
  activeThreadId: string | null;
  status: AgentActivityStatus;
  latestSummary: string | null;
  waitingRequest: "permission" | "workspace" | null;
  error: string | null;
  updatedAt: string | null;
};

export type ActivityDisplay = {
  label: string;
  detail: string;
  tone: "idle" | "running" | "tool" | "waiting" | "done" | "error";
};

export const initialActivityState: ActivityState = {
  activeThreadId: null,
  status: "idle",
  latestSummary: null,
  waitingRequest: null,
  error: null,
  updatedAt: null,
};

export function reduceActivityEvent(
  _state: ActivityState,
  event: AgentActivityEvent,
): ActivityState {
  return {
    activeThreadId: event.activeThreadId,
    status: event.status,
    latestSummary: event.latestSummary,
    waitingRequest: event.waitingRequest,
    error: event.error,
    updatedAt: event.updatedAt,
  };
}

export function activityDisplay(state: ActivityState): ActivityDisplay {
  switch (state.status) {
    case "starting":
      return { label: "正在开始", detail: state.latestSummary ?? "准备对话", tone: "running" };
    case "running":
      return { label: "正在回复", detail: state.latestSummary ?? "Agent 正在处理", tone: "running" };
    case "tool_running":
      return { label: "工具运行中", detail: state.latestSummary ?? "正在调用工具", tone: "tool" };
    case "waiting":
      return { label: "等待确认", detail: state.latestSummary ?? "需要用户确认", tone: "waiting" };
    case "completed":
      return { label: "已完成", detail: state.latestSummary ?? "最近一轮已完成", tone: "done" };
    case "error":
      return { label: "出现错误", detail: state.error ?? state.latestSummary ?? "运行失败", tone: "error" };
    case "idle":
      return { label: "点击开始", detail: state.latestSummary ?? "HandAgent 空闲", tone: "idle" };
  }
}
```

- [ ] **Step 3: 写 socket client 失败测试**

创建 `apps/electron-shell/tests/activity-window/activitySocketClient.test.ts`：

```typescript
import { describe, expect, it, vi } from "vitest";
import type { AgentActivityEvent } from "@handagent/core/protocol/AgentActivity.ts";
import { ActivitySocketClient } from "../../src/activity-window/activitySocketClient.js";

describe("ActivitySocketClient", () => {
  it("parses activity messages and ignores malformed frames", () => {
    const received: AgentActivityEvent[] = [];
    const client = new ActivitySocketClient({
      url: "ws://127.0.0.1:4317/api/activity",
      WebSocketCtor: FakeWebSocket,
      onEvent: (event) => received.push(event),
    });

    client.connect();
    const socket = FakeWebSocket.instances[0];
    socket.emitMessage(JSON.stringify({
      channel: "activity",
      type: "activity.snapshot",
      activeThreadId: null,
      status: "idle",
      latestSummary: null,
      waitingRequest: null,
      error: null,
      updatedAt: "2026-06-08T00:00:00.000Z",
    }));
    socket.emitMessage("{not-json");
    socket.emitMessage(JSON.stringify({ channel: "thread", type: "activity.snapshot" }));

    expect(received).toHaveLength(1);
    expect(received[0]?.type).toBe("activity.snapshot");
  });

  it("closes the active socket", () => {
    const client = new ActivitySocketClient({
      url: "ws://127.0.0.1:4317/api/activity",
      WebSocketCtor: FakeWebSocket,
      onEvent: vi.fn(),
    });

    client.connect();
    const socket = FakeWebSocket.instances.at(-1);
    client.close();

    expect(socket?.closed).toBe(true);
  });
});

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  onmessage: ((event: { data: string }) => void) | null = null;
  closed = false;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  close(): void {
    this.closed = true;
  }

  emitMessage(data: string): void {
    this.onmessage?.({ data });
  }
}
```

运行：

```bash
pnpm --filter handagent-electron-shell test activitySocketClient.test.ts
```

预期：FAIL，`ActivitySocketClient` 尚不存在。

- [ ] **Step 4: 创建 socket client**

创建 `apps/electron-shell/src/activity-window/activitySocketClient.ts`：

```typescript
import type { AgentActivityEvent } from "@handagent/core/protocol/AgentActivity.ts";

type WebSocketLike = {
  onmessage: ((event: { data: string }) => void) | null;
  close(): void;
};

type WebSocketConstructor = new (url: string) => WebSocketLike;

type Options = {
  url: string;
  onEvent: (event: AgentActivityEvent) => void;
  WebSocketCtor?: WebSocketConstructor;
};

export class ActivitySocketClient {
  private socket: WebSocketLike | null = null;

  constructor(private readonly options: Options) {}

  connect(): void {
    this.close();
    const WebSocketCtor = this.options.WebSocketCtor ?? WebSocket;
    const socket = new WebSocketCtor(this.options.url);
    socket.onmessage = (event) => {
      const parsed = parseActivityEvent(event.data);
      if (parsed) {
        this.options.onEvent(parsed);
      }
    };
    this.socket = socket;
  }

  close(): void {
    this.socket?.close();
    this.socket = null;
  }
}

function parseActivityEvent(raw: string): AgentActivityEvent | null {
  try {
    const value = JSON.parse(raw) as unknown;
    if (!isActivityEvent(value)) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

function isActivityEvent(value: unknown): value is AgentActivityEvent {
  if (!isRecord(value) || value.channel !== "activity") {
    return false;
  }
  if (value.type !== "activity.snapshot" && value.type !== "activity.changed") {
    return false;
  }
  return (value.activeThreadId === null || typeof value.activeThreadId === "string")
    && isStatus(value.status)
    && (value.latestSummary === null || typeof value.latestSummary === "string")
    && (value.waitingRequest === null || value.waitingRequest === "permission" || value.waitingRequest === "workspace")
    && (value.error === null || typeof value.error === "string")
    && typeof value.updatedAt === "string";
}

function isStatus(value: unknown): boolean {
  return value === "idle"
    || value === "starting"
    || value === "running"
    || value === "tool_running"
    || value === "waiting"
    || value === "completed"
    || value === "error";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
```

- [ ] **Step 5: 创建 React activity renderer**

修改 `apps/electron-shell/package.json`：

```json
{
  "scripts": {
    "build": "tsc -p tsconfig.json && tsc -p tsconfig.activity-window.json && vite build -c vite.activity-window.config.ts",
    "dev": "pnpm build && electron dist/main/main.js",
    "test": "vitest run"
  },
  "dependencies": {
    "@handagent/core": "workspace:*",
    "react": "^19.2.1",
    "react-dom": "^19.2.1"
  },
  "devDependencies": {
    "@types/node": "^24.10.1",
    "@types/react": "^19.2.7",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^5.1.1",
    "electron": "^42.3.3",
    "typescript": "^5.9.3",
    "vite": "^7.2.6",
    "vitest": "^3.2.4"
  }
}
```

创建 `apps/electron-shell/tsconfig.activity-window.json`：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": ["src/activity-window", "tests/activity-window", "vite.activity-window.config.ts"]
}
```

创建 `apps/electron-shell/vite.activity-window.config.ts`：

```typescript
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  base: "./",
  root: "src/activity-window",
  build: {
    outDir: "../../dist/activity-window",
    emptyOutDir: true,
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
```

创建 `apps/electron-shell/src/activity-window/index.html`：

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>HandAgent Activity</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/main.tsx"></script>
  </body>
</html>
```

创建 `apps/electron-shell/src/activity-window/App.tsx`：

```tsx
import { useEffect, useMemo, useState } from "react";
import { ActivitySocketClient } from "./activitySocketClient.js";
import {
  activityDisplay,
  initialActivityState,
  reduceActivityEvent,
  type ActivityState,
} from "./activityState.js";

declare global {
  interface Window {
    handAgentActivityWindowConfig?: { activityWebSocketURL?: string };
    handAgentActivityWindow?: {
      focusThread(threadId: string | null): void;
    };
  }
}

export function App() {
  const [activity, setActivity] = useState<ActivityState>(initialActivityState);
  const display = useMemo(() => activityDisplay(activity), [activity]);

  useEffect(() => {
    const url = window.handAgentActivityWindowConfig?.activityWebSocketURL
      ?? "ws://127.0.0.1:4317/api/activity";
    const client = new ActivitySocketClient({
      url,
      onEvent: (event) => setActivity((current) => reduceActivityEvent(current, event)),
    });
    client.connect();
    return () => client.close();
  }, []);

  return (
    <button
      className={`activity-bubble activity-bubble--${display.tone}`}
      type="button"
      onClick={() => window.handAgentActivityWindow?.focusThread(activity.activeThreadId ?? null)}
      aria-label={display.label}
    >
      <span className="activity-bubble__indicator" aria-hidden="true" />
      <span className="activity-bubble__content">
        <span className="activity-bubble__label">{display.label}</span>
        <span className="activity-bubble__detail">{display.detail}</span>
      </span>
    </button>
  );
}
```

创建 `apps/electron-shell/src/activity-window/main.tsx`：

```tsx
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./styles.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("missing root element");
}

createRoot(root).render(<App />);
```

创建 `apps/electron-shell/src/activity-window/styles.css`：

```css
* {
  box-sizing: border-box;
}

html,
body,
#root {
  width: 100%;
  height: 100%;
  margin: 0;
}

body {
  overflow: hidden;
  background: transparent;
  color: #2c2721;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.activity-bubble {
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border: 1px solid rgba(58, 50, 41, 0.18);
  border-radius: 18px;
  background: rgba(250, 249, 245, 0.94);
  box-shadow: 0 12px 36px rgba(32, 28, 22, 0.2);
  color: inherit;
  text-align: left;
  cursor: pointer;
  -webkit-app-region: drag;
}

.activity-bubble__indicator,
.activity-bubble__content {
  -webkit-app-region: no-drag;
}

.activity-bubble__indicator {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: #8f8a80;
}

.activity-bubble__content {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.activity-bubble__label {
  font-size: 13px;
  font-weight: 650;
  line-height: 16px;
}

.activity-bubble__detail {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  line-height: 16px;
  color: rgba(44, 39, 33, 0.72);
}

.activity-bubble--running .activity-bubble__indicator {
  background: #cc785c;
  box-shadow: 0 0 0 5px rgba(204, 120, 92, 0.14);
}

.activity-bubble--tool .activity-bubble__indicator {
  background: #3c8d87;
  box-shadow: 0 0 0 5px rgba(60, 141, 135, 0.14);
}

.activity-bubble--waiting .activity-bubble__indicator {
  background: #b8893b;
  box-shadow: 0 0 0 5px rgba(184, 137, 59, 0.14);
}

.activity-bubble--done .activity-bubble__indicator {
  background: #5f8d5a;
}

.activity-bubble--error .activity-bubble__indicator {
  background: #b94a48;
  box-shadow: 0 0 0 5px rgba(185, 74, 72, 0.14);
}
```

- [ ] **Step 6: 验证 renderer tests 和 build 通过**

运行：

```bash
pnpm install
pnpm --filter handagent-electron-shell test activityState.test.ts activitySocketClient.test.ts
pnpm --filter handagent-electron-shell build
```

预期：两个测试 PASS，build 生成 `apps/electron-shell/dist/activity-window/index.html`。

- [ ] **Step 7: 提交 Electron activity renderer**

运行：

```bash
git add apps/electron-shell/package.json \
  apps/electron-shell/tsconfig.activity-window.json \
  apps/electron-shell/vite.activity-window.config.ts \
  apps/electron-shell/src/activity-window \
  apps/electron-shell/tests/activity-window \
  pnpm-lock.yaml
git commit -m "feat: add electron activity renderer"
```

### Task 5: 接线 Electron activity window 和 Swift command bridge

**Files:**
- Create: `apps/electron-shell/src/preload/activityWindowPreload.ts`
- Create: `apps/electron-shell/tests/preload/activityWindowPreload.test.ts`
- Create: `apps/electron-shell/src/main/windows/activityWindowController.ts`
- Create: `apps/electron-shell/tests/windows/activityWindowController.test.ts`
- Modify: `apps/electron-shell/src/main/protocol/electronShellProtocol.ts`
- Modify: `apps/electron-shell/tests/protocol/electronShellProtocol.test.ts`
- Modify: `apps/electron-shell/src/main/electronShellRuntime.ts`
- Modify: `apps/electron-shell/tests/main/electronShellRuntime.test.ts`
- Modify: `apps/electron-shell/src/main/main.ts`
- Modify: `apps/desktop/Sources/AppServices/ElectronShell/ElectronShellProtocol.swift`
- Modify: `apps/desktop/TestsSwift/AppServices/ElectronShell/ElectronShellProtocolTests.swift`
- Create: `apps/desktop/Sources/AppServices/ElectronShell/ActivityWindowCommanding.swift`
- Modify: `apps/desktop/Sources/AppServices/ElectronShell/ElectronBackedAppServer.swift`
- Modify: `apps/desktop/TestsSwift/AppServices/ElectronShell/ElectronBackedAppServerTests.swift`

- [ ] **Step 1: 写 Electron protocol/runtime 失败测试**

在 `apps/electron-shell/tests/protocol/electronShellProtocol.test.ts` 增加：

```typescript
it("parses activity window show commands", () => {
  const command = parseCommand(JSON.stringify({
    channel: "electron_shell",
    type: "activity_window.show",
    commandId: "cmd-activity",
  }));

  expect(command.type).toBe("activity_window.show");
});

it("encodes prompt panel request events", () => {
  expect(encodeEvent({
    channel: "electron_shell",
    type: "prompt_panel.show_requested",
    reason: "activity_window.clicked_without_thread",
  })).toBe("{\"channel\":\"electron_shell\",\"type\":\"prompt_panel.show_requested\",\"reason\":\"activity_window.clicked_without_thread\"}");
});
```

在 `apps/electron-shell/tests/main/electronShellRuntime.test.ts` 的 harness 中加入 `activityWindow` fake，并增加：

```typescript
it("acknowledges activity window show commands", async () => {
  const harness = createHarness();

  await harness.runtime.handleCommand({
    channel: "electron_shell",
    type: "activity_window.show",
    commandId: "cmd-activity",
  });

  expect(harness.activityWindow.show).toHaveBeenCalledTimes(1);
  expect(harness.events).toContainEqual({
    channel: "electron_shell",
    type: "command.ack",
    commandId: "cmd-activity",
    ok: true,
  });
});

it("requests the Swift prompt panel when activity click cannot focus a thread window", () => {
  const harness = createHarness({ focusResult: false });

  harness.runtime.handleActivityWindowFocusRequest("thread-1");

  expect(harness.events).toContainEqual({
    channel: "electron_shell",
    type: "prompt_panel.show_requested",
    reason: "activity_window.clicked_without_thread",
  });
});
```

运行：

```bash
pnpm --filter handagent-electron-shell test electronShellProtocol.test.ts electronShellRuntime.test.ts
```

预期：FAIL，runtime 尚未接 activity host，event 类型尚不存在。

- [ ] **Step 2: 修改 Electron protocol 和 runtime**

在 `apps/electron-shell/src/main/protocol/electronShellProtocol.ts` 的 `ElectronToSwiftEvent` union 中加入：

```typescript
| {
    channel: "electron_shell";
    type: "prompt_panel.show_requested";
    reason: "activity_window.clicked_without_thread";
  }
```

在 `apps/electron-shell/src/main/electronShellRuntime.ts` 中新增 host 类型：

```typescript
type ActivityWindowHost = {
  show(): Promise<void>;
};
```

在 `Options` 加入：

```typescript
activityWindow: ActivityWindowHost;
```

把 `activity_window.show` 分支改为：

```typescript
case "activity_window.show":
  await this.runCommand(command, () => this.options.activityWindow.show());
  return;
```

新增方法：

```typescript
handleActivityWindowFocusRequest(threadId: string | null): void {
  if (threadId && this.options.prewarmer.focus()) {
    return;
  }
  this.options.send({
    channel: "electron_shell",
    type: "prompt_panel.show_requested",
    reason: "activity_window.clicked_without_thread",
  });
}
```

更新测试 harness：

```typescript
const activityWindow = {
  show: vi.fn(async () => {}),
};
const runtime = new ElectronShellRuntime({
  prewarmer,
  activityWindow,
  send: (event) => events.push(event),
  now: () => "2026-06-08T00:00:00.000Z",
  stopSupervisor,
  quit,
});
return { runtime, prewarmer, activityWindow, events, stopSupervisor, quit };
```

- [ ] **Step 3: 创建 activity preload**

创建 `apps/electron-shell/src/preload/activityWindowPreload.ts`：

```typescript
import { contextBridge, ipcRenderer } from "electron";

declare global {
  interface Window {
    handAgentActivityWindowConfig?: { activityWebSocketURL?: string };
  }
}

const activityWebSocketURL = "ws://127.0.0.1:4317/api/activity";

contextBridge.executeInMainWorld({
  func: (url: string) => {
    window.handAgentActivityWindowConfig = { activityWebSocketURL: url };
  },
  args: [activityWebSocketURL],
});

contextBridge.exposeInMainWorld("handAgentActivityWindow", {
  focusThread(threadId: string | null) {
    ipcRenderer.send("activity-window:focus-thread", threadId);
  },
});
```

创建 `apps/electron-shell/tests/preload/activityWindowPreload.test.ts`：

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

type MainWorldScript = {
  func: (url: string) => void;
  args: [string];
};

type ActivityWindowGlobals = {
  handAgentActivityWindowConfig?: { activityWebSocketURL?: string };
};

describe("activityWindowPreload", () => {
  beforeEach(() => {
    vi.resetModules();
    delete (globalThis as { window?: ActivityWindowGlobals }).window;
  });

  it("installs activity config and focus bridge", async () => {
    const ipcRenderer = { send: vi.fn() };
    const contextBridge = {
      executeInMainWorld: vi.fn(),
      exposeInMainWorld: vi.fn(),
    };
    vi.doMock("electron", () => ({ contextBridge, ipcRenderer }));

    await import("../../src/preload/activityWindowPreload.js");

    const script = contextBridge.executeInMainWorld.mock.calls[0]?.[0] as MainWorldScript;
    const mainWorld: ActivityWindowGlobals = {};
    (globalThis as { window?: ActivityWindowGlobals }).window = mainWorld;
    script.func(...script.args);

    expect(mainWorld.handAgentActivityWindowConfig?.activityWebSocketURL).toBe(
      "ws://127.0.0.1:4317/api/activity",
    );
    const exposed = contextBridge.exposeInMainWorld.mock.calls[0]?.[1] as {
      focusThread(threadId: string | null): void;
    };
    exposed.focusThread("thread-1");
    expect(ipcRenderer.send).toHaveBeenCalledWith("activity-window:focus-thread", "thread-1");
  });
});
```

- [ ] **Step 4: 创建 ActivityWindowController**

创建 `apps/electron-shell/tests/windows/activityWindowController.test.ts`：

```typescript
import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { ActivityWindowController } from "../../src/main/windows/activityWindowController.js";

describe("ActivityWindowController", () => {
  it("creates a frameless transparent activity window and shows it inactive", async () => {
    const window = new FakeActivityWindow();
    const controller = new ActivityWindowController({
      activityWindowHTMLPath: "/repo/apps/electron-shell/dist/activity-window/index.html",
      preloadPath: "/repo/apps/electron-shell/dist/preload/activityWindowPreload.js",
      screenProvider: () => ({ x: 0, y: 0, width: 1440, height: 900 }),
      createWindow: (options) => {
        expect(options.frame).toBe(false);
        expect(options.transparent).toBe(true);
        expect(options.show).toBe(false);
        expect(options.webPreferences?.contextIsolation).toBe(true);
        expect(options.webPreferences?.nodeIntegration).toBe(false);
        return window;
      },
    });

    await controller.show();

    expect(window.loadedFile).toBe("/repo/apps/electron-shell/dist/activity-window/index.html");
    expect(window.showInactiveCount).toBe(1);
    expect(window.bounds).toEqual({ x: 1144, y: 780, width: 272, height: 76 });
  });

  it("reuses the activity window while it is alive", async () => {
    const window = new FakeActivityWindow();
    let createCount = 0;
    const controller = new ActivityWindowController({
      activityWindowHTMLPath: "/activity/index.html",
      preloadPath: "/preload.js",
      screenProvider: () => ({ x: 0, y: 0, width: 1200, height: 800 }),
      createWindow: () => {
        createCount += 1;
        return window;
      },
    });

    await controller.show();
    await controller.show();

    expect(createCount).toBe(1);
    expect(window.showInactiveCount).toBe(2);
  });
});

class FakeActivityWindow extends EventEmitter {
  loadedFile: string | null = null;
  showInactiveCount = 0;
  bounds: { x: number; y: number; width: number; height: number } | null = null;
  webContents = new EventEmitter();

  loadFile(path: string): void {
    this.loadedFile = path;
  }

  setBounds(bounds: { x: number; y: number; width: number; height: number }): void {
    this.bounds = bounds;
  }

  showInactive(): void {
    this.showInactiveCount += 1;
  }
}
```

创建 `apps/electron-shell/src/main/windows/activityWindowController.ts`：

```typescript
import type { BrowserWindowConstructorOptions } from "electron";

type DisplayBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type BrowserWindowLike = {
  webContents: {
    on(event: "render-process-gone", listener: (event: unknown, details: { reason: string }) => void): unknown;
  };
  on(event: "closed", listener: () => void): unknown;
  loadFile(path: string): Promise<unknown> | unknown;
  setBounds(bounds: DisplayBounds): void;
  showInactive(): void;
};

type Options = {
  activityWindowHTMLPath: string;
  preloadPath: string;
  createWindow: (options: BrowserWindowConstructorOptions) => BrowserWindowLike;
  screenProvider: () => DisplayBounds;
  onRendererCrashed?: (reason: string) => void;
};

const WINDOW_WIDTH = 272;
const WINDOW_HEIGHT = 76;
const WINDOW_MARGIN = 24;

export class ActivityWindowController {
  private window: BrowserWindowLike | null = null;

  constructor(private readonly options: Options) {}

  async show(): Promise<void> {
    const window = this.window ?? this.createWindow();
    this.position(window);
    const loadResult = window.loadFile(this.options.activityWindowHTMLPath);
    if (isPromiseLike(loadResult)) {
      await loadResult;
    }
    window.showInactive();
  }

  private createWindow(): BrowserWindowLike {
    const window = this.options.createWindow({
      width: WINDOW_WIDTH,
      height: WINDOW_HEIGHT,
      frame: false,
      transparent: true,
      resizable: false,
      movable: true,
      show: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: true,
      webPreferences: {
        preload: this.options.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    window.on("closed", () => {
      if (this.window === window) {
        this.window = null;
      }
    });
    window.webContents.on("render-process-gone", (_event, details) => {
      if (details.reason !== "clean-exit") {
        this.options.onRendererCrashed?.(details.reason);
      }
    });
    this.window = window;
    return window;
  }

  private position(window: BrowserWindowLike): void {
    const display = this.options.screenProvider();
    window.setBounds({
      x: display.x + display.width - WINDOW_WIDTH - WINDOW_MARGIN,
      y: display.y + display.height - WINDOW_HEIGHT - WINDOW_MARGIN,
      width: WINDOW_WIDTH,
      height: WINDOW_HEIGHT,
    });
  }
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return typeof value === "object"
    && value !== null
    && "then" in value
    && typeof value.then === "function";
}
```

- [ ] **Step 5: 接线 Electron main**

在 `apps/electron-shell/src/main/main.ts` import 中加入：

```typescript
import { ipcMain, screen } from "electron";
import { ActivityWindowController } from "./windows/activityWindowController.js";
```

把原来的 `import { BrowserWindow, app } from "electron";` 合并为：

```typescript
import { BrowserWindow, app, ipcMain, screen } from "electron";
```

新增路径：

```typescript
const activityWindowHTMLPath = join(currentDir, "../activity-window/index.html");
const activityPreloadPath = join(currentDir, "../preload/activityWindowPreload.js");
```

创建 controller：

```typescript
const activityWindow = new ActivityWindowController({
  activityWindowHTMLPath,
  preloadPath: activityPreloadPath,
  screenProvider: () => screen.getPrimaryDisplay().workArea,
  onRendererCrashed: (reason) => {
    send({
      channel: "electron_shell",
      type: "renderer.crashed",
      window: "activity",
      reason,
    });
  },
  createWindow: (options) => new BrowserWindow(options),
});
```

在 `new ElectronShellRuntime({` 的参数对象中加入：

```typescript
activityWindow,
```

在 app ready 后或 runtime 创建后接 IPC：

```typescript
ipcMain.on("activity-window:focus-thread", (_event, threadId: string | null) => {
  runtime.handleActivityWindowFocusRequest(threadId);
});
```

- [ ] **Step 6: 写 Swift DTO 和 command client 失败测试**

在 `apps/desktop/TestsSwift/AppServices/ElectronShell/ElectronShellProtocolTests.swift` 增加：

```swift
func testDecodesPromptPanelShowRequestedEvent() throws {
    let data = """
    {"channel":"electron_shell","type":"prompt_panel.show_requested","reason":"activity_window.clicked_without_thread"}
    """.data(using: .utf8)!

    let event = try JSONDecoder().decode(ElectronShellEvent.self, from: data)

    XCTAssertEqual(event, .promptPanelShowRequested(reason: .activityWindowClickedWithoutThread))
}
```

在 `apps/desktop/TestsSwift/AppServices/ElectronShell/ElectronBackedAppServerTests.swift` 增加：

```swift
func testShowActivityWindowSendsCommand() throws {
    let shell = RecordingElectronShellProcess()
    let appServer = ElectronBackedAppServer(shell: shell, platformClient: nil)

    let commandId = try appServer.showActivityWindow()

    guard case .showActivityWindow(let sentCommandId) = shell.sentCommands.first else {
        return XCTFail("expected show activity window command")
    }
    XCTAssertEqual(sentCommandId, commandId)
}

func testPromptPanelShowRequestInvokesCallback() {
    let shell = RecordingElectronShellProcess()
    let appServer = ElectronBackedAppServer(shell: shell, platformClient: nil)
    var requestCount = 0
    appServer.onPromptPanelShowRequested = { requestCount += 1 }

    appServer.start()
    shell.emit(.promptPanelShowRequested(reason: .activityWindowClickedWithoutThread))

    XCTAssertEqual(requestCount, 1)
}
```

运行：

```bash
bash ./scripts/swiftw test --filter ElectronShellProtocolTests
bash ./scripts/swiftw test --filter ElectronBackedAppServerTests
```

预期：FAIL，Swift DTO 和 command client 尚未实现。

- [ ] **Step 7: 修改 Swift DTO 和 ElectronBackedAppServer**

在 `apps/desktop/Sources/AppServices/ElectronShell/ElectronShellProtocol.swift` 中新增：

```swift
enum PromptPanelShowRequestReason: String, Decodable, Equatable {
    case activityWindowClickedWithoutThread = "activity_window.clicked_without_thread"
}
```

在 `ElectronShellEvent` 加 case：

```swift
case promptPanelShowRequested(reason: PromptPanelShowRequestReason)
```

在 CodingKeys 加：

```swift
case reason
```

在 decoder switch 加：

```swift
case "prompt_panel.show_requested":
    self = .promptPanelShowRequested(
        reason: try container.decode(PromptPanelShowRequestReason.self, forKey: .reason)
    )
```

创建 `apps/desktop/Sources/AppServices/ElectronShell/ActivityWindowCommanding.swift`：

```swift
import Foundation

enum ActivityWindowCommandKind: Equatable {
    case show
}

struct ActivityWindowCommandResult: Equatable {
    let commandId: String
    let kind: ActivityWindowCommandKind
    let ok: Bool
    let error: String?
}

@MainActor
protocol ActivityWindowCommanding: AnyObject {
    var onActivityWindowCommandResult: ((ActivityWindowCommandResult) -> Void)? { get set }
    var onPromptPanelShowRequested: (() -> Void)? { get set }

    @discardableResult
    func showActivityWindow() throws -> String
}
```

让 `ElectronBackedAppServer` conform：

```swift
final class ElectronBackedAppServer: AppServerManaging, ThreadWindowCommanding, ActivityWindowCommanding {
```

新增字段：

```swift
private var pendingActivityCommandKinds: [String: ActivityWindowCommandKind] = [:]
var onActivityWindowCommandResult: ((ActivityWindowCommandResult) -> Void)?
var onPromptPanelShowRequested: (() -> Void)?
```

新增方法：

```swift
@discardableResult
func showActivityWindow() throws -> String {
    let commandId = UUID().uuidString
    pendingActivityCommandKinds[commandId] = .show
    do {
        try shell.send(.showActivityWindow(commandId: commandId))
        return commandId
    } catch {
        pendingActivityCommandKinds.removeValue(forKey: commandId)
        throw error
    }
}
```

在 `stop()` 和 `handleTermination(_:)` 中清理：

```swift
pendingActivityCommandKinds.removeAll()
onActivityWindowCommandResult = nil
onPromptPanelShowRequested = nil
```

在 `handle(_:)` switch 加：

```swift
case .promptPanelShowRequested:
    onPromptPanelShowRequested?()
```

把 `handleCommandAck` 扩展为先查 thread，再查 activity：

```swift
private func handleCommandAck(commandId: String, ok: Bool, error: String?) {
    if let kind = pendingCommandKinds.removeValue(forKey: commandId) {
        onCommandResult?(
            ThreadWindowCommandResult(
                commandId: commandId,
                kind: kind,
                ok: ok,
                error: error
            )
        )
        return
    }

    guard let kind = pendingActivityCommandKinds.removeValue(forKey: commandId) else {
        return
    }
    onActivityWindowCommandResult?(
        ActivityWindowCommandResult(
            commandId: commandId,
            kind: kind,
            ok: ok,
            error: error
        )
    )
}
```

- [ ] **Step 8: 验证 Electron/Swift bridge tests 通过**

运行：

```bash
pnpm --filter handagent-electron-shell test electronShellProtocol.test.ts electronShellRuntime.test.ts activityWindowPreload.test.ts activityWindowController.test.ts
bash ./scripts/swiftw test --filter ElectronShellProtocolTests
bash ./scripts/swiftw test --filter ElectronBackedAppServerTests
```

预期：PASS。

- [ ] **Step 9: 提交 activity window bridge**

运行：

```bash
git add apps/electron-shell/src/preload/activityWindowPreload.ts \
  apps/electron-shell/tests/preload/activityWindowPreload.test.ts \
  apps/electron-shell/src/main/windows/activityWindowController.ts \
  apps/electron-shell/tests/windows/activityWindowController.test.ts \
  apps/electron-shell/src/main/protocol/electronShellProtocol.ts \
  apps/electron-shell/tests/protocol/electronShellProtocol.test.ts \
  apps/electron-shell/src/main/electronShellRuntime.ts \
  apps/electron-shell/tests/main/electronShellRuntime.test.ts \
  apps/electron-shell/src/main/main.ts \
  apps/desktop/Sources/AppServices/ElectronShell/ElectronShellProtocol.swift \
  apps/desktop/TestsSwift/AppServices/ElectronShell/ElectronShellProtocolTests.swift \
  apps/desktop/Sources/AppServices/ElectronShell/ActivityWindowCommanding.swift \
  apps/desktop/Sources/AppServices/ElectronShell/ElectronBackedAppServer.swift \
  apps/desktop/TestsSwift/AppServices/ElectronShell/ElectronBackedAppServerTests.swift
git commit -m "feat: add electron activity window bridge"
```

### Task 6: Electron flag 路径停用 Swift StatusBubble

**Files:**
- Modify: `apps/desktop/Sources/AppServices/AppServices.swift`
- Modify: `apps/desktop/TestsSwift/AppServices/AppServicesTests.swift`
- Modify: `apps/desktop/Sources/Coordinator/AppCoordinator.swift`
- Modify: `apps/desktop/TestsSwift/Coordinator/AppCoordinatorTests.swift`

- [ ] **Step 1: 写 AppServices 失败测试**

在 `apps/desktop/TestsSwift/AppServices/AppServicesTests.swift` 增加：

```swift
@MainActor
func testElectronRuntimeProvidesActivityWindowClientAndDisablesSwiftStatusBubble() {
    let services = AppServices(
        environment: ["HANDAGENT_ELECTRON_SHELL": "1"]
    )

    XCTAssertNotNil(services.threadWindowCommandClient)
    XCTAssertNotNil(services.activityWindowCommandClient)
    XCTAssertFalse(services.showsStatusBubble)
    XCTAssertTrue(services.showsFatalAlert)
}
```

运行：

```bash
bash ./scripts/swiftw test --filter AppServicesTests
```

预期：FAIL，`activityWindowCommandClient` 尚不存在。

- [ ] **Step 2: 修改 AppServices runtime**

在 `AppServicesRuntime` 加：

```swift
let activityWindowCommandClient: (any ActivityWindowCommanding)?
```

在 `AppServices` 加属性：

```swift
let activityWindowCommandClient: (any ActivityWindowCommanding)?
```

在 `AppServices` 加属性：

```swift
let showsFatalAlert: Bool
```

在 init 参数加：

```swift
activityWindowCommandClient: (any ActivityWindowCommanding)? = nil,
environment: [String: String] = ProcessInfo.processInfo.environment,
showsFatalAlert: Bool = true,
```

把 runtime 初始化改为：

```swift
let runtime = appServer == nil
    ? AppServices.defaultRuntime(environment: environment, platformServerURL: platformServerURL)
    : nil
```

赋值：

```swift
self.activityWindowCommandClient = activityWindowCommandClient ?? runtime?.activityWindowCommandClient
```

把 `showsStatusBubble` 和 `showsFatalAlert` 赋值改为：

```swift
self.showsStatusBubble = showsStatusBubble && self.activityWindowCommandClient == nil
self.showsFatalAlert = showsFatalAlert
```

在 `AppServices.testing(...)` 中继续传：

```swift
showsFatalAlert: false
```

在 Electron runtime return 中加入：

```swift
return AppServicesRuntime(
    appServer: appServer,
    threadWindowCommandClient: appServer,
    activityWindowCommandClient: appServer
)
```

在默认 runtime return 中加入：

```swift
activityWindowCommandClient: nil
```

- [ ] **Step 3: 写 Coordinator 失败测试**

在 `apps/desktop/TestsSwift/Coordinator/AppCoordinatorTests.swift` 的 electron services helper 增加 activity client 支持：

```swift
private func electronServices(
    commandClient: RecordingThreadWindowCommandClient,
    activityClient: RecordingActivityWindowCommandClient = RecordingActivityWindowCommandClient()
) -> AppServices {
    AppServices(
        appServer: NopAppServer(),
        threadWindowCommandClient: commandClient,
        activityWindowCommandClient: activityClient,
        appServerURL: URL(string: "ws://127.0.0.1:0/noop")!,
        platformServerURL: URL(string: "ws://127.0.0.1:0/noop-platform")!,
        threadWindowWebAppURL: URL(fileURLWithPath: "/tmp/index.html"),
        hotkeyRegistrar: NopHotkeyRegistrar(),
        threadWindowPresenter: NopThreadWindowPresenter(),
        settingsWindowPresenter: NopSettingsWindowPresenter(),
        fatalAlertPresenter: NopFatalAlertPresenter(),
        setActivationPolicy: { _ in },
        showsStatusBubble: true
    )
}
```

新增 fake：

```swift
@MainActor
private final class RecordingActivityWindowCommandClient: ActivityWindowCommanding {
    var onActivityWindowCommandResult: ((ActivityWindowCommandResult) -> Void)?
    var onPromptPanelShowRequested: (() -> Void)?
    private(set) var showCount = 0

    func showActivityWindow() throws -> String {
        showCount += 1
        return "activity-show-\(showCount)"
    }

    func requestPromptPanel() {
        onPromptPanelShowRequested?()
    }
}
```

新增测试：

```swift
@MainActor
func testElectronShowsActivityWindowWhenAppServerBecomesAvailable() {
    let appServer = TriggerableAppServer()
    let threadClient = RecordingThreadWindowCommandClient()
    let activityClient = RecordingActivityWindowCommandClient()
    let services = AppServices(
        appServer: appServer,
        threadWindowCommandClient: threadClient,
        activityWindowCommandClient: activityClient,
        appServerURL: URL(string: "ws://127.0.0.1:0/noop")!,
        platformServerURL: URL(string: "ws://127.0.0.1:0/noop-platform")!,
        threadWindowWebAppURL: URL(fileURLWithPath: "/tmp/index.html"),
        hotkeyRegistrar: NopHotkeyRegistrar(),
        threadWindowPresenter: NopThreadWindowPresenter(),
        settingsWindowPresenter: NopSettingsWindowPresenter(),
        fatalAlertPresenter: NopFatalAlertPresenter(),
        setActivationPolicy: { _ in },
        showsStatusBubble: true
    )
    _ = AppCoordinator(services: services)

    appServer.publishAvailability(true)

    XCTAssertEqual(activityClient.showCount, 1)
}

@MainActor
func testElectronActivityPromptRequestShowsPromptPanelWithoutFocusingThreadWindow() {
    let threadClient = RecordingThreadWindowCommandClient()
    let activityClient = RecordingActivityWindowCommandClient()
    _ = AppCoordinator(services: electronServices(commandClient: threadClient, activityClient: activityClient))

    activityClient.requestPromptPanel()

    XCTAssertTrue(threadClient.focusedThreadIDs.isEmpty)
}
```

在测试文件底部新增 app-server fake：

```swift
@MainActor
private final class TriggerableAppServer: AppServerManaging {
    var isAvailable = true
    var startupErrorMessage: String?
    var onAvailabilityChange: ((Bool) -> Void)?
    var onFatalError: ((String) -> Void)?

    func start() {}
    func stop() {}

    func publishAvailability(_ available: Bool) {
        isAvailable = available
        onAvailabilityChange?(available)
    }
}
```

运行：

```bash
bash ./scripts/swiftw test --filter AppCoordinatorTests
```

预期：FAIL，Coordinator 尚未接 activity client。

- [ ] **Step 4: 修改 Coordinator 接线**

在 `AppCoordinator` 初始化 `AgentServerHealth` 时改用独立 fatal alert 开关：

```swift
self.agentServerHealth = AgentServerHealth(
    appServer: services.appServer,
    fatalAlertPresenter: services.fatalAlertPresenter,
    showsFatalAlert: services.showsFatalAlert
)
```

在 `AppCoordinator` 新增字段：

```swift
@ObservationIgnored private let activityWindowCommandClient: (any ActivityWindowCommanding)?
```

在 init 中赋值：

```swift
self.activityWindowCommandClient = services.activityWindowCommandClient
```

在 `setupAgentServerHealth()` 的 availability callback 中，当 `available == true` 时显示 Electron activity window：

```swift
if available {
    try? self.activityWindowCommandClient?.showActivityWindow()
}
```

新增 setup 方法：

```swift
private func setupElectronActivityWindow() {
    activityWindowCommandClient?.onPromptPanelShowRequested = { [weak self] in
        self?.promptPanelController.show()
    }
}
```

在 `bootstrap()` 中 `setupStatusBubble()` 后调用：

```swift
setupElectronActivityWindow()
```

保留：

```swift
if services.showsStatusBubble { statusBubbleController.show() }
```

这样默认路径继续显示 Swift StatusBubble；Electron flag 路径因为 `showsStatusBubble == false` 不创建旧气泡，改由 Electron activity command 显示。

- [ ] **Step 5: 验证 Swift coordinator tests 通过**

运行：

```bash
bash ./scripts/swiftw test --filter AppServicesTests
bash ./scripts/swiftw test --filter AppCoordinatorTests
```

预期：PASS。

- [ ] **Step 6: 提交 Swift StatusBubble 切换**

运行：

```bash
git add apps/desktop/Sources/AppServices/AppServices.swift \
  apps/desktop/TestsSwift/AppServices/AppServicesTests.swift \
  apps/desktop/Sources/Coordinator/AppCoordinator.swift \
  apps/desktop/TestsSwift/Coordinator/AppCoordinatorTests.swift
git commit -m "feat: route status bubble through electron activity window"
```

### Task 7: 更新文档与手工 QA

**Files:**
- Modify: `handAgent.md`
- Modify: `apps/apps.md`
- Modify: `apps/agent-server/agent-server.md`
- Modify: `apps/agent-server/src/server/server.md`
- Modify: `apps/agent-server/src/thread/thread.md`
- Modify: `packages/core/src/protocol/protocol.md`
- Modify: `apps/electron-shell/electron-shell.md`
- Modify: `apps/desktop/desktop.md`
- Modify: `apps/desktop/Sources/StatusBubble/status-bubble.md`
- Modify: `apps/desktop/Sources/AppServices/app-services.md`
- Modify: `apps/desktop/Sources/AppServices/ElectronShell/electron-shell.md`
- Modify: `docs/manual-qa.md`

- [ ] **Step 1: 更新架构文档**

在 `handAgent.md` 的架构图中加入 activity stream：

```mermaid
  E -. BrowserWindow host .-> AUI[Electron StatusBubble]
  AUI -->|/api/activity WebSocket| B
```

在 `handAgent.md` 的 `apps/electron-shell` 职责中补充：

```markdown
Phase 2 Electron UI shell 在 `HANDAGENT_ELECTRON_SHELL=1` 时还承载 React StatusBubble。该窗口直接订阅 `/api/activity`，点击时通过 Electron main 聚焦 Electron ThreadWindow；无法聚焦时 Electron 回告 Swift 打开 PromptPanel。Swift 默认路径的 StatusBubble 仍存在，但 Electron flag 路径不再显示 Swift StatusBubble。
```

在 `apps/apps.md` 的入口表把 `electron-shell` 改为：

```markdown
- [electron-shell/electron-shell.md](/Users/mu9/proj/handAgent/apps/electron-shell/electron-shell.md) —— Phase 2 Electron UI shell；feature flag 路径下监督 agent-server，承载 Electron ThreadWindow 和 React StatusBubble。
```

在 `apps/agent-server/agent-server.md` 的入口表中加入：

```markdown
| `ws://127.0.0.1:4317/api/activity` | Electron StatusBubble；后续桌宠 | 只发送 `AgentActivityEvent`，连接后先发 `activity.snapshot`，状态变化时发 `activity.changed` |
```

在 `packages/core/src/protocol/protocol.md` 文件表中加入：

```markdown
| `AgentActivity.ts` | `/api/activity` 轻量活动流：`activity.snapshot` / `activity.changed` |
```

- [ ] **Step 2: 更新模块文档**

在 `apps/electron-shell/electron-shell.md` 把标题说明改为 Phase 2，并加入：

```markdown
## Phase 2 StatusBubble

- `ActivityWindowController` 创建 frameless/transparent Electron `BrowserWindow`，加载 `dist/activity-window/index.html`。
- activity renderer 直接连接 `ws://127.0.0.1:4317/api/activity`。
- preload 只暴露 activity WebSocket URL 和 `focusThread(threadId)`；renderer 不获得 Node/Electron 全量能力。
- 点击气泡后 Electron main 优先聚焦 visible ThreadWindow；如果没有可聚焦窗口，发送 `prompt_panel.show_requested` 给 Swift。
```

在 `apps/desktop/Sources/StatusBubble/status-bubble.md` 顶部补充：

```markdown
> Electron flag 路径说明：当 `HANDAGENT_ELECTRON_SHELL=1` 时，本 Swift StatusBubble 不显示。状态气泡由 `apps/electron-shell` 的 React activity renderer 承载，并订阅 `/api/activity`。
```

在 `apps/desktop/Sources/AppServices/app-services.md` 的 `AppServices.swift` 行中把 `showsStatusBubble` 说明改为：

```markdown
`showsStatusBubble` 只控制默认路径的 Swift StatusBubble；`showsFatalAlert` 控制 agent-server fatal alert。Electron flag 路径下 `activityWindowCommandClient` 存在，因此 Swift StatusBubble 默认关闭，但 fatal alert 仍保持开启。
```

在 `apps/desktop/Sources/AppServices/ElectronShell/electron-shell.md` 加：

```markdown
## Phase 2 ActivityWindow commands

Swift 通过 `ActivityWindowCommanding.showActivityWindow()` 发送 `activity_window.show`。Electron ack 后只表示窗口 show command 已执行，不代表 `/api/activity` 已产生非 idle 状态。

Electron StatusBubble 点击且无法聚焦 ThreadWindow 时，会发送 `prompt_panel.show_requested`；Swift 只负责打开 PromptPanel，不解析 activity 状态。
```

在 `apps/agent-server/src/server/server.md` 的路径分派中加入 `/api/activity` 分支说明。

在 `apps/agent-server/src/thread/thread.md` 的 `ThreadNotificationPublisher` 段落中加入：

```markdown
Phase 2 起，publisher 会把每个 `ThreadNotification` / `ServerRequest` 旁路交给 `AgentActivityPublisher`。这不会改变 `/api/thread` 的订阅分发；它只让 `/api/activity` 能从同一事件源派生轻量状态。
```

- [ ] **Step 3: 更新 manual QA**

在 `docs/manual-qa.md` 加入：

```markdown
## Electron UI Shell Phase 2（P2）

1. 默认不设置 `HANDAGENT_ELECTRON_SHELL`，运行 `bash ./scripts/swiftw run HandAgentDesktop`，确认右下角显示 Swift StatusBubble，PromptPanel 提交仍打开默认路径或当前分支配置下的 ThreadWindow。
1. 运行 `pnpm --filter handagent-electron-shell build`。
1. 设置 `HANDAGENT_ELECTRON_SHELL=1` 后运行桌面 App，确认不再显示 Swift StatusBubble，右下角显示 Electron React StatusBubble。
1. 提交一个普通 prompt，确认 Electron StatusBubble 从 idle 变为 starting/running/completed，ThreadWindow 仍显示正常消息流。
1. 触发一个 tool 调用，确认 Electron StatusBubble 显示工具运行态，例如 `正在使用 <toolName>`。
1. 触发 permission 或 workspace 请求，确认 Electron StatusBubble 显示等待确认态，ThreadWindow 内联请求面板仍可回执。
1. 触发模型配置错误或 provider 错误，确认 Electron StatusBubble 显示 error 态，ThreadWindow 错误气泡仍可见。
1. 点击 Electron StatusBubble，若 Electron ThreadWindow 可见，确认聚焦 ThreadWindow；若无可聚焦 ThreadWindow，确认 Swift PromptPanel 打开。
1. 断开并重连 `/api/activity` subscriber，确认新连接立即收到 `activity.snapshot`，不会影响 `/api/thread` 消息流。
1. 退出 HandAgent 后确认 Electron、Node agent-server 和 activity renderer 进程不残留。
```

- [ ] **Step 4: 文档审核子 agent**

按仓库 AGENTS 的 spec 完成流程，分发一个独立子 agent，只做文档审核与文档更新。给子 agent 的任务：

```text
请审核 Electron UI Shell Phase 2 实现后的文档一致性。

必须阅读：
- docs/superpowers/specs/2026-06-08-electron-ui-shell-migration.md
- docs/superpowers/plans/2026-06-08-electron-ui-shell-phase-2.md
- 所有本阶段修改文件所在目录的 <dir>.md，并沿父目录读到 handAgent.md

核对：
- Phase 2 代码、spec、相关 md 是否一致
- /api/activity、Electron StatusBubble、Swift StatusBubble 默认路径边界是否一致
- docs/manual-qa.md 是否包含未通过实机 QA 的 Phase 2 验收项

请直接更新过期 md，并在最终回复列出修改过的文档路径和剩余风险。
```

- [ ] **Step 5: 提交文档更新**

在主 agent 确认子 agent 返回审核结论后运行：

```bash
git add handAgent.md \
  apps/apps.md \
  apps/agent-server/agent-server.md \
  apps/agent-server/src/server/server.md \
  apps/agent-server/src/thread/thread.md \
  packages/core/src/protocol/protocol.md \
  apps/electron-shell/electron-shell.md \
  apps/desktop/desktop.md \
  apps/desktop/Sources/StatusBubble/status-bubble.md \
  apps/desktop/Sources/AppServices/app-services.md \
  apps/desktop/Sources/AppServices/ElectronShell/electron-shell.md \
  docs/manual-qa.md
git commit -m "docs: update electron activity status bubble phase"
```

### Task 8: 全量验证

**Files:**
- No file changes

- [ ] **Step 1: 运行 TypeScript 全量测试**

运行：

```bash
bash ./scripts/test.sh
```

预期：PASS。

- [ ] **Step 2: 运行 Swift 测试**

运行：

```bash
bash ./scripts/swiftw test
```

预期：PASS。

- [ ] **Step 3: 运行 Swift build**

运行：

```bash
bash ./scripts/swiftw build
```

预期：PASS。

- [ ] **Step 4: 运行 Electron shell build**

运行：

```bash
pnpm --filter handagent-electron-shell build
```

预期：PASS，`dist/main/main.js`、`dist/preload/activityWindowPreload.js` 和 `dist/activity-window/index.html` 均存在。

- [ ] **Step 5: 运行 ThreadWindow Web build**

运行：

```bash
pnpm --filter handagent-thread-window-web build
```

预期：PASS。

- [ ] **Step 6: 检查 diff 空白错误**

运行：

```bash
git diff --check "$(git merge-base HEAD main)"..HEAD
```

预期：无输出。

- [ ] **Step 7: 提交最终验证记录**

如果前面任务已经分别提交，本步骤不新增 commit。记录以下结果供最终汇报：

```text
bash ./scripts/test.sh: PASS
bash ./scripts/swiftw test: PASS
bash ./scripts/swiftw build: PASS
pnpm --filter handagent-electron-shell build: PASS
pnpm --filter handagent-thread-window-web build: PASS
git diff --check "$(git merge-base HEAD main)"..HEAD: PASS
```

## Self-Review

**Spec coverage:** 本计划覆盖 Phase 2 的四个目标：agent-server activity publisher、Electron StatusBubble 订阅 `/api/activity`、Swift StatusBubble 在 Electron flag 路径停用、Electron StatusBubble 点击聚焦 ThreadWindow 或回告 Swift 打开 PromptPanel。桌宠、`utilityProcess` 固化和打包签名留在 Phase 3/4，未混入本阶段。

**Placeholder scan:** 本计划没有把占位词或泛化动作作为执行步骤。每个新增文件都有明确路径、职责、测试和关键代码。

**Type consistency:** `AgentActivityEvent` 统一使用 `channel: "activity"`、`activity.snapshot`、`activity.changed`、`activeThreadId`、`latestSummary`、`waitingRequest`、`updatedAt`。Electron command 保持 `activity_window.show`；PromptPanel fallback event 统一为 `prompt_panel.show_requested`，Swift reason enum 与 TypeScript reason 字符串一致。

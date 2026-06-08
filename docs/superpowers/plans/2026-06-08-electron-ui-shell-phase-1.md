# Electron UI Shell Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `HANDAGENT_ELECTRON_SHELL=1` 路径下，让 PromptPanel 提交和历史入口打开 Electron `BrowserWindow` ThreadWindow，替代 Swift `WKWebView` host，同时保持默认路径不变。

**Architecture:** Phase 1 把 ThreadWindow host 生命周期从 Swift `NSWindow/WKWebView` 切到 Electron main 管理的全局唯一 `BrowserWindow`。Swift 仍保留 PromptPanel、Settings、全局热键、焦点恢复和 `/api/platform`，但通过 `ThreadWindowManaging` 抽象选择 WKWebView 或 Electron command client；React 仍直接连接 `/api/thread`，继续作为 tabs、历史、消息、请求面板和 composer 的 UI 状态源。

**Tech Stack:** Swift 6, AppKit, XCTest, Electron, TypeScript, Vitest, React ThreadWindow bundle, newline-delimited JSON over stdio.

---

## Scope Check

本计划只实现迁移 spec 的 Phase 1：

- PromptPanel 打开时向 Electron 发送 `thread_window.prepare`，触发或复用隐藏预热。
- PromptPanel submit 在 Electron flag 路径下发送 `thread_window.open_initial_prompt`，不创建 Swift `ThreadWindowWebHost` / `WKWebView`。
- `openHistory` 在 Electron flag 路径下发送 `thread_window.open_history`。
- `statusBubbleTapped(threadID:)` 在 Electron flag 路径下发送 `thread_window.focus`；如果没有可聚焦窗口，仍回到 PromptPanel。
- Electron ThreadWindow 关闭后向 Swift 回报关闭事件，Swift 更新自身窗口打开状态，并等待 Electron 重新预热。
- 默认未设置 `HANDAGENT_ELECTRON_SHELL` 时，现有 Swift `WKWebView` 路径行为不变。

本计划不新增 `/api/activity`，不迁移 StatusBubble，不实现桌宠，不处理打包签名，不把 platform tool 迁到 Electron。

## File Map

| 操作 | 路径 | 职责 |
|------|------|------|
| Modify | `apps/electron-shell/src/main/protocol/electronShellProtocol.ts` | 增加 `thread_window.prepare` command；给 `thread_window.closed` event 增加可见窗口语义 |
| Modify | `apps/electron-shell/tests/protocol/electronShellProtocol.test.ts` | 覆盖新增 command / event |
| Modify | `apps/electron-shell/src/main/windows/threadWindowPrewarmer.ts` | 把隐藏预热器升级为 Electron ThreadWindow host 状态机 |
| Modify | `apps/electron-shell/tests/windows/threadWindowPrewarmer.test.ts` | 覆盖 prepare/open/focus/history/close 状态 |
| Create | `apps/electron-shell/src/main/electronShellRuntime.ts` | 抽出 main command handling，便于不启动真实 Electron app 的单测 |
| Create | `apps/electron-shell/tests/main/electronShellRuntime.test.ts` | 覆盖 Phase 1 command ack 与 close event |
| Modify | `apps/electron-shell/src/main/main.ts` | 使用 `electronShellRuntime` 接线真实 `BrowserWindow`、bridge 和 supervisor |
| Modify | `apps/desktop/Sources/AppServices/ElectronShell/ElectronShellProtocol.swift` | Swift DTO 增加 prepare command 与 close event 语义 |
| Modify | `apps/desktop/TestsSwift/AppServices/ElectronShell/ElectronShellProtocolTests.swift` | Swift DTO 编解码覆盖新增字段 |
| Create | `apps/desktop/Sources/AppServices/ElectronShell/ThreadWindowCommanding.swift` | Swift 侧 Electron ThreadWindow command client 协议 |
| Modify | `apps/desktop/Sources/AppServices/ElectronShell/ElectronBackedAppServer.swift` | 实现 `ThreadWindowCommanding`，处理 visible close 回调 |
| Modify | `apps/desktop/TestsSwift/AppServices/ElectronShell/ElectronBackedAppServerTests.swift` | 覆盖 command 发送、close 回调和可用性门控 |
| Create | `apps/desktop/Sources/Coordinator/ThreadWindowManaging.swift` | Coordinator 使用的 ThreadWindow 抽象 |
| Modify | `apps/desktop/Sources/Coordinator/ThreadWindowLifecycle.swift` | 现有 WKWebView lifecycle conform `ThreadWindowManaging` |
| Create | `apps/desktop/Sources/Coordinator/ElectronThreadWindowLifecycle.swift` | Electron flag 路径下的 ThreadWindow lifecycle |
| Modify | `apps/desktop/Sources/AppServices/AppServices.swift` | 默认 runtime 同时提供 app server 与可选 Electron ThreadWindow client |
| Modify | `apps/desktop/TestsSwift/AppServices/AppServicesTests.swift` | 覆盖 Electron flag 下 app server 和 thread client 是同一个 runtime 边界 |
| Modify | `apps/desktop/Sources/Coordinator/AppCoordinator.swift` | 通过 `ThreadWindowManaging` 路由 submit/history/focus/prepare |
| Modify | `apps/desktop/TestsSwift/Coordinator/AppCoordinatorTests.swift` | 覆盖默认路径不变与 Electron 路径不创建 WKWebView |
| Modify | `apps/desktop/TestsSwift/Coordinator/ThreadWindowLifecycleTests.swift` | 断言 WKWebView lifecycle 继续保持旧行为 |
| Create | `apps/desktop/TestsSwift/Coordinator/ElectronThreadWindowLifecycleTests.swift` | 覆盖 Electron lifecycle command 发送 |
| Modify | `handAgent.md` | 记录 Phase 1 Electron flag 下 ThreadWindow submit 路径已接管 |
| Modify | `apps/apps.md` | 更新 apps 层 ThreadWindow 流转 |
| Modify | `apps/desktop/desktop.md` | 更新启动流程和主调用链路 |
| Modify | `apps/desktop/Sources/Coordinator/coordinator.md` | 更新 Coordinator ThreadWindow 抽象 |
| Modify | `apps/desktop/Sources/ThreadWindow/thread-window.md` | 说明 Swift WKWebView host 只服务默认路径 |
| Modify | `apps/desktop/Sources/AppServices/ElectronShell/electron-shell.md` | 记录 Phase 1 command client 语义 |
| Modify | `apps/electron-shell/electron-shell.md` | 记录 Electron ThreadWindow host 已接管 submit/history |
| Modify | `apps/thread-window-web/thread-window-web.md` | 说明 Electron renderer 与 WKWebView renderer 共用同一 initial prompt receiver |
| Modify | `docs/manual-qa.md` | 增加 Electron UI Shell Phase 1 手工验收项 |

## External Facts To Preserve

- Electron `BrowserWindow({ show: false })` 能隐藏创建窗口；预热阶段不能调用 `show()` 或 `focus()`。
- Electron renderer 继续 `contextIsolation: true`、`nodeIntegration: false`，ThreadWindow React 只拿到 `handAgentThreadWindowConfig` 和 initial prompt receiver。
- Swift 不发送 `/api/thread` command，不解析 `ThreadNotification`；它只把 initial prompt payload 交给 Electron main/preload。
- React 的 initial prompt receiver 名称保持 `window.handAgentReceiveInitialPrompt`，这样 WKWebView 与 Electron 两条 host 路径共用同一 React 入口。
- `HANDAGENT_ELECTRON_SHELL=1` 是唯一切换条件；默认路径继续由 Swift `AppServer + WKWebView` 承接真实提交。

## Tasks

### Task 1: 扩展 Swift/Electron shell 协议

**Files:**
- Modify: `apps/electron-shell/src/main/protocol/electronShellProtocol.ts`
- Modify: `apps/electron-shell/tests/protocol/electronShellProtocol.test.ts`
- Modify: `apps/desktop/Sources/AppServices/ElectronShell/ElectronShellProtocol.swift`
- Modify: `apps/desktop/TestsSwift/AppServices/ElectronShell/ElectronShellProtocolTests.swift`

- [ ] **Step 1: 写 TypeScript 协议失败测试**

在 `apps/electron-shell/tests/protocol/electronShellProtocol.test.ts` 增加：

```typescript
it("parses prepare commands", () => {
  const command = parseCommand(JSON.stringify({
    channel: "electron_shell",
    type: "thread_window.prepare",
    commandId: "cmd-prepare",
  }));

  expect(command.type).toBe("thread_window.prepare");
});

it("encodes visible thread window close events", () => {
  expect(encodeEvent({
    channel: "electron_shell",
    type: "thread_window.closed",
    timestamp: "2026-06-08T00:00:00.000Z",
    wasVisible: true,
  })).toBe("{\"channel\":\"electron_shell\",\"type\":\"thread_window.closed\",\"timestamp\":\"2026-06-08T00:00:00.000Z\",\"wasVisible\":true}");
});
```

运行：

```bash
pnpm --filter handagent-electron-shell test electronShellProtocol.test.ts
```

预期：FAIL，`thread_window.prepare` 尚未被 guard 接受，`thread_window.closed` 类型尚无 `wasVisible`。

- [ ] **Step 2: 修改 TypeScript 协议类型**

在 `apps/electron-shell/src/main/protocol/electronShellProtocol.ts` 中把 `SwiftToElectronCommand` 改成包含 prepare：

```typescript
export type SwiftToElectronCommand =
  | {
      channel: "electron_shell";
      type: "thread_window.prepare";
      commandId: string;
    }
  | {
      channel: "electron_shell";
      type: "thread_window.open_initial_prompt";
      commandId: string;
      payload: InitialPromptPayload;
    }
  | {
      channel: "electron_shell";
      type: "thread_window.open_history";
      commandId: string;
    }
  | {
      channel: "electron_shell";
      type: "thread_window.focus";
      commandId: string;
      threadId?: string | null;
    }
  | {
      channel: "electron_shell";
      type: "activity_window.show";
      commandId: string;
    }
  | {
      channel: "electron_shell";
      type: "shutdown";
      commandId: string;
    };
```

把 `ElectronToSwiftEvent` 中的 close event 改为：

```typescript
| {
    channel: "electron_shell";
    type: "thread_window.closed";
    timestamp: string;
    wasVisible: boolean;
  }
```

在 `isSwiftToElectronCommand` 的 switch 中加入：

```typescript
case "thread_window.prepare":
```

并让它和 `thread_window.open_history`、`activity_window.show`、`shutdown` 一样返回 `true`。

- [ ] **Step 3: 验证 TypeScript 协议测试通过**

运行：

```bash
pnpm --filter handagent-electron-shell test electronShellProtocol.test.ts
```

预期：PASS。

- [ ] **Step 4: 写 Swift 协议失败测试**

在 `apps/desktop/TestsSwift/AppServices/ElectronShell/ElectronShellProtocolTests.swift` 增加：

```swift
func testEncodesPrepareCommand() throws {
    let command = ElectronShellCommand.prepare(commandId: "cmd-prepare")

    let data = try JSONEncoder().encode(command)
    let object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])

    XCTAssertEqual(object["channel"] as? String, "electron_shell")
    XCTAssertEqual(object["type"] as? String, "thread_window.prepare")
    XCTAssertEqual(object["commandId"] as? String, "cmd-prepare")
}

func testDecodesVisibleThreadWindowClosedEvent() throws {
    let data = """
    {"channel":"electron_shell","type":"thread_window.closed","timestamp":"2026-06-08T00:00:00.000Z","wasVisible":true}
    """.data(using: .utf8)!

    let event = try JSONDecoder().decode(ElectronShellEvent.self, from: data)

    XCTAssertEqual(event, .threadWindowClosed(timestamp: "2026-06-08T00:00:00.000Z", wasVisible: true))
}
```

运行：

```bash
bash ./scripts/swiftw test --filter ElectronShellProtocolTests
```

预期：FAIL，`ElectronShellCommand.prepare` 与 close event 字段尚未存在。

- [ ] **Step 5: 修改 Swift 协议 DTO**

在 `apps/desktop/Sources/AppServices/ElectronShell/ElectronShellProtocol.swift` 中加入 prepare case：

```swift
enum ElectronShellCommand: Encodable, Equatable {
    case prepare(commandId: String)
    case openInitialPrompt(commandId: String, payload: ElectronInitialPromptPayload)
    case openHistory(commandId: String)
    case focus(commandId: String, threadId: String?)
    case showActivityWindow(commandId: String)
    case shutdown(commandId: String)
```

在 `encode(to:)` 的 switch 最前面加入：

```swift
case .prepare(let commandId):
    try container.encode("thread_window.prepare", forKey: .type)
    try container.encode(commandId, forKey: .commandId)
```

把 event case 改成：

```swift
case threadWindowClosed(timestamp: String, wasVisible: Bool)
```

在 decoder 中把 close 分支改为：

```swift
case "thread_window.closed":
    self = .threadWindowClosed(
        timestamp: try container.decode(String.self, forKey: .timestamp),
        wasVisible: try container.decode(Bool.self, forKey: .wasVisible)
    )
```

- [ ] **Step 6: 验证 Swift 协议测试通过**

运行：

```bash
bash ./scripts/swiftw test --filter ElectronShellProtocolTests
```

预期：PASS。

- [ ] **Step 7: 提交协议扩展**

运行：

```bash
git add apps/electron-shell/src/main/protocol/electronShellProtocol.ts \
  apps/electron-shell/tests/protocol/electronShellProtocol.test.ts \
  apps/desktop/Sources/AppServices/ElectronShell/ElectronShellProtocol.swift \
  apps/desktop/TestsSwift/AppServices/ElectronShell/ElectronShellProtocolTests.swift
git commit -m "feat: extend electron shell thread window protocol"
```

### Task 2: 升级 Electron ThreadWindow host 状态机

**Files:**
- Modify: `apps/electron-shell/src/main/windows/threadWindowPrewarmer.ts`
- Modify: `apps/electron-shell/tests/windows/threadWindowPrewarmer.test.ts`

- [ ] **Step 1: 写 host 状态失败测试**

在 `apps/electron-shell/tests/windows/threadWindowPrewarmer.test.ts` 增加：

```typescript
it("prepares on demand before opening an initial prompt", async () => {
  const window = new FakeBrowserWindow();
  const host = new ThreadWindowPrewarmer({
    threadWindowURL: "http://127.0.0.1:4317/thread-window/index.html",
    preloadPath: "/preload.js",
    createWindow: () => window,
  });

  const opened = host.openInitialPrompt({
    clientRequestId: "prompt-1",
    text: "hello",
    attachments: [],
    actionBinding: null,
  });
  window.webContents.emit("did-finish-load");
  await opened;

  expect(window.loadCount).toBe(1);
  expect(window.executedJavaScript[0]).toContain("window.handAgentReceiveInitialPrompt");
  expect(window.showCount).toBe(1);
  expect(window.focusCount).toBe(1);
});

it("opens history without delivering an initial prompt", async () => {
  const window = new FakeBrowserWindow();
  const host = new ThreadWindowPrewarmer({
    threadWindowURL: "http://127.0.0.1:4317/thread-window/index.html",
    preloadPath: "/preload.js",
    createWindow: () => window,
  });

  const opened = host.openHistory();
  window.webContents.emit("did-finish-load");
  await opened;

  expect(window.executedJavaScript).toEqual([]);
  expect(window.showCount).toBe(1);
  expect(window.focusCount).toBe(1);
});

it("focuses only after the window has been shown", async () => {
  const window = new FakeBrowserWindow();
  const host = new ThreadWindowPrewarmer({
    threadWindowURL: "http://127.0.0.1:4317/thread-window/index.html",
    preloadPath: "/preload.js",
    createWindow: () => window,
  });

  expect(host.focus()).toBe(false);
  const opened = host.openHistory();
  window.webContents.emit("did-finish-load");
  await opened;

  expect(host.focus()).toBe(true);
  expect(window.focusCount).toBe(2);
});

it("reports whether a closed thread window had been visible", async () => {
  const window = new FakeBrowserWindow();
  const closes: boolean[] = [];
  const host = new ThreadWindowPrewarmer({
    threadWindowURL: "http://127.0.0.1:4317/thread-window/index.html",
    preloadPath: "/preload.js",
    createWindow: () => window,
    onClosed: (event) => closes.push(event.wasVisible),
  });

  const opened = host.openHistory();
  window.webContents.emit("did-finish-load");
  await opened;
  window.emit("closed");

  expect(closes).toEqual([true]);
});
```

运行：

```bash
pnpm --filter handagent-electron-shell test threadWindowPrewarmer.test.ts
```

预期：FAIL，`openInitialPrompt` 目前要求已 prepared，且没有 `openHistory()`、`focus()` 和 `{ wasVisible }` close event。

- [ ] **Step 2: 修改状态机类型和状态字段**

在 `apps/electron-shell/src/main/windows/threadWindowPrewarmer.ts` 中把 `Options.onClosed` 改为：

```typescript
type ThreadWindowClosedEvent = {
  wasPrepared: boolean;
  wasVisible: boolean;
};

type Options = {
  threadWindowURL: string;
  preloadPath: string;
  createWindow: (options: BrowserWindowConstructorOptions) => BrowserWindowLike;
  onClosed?: (event: ThreadWindowClosedEvent) => void;
};
```

在 class 字段中加入：

```typescript
private visible = false;
```

- [ ] **Step 3: 让 openInitialPrompt 支持 submit-path 兜底 prepare**

把 `openInitialPrompt` 改为：

```typescript
async openInitialPrompt(payload: InitialPromptPayload): Promise<void> {
  await this.prepare();
  if (!this.window || !this.prepared) {
    throw new Error("thread window is not prepared");
  }

  const serialized = JSON.stringify(payload).replace(/</g, "\\u003c");
  await this.window.webContents.executeJavaScript(`window.handAgentReceiveInitialPrompt(${serialized});`);
  this.showAndFocus();
}
```

增加：

```typescript
async openHistory(): Promise<void> {
  await this.prepare();
  this.showAndFocus();
}

focus(): boolean {
  if (!this.window || !this.visible) {
    return false;
  }
  this.window.focus();
  return true;
}

private showAndFocus(): void {
  if (!this.window) {
    throw new Error("thread window is not prepared");
  }
  this.window.show();
  this.window.focus();
  this.visible = true;
}
```

- [ ] **Step 4: 修改 close 处理**

把 `handleClosed()` 改成：

```typescript
private handleClosed(): void {
  const wasPrepared = this.prepared;
  const wasVisible = this.visible;
  this.window = null;
  this.prepared = false;
  this.visible = false;
  const rejectPrepare = this.rejectPrepare;
  this.preparePromise = null;
  this.rejectPrepare = null;
  rejectPrepare?.(new Error("thread window closed before it was prepared"));
  this.options.onClosed?.({ wasPrepared, wasVisible });
}
```

- [ ] **Step 5: 修正旧测试断言**

把旧测试里的 `onClosed: () => { closedCount += 1 }` 改成：

```typescript
onClosed: () => {
  closedCount += 1;
},
```

把仍期望未 prepared 时 `openInitialPrompt` 抛错的旧测试改为验证 close 后可以重新 prepare：

```typescript
const retried = prewarmer.openInitialPrompt({
  clientRequestId: "prompt-2",
  text: "again",
  attachments: [],
  actionBinding: null,
});
window.webContents.emit("did-finish-load");
await retried;
expect(window.showCount).toBe(1);
```

- [ ] **Step 6: 验证 host 状态机测试通过**

运行：

```bash
pnpm --filter handagent-electron-shell test threadWindowPrewarmer.test.ts
```

预期：PASS。

- [ ] **Step 7: 提交 Electron host 状态机**

运行：

```bash
git add apps/electron-shell/src/main/windows/threadWindowPrewarmer.ts \
  apps/electron-shell/tests/windows/threadWindowPrewarmer.test.ts
git commit -m "feat: promote electron thread window prewarmer to host"
```

### Task 3: 让 Electron main 激活 Phase 1 commands

**Files:**
- Create: `apps/electron-shell/src/main/electronShellRuntime.ts`
- Create: `apps/electron-shell/tests/main/electronShellRuntime.test.ts`
- Modify: `apps/electron-shell/src/main/main.ts`

- [ ] **Step 1: 抽出 runtime 测试替身**

创建 `apps/electron-shell/tests/main/electronShellRuntime.test.ts`：

```typescript
import { describe, expect, it, vi } from "vitest";
import { ElectronShellRuntime } from "../../src/main/electronShellRuntime.js";
import type { ElectronToSwiftEvent, SwiftToElectronCommand } from "../../src/main/protocol/electronShellProtocol.js";

describe("ElectronShellRuntime", () => {
  it("acknowledges prepare commands after preparing the thread window", async () => {
    const harness = createHarness();

    await harness.runtime.handleCommand({
      channel: "electron_shell",
      type: "thread_window.prepare",
      commandId: "cmd-prepare",
    });

    expect(harness.prewarmer.prepare).toHaveBeenCalledTimes(1);
    expect(harness.events).toContainEqual({
      channel: "electron_shell",
      type: "command.ack",
      commandId: "cmd-prepare",
      ok: true,
    });
  });

  it("acknowledges open history commands", async () => {
    const harness = createHarness();

    await harness.runtime.handleCommand({
      channel: "electron_shell",
      type: "thread_window.open_history",
      commandId: "cmd-history",
    });

    expect(harness.prewarmer.openHistory).toHaveBeenCalledTimes(1);
    expect(harness.events).toContainEqual({
      channel: "electron_shell",
      type: "command.ack",
      commandId: "cmd-history",
      ok: true,
    });
  });

  it("acks focus false when no visible thread window exists", async () => {
    const harness = createHarness({ focusResult: false });

    await harness.runtime.handleCommand({
      channel: "electron_shell",
      type: "thread_window.focus",
      commandId: "cmd-focus",
      threadId: null,
    });

    expect(harness.events).toContainEqual({
      channel: "electron_shell",
      type: "command.ack",
      commandId: "cmd-focus",
      ok: false,
      error: "thread window is not visible",
    });
  });

  it("reports visible close events and prepares a replacement", async () => {
    const harness = createHarness();
    harness.runtime.handleAgentServerHealth({ available: true });

    harness.runtime.handleThreadWindowClosed({ wasPrepared: true, wasVisible: true });

    expect(harness.events).toContainEqual({
      channel: "electron_shell",
      type: "thread_window.closed",
      timestamp: "2026-06-08T00:00:00.000Z",
      wasVisible: true,
    });
    expect(harness.prewarmer.prepare).toHaveBeenCalledTimes(1);
  });
});

function createHarness(options: { focusResult?: boolean } = {}) {
  const events: ElectronToSwiftEvent[] = [];
  const prewarmer = {
    prepare: vi.fn(async () => {}),
    openInitialPrompt: vi.fn(async () => {}),
    openHistory: vi.fn(async () => {}),
    focus: vi.fn(() => options.focusResult ?? true),
  };
  const runtime = new ElectronShellRuntime({
    prewarmer,
    send: (event) => events.push(event),
    now: () => "2026-06-08T00:00:00.000Z",
    stopSupervisor: vi.fn(),
    quit: vi.fn(),
  });

  return { runtime, prewarmer, events };
}
```

运行：

```bash
pnpm --filter handagent-electron-shell test electronShellRuntime.test.ts
```

预期：FAIL，runtime 文件尚不存在。

- [ ] **Step 2: 创建 runtime command handler**

创建 `apps/electron-shell/src/main/electronShellRuntime.ts`：

```typescript
import type {
  ElectronToSwiftEvent,
  SwiftToElectronCommand,
} from "./protocol/electronShellProtocol.js";

type ThreadWindowClosedEvent = {
  wasPrepared: boolean;
  wasVisible: boolean;
};

type ThreadWindowHost = {
  prepare(): Promise<void>;
  openInitialPrompt(payload: Extract<SwiftToElectronCommand, { type: "thread_window.open_initial_prompt" }>["payload"]): Promise<void>;
  openHistory(): Promise<void>;
  focus(): boolean;
};

type Options = {
  prewarmer: ThreadWindowHost;
  send: (event: ElectronToSwiftEvent) => void;
  now: () => string;
  stopSupervisor: () => void;
  quit: () => void;
};

export class ElectronShellRuntime {
  private hasAgentServerHealth = false;
  private prepareAfterServerReadyPromise: Promise<void> | null = null;

  constructor(private readonly options: Options) {}

  handleAgentServerHealth(event: { available: boolean; message?: string }): void {
    this.hasAgentServerHealth = event.available;
    this.options.send({
      channel: "electron_shell",
      type: "agent_server.health",
      available: event.available,
      ...(event.message ? { message: event.message } : {}),
    });
    if (event.available) {
      void this.prepareThreadWindowAfterServerReady();
    }
  }

  handleThreadWindowClosed(event: ThreadWindowClosedEvent): void {
    this.options.send({
      channel: "electron_shell",
      type: "thread_window.closed",
      timestamp: this.options.now(),
      wasVisible: event.wasVisible,
    });
    if (event.wasPrepared && this.hasAgentServerHealth) {
      void this.prepareThreadWindowAfterServerReady();
    }
  }

  async handleCommand(command: SwiftToElectronCommand): Promise<void> {
    if (command.type === "shutdown") {
      this.ack(command, true);
      this.options.stopSupervisor();
      this.options.quit();
      return;
    }

    if (command.type === "thread_window.prepare") {
      await this.runCommand(command, () => this.options.prewarmer.prepare());
      return;
    }

    if (command.type === "thread_window.open_initial_prompt") {
      await this.runCommand(command, () => this.options.prewarmer.openInitialPrompt(command.payload));
      return;
    }

    if (command.type === "thread_window.open_history") {
      await this.runCommand(command, () => this.options.prewarmer.openHistory());
      return;
    }

    if (command.type === "thread_window.focus") {
      const focused = this.options.prewarmer.focus();
      this.ack(command, focused, focused ? undefined : "thread window is not visible");
      return;
    }

    this.ack(command, false, "command is not active in phase 1");
  }

  private async prepareThreadWindowAfterServerReady(): Promise<void> {
    if (this.prepareAfterServerReadyPromise) {
      return this.prepareAfterServerReadyPromise;
    }

    this.prepareAfterServerReadyPromise = this.options.prewarmer.prepare()
      .then(() => {
        this.options.send({
          channel: "electron_shell",
          type: "thread_window.prepared",
          timestamp: this.options.now(),
        });
      })
      .catch((error: unknown) => {
        this.options.send({
          channel: "electron_shell",
          type: "thread_window.prepare_failed",
          message: errorMessage(error),
        });
      })
      .finally(() => {
        this.prepareAfterServerReadyPromise = null;
      });

    return this.prepareAfterServerReadyPromise;
  }

  private async runCommand(command: SwiftToElectronCommand, operation: () => Promise<void>): Promise<void> {
    try {
      await operation();
      this.ack(command, true);
    } catch (error) {
      this.ack(command, false, errorMessage(error));
    }
  }

  private ack(command: SwiftToElectronCommand, ok: boolean, error?: string): void {
    this.options.send({
      channel: "electron_shell",
      type: "command.ack",
      commandId: command.commandId,
      ok,
      ...(error ? { error } : {}),
    });
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}
```

- [ ] **Step 3: 改造 main.ts 使用 runtime**

在 `apps/electron-shell/src/main/main.ts` 中：

1. 删除局部 `ack`、`errorMessage`、`prepareThreadWindowAfterServerReady`。
2. 引入 runtime：

```typescript
import { ElectronShellRuntime, errorMessage } from "./electronShellRuntime.js";
```

3. 创建 runtime：

```typescript
const runtime = new ElectronShellRuntime({
  prewarmer,
  send,
  now,
  stopSupervisor,
  quit: () => app.quit(),
});
```

4. 把 `onClosed` 改成：

```typescript
onClosed: (event) => {
  if (hasStoppedSupervisor) {
    return;
  }
  runtime.handleThreadWindowClosed(event);
},
```

5. 把 `handleCommandLine` 中 parse 成功后的 command 分发改为：

```typescript
await runtime.handleCommand(command);
```

6. 把 supervisor health 回调改为：

```typescript
supervisor.onHealth((event) => {
  runtime.handleAgentServerHealth(event);
});
```

- [ ] **Step 4: 验证 Electron main 测试通过**

运行：

```bash
pnpm --filter handagent-electron-shell test electronShellRuntime.test.ts
pnpm --filter handagent-electron-shell test
pnpm --filter handagent-electron-shell build
```

预期：全部 PASS。

- [ ] **Step 5: 提交 Electron main command 激活**

运行：

```bash
git add apps/electron-shell/src/main/electronShellRuntime.ts \
  apps/electron-shell/tests/main/electronShellRuntime.test.ts \
  apps/electron-shell/src/main/main.ts
git commit -m "feat: activate electron thread window commands"
```

### Task 4: 增加 Swift Electron ThreadWindow command client

**Files:**
- Create: `apps/desktop/Sources/AppServices/ElectronShell/ThreadWindowCommanding.swift`
- Modify: `apps/desktop/Sources/AppServices/ElectronShell/ElectronBackedAppServer.swift`
- Modify: `apps/desktop/TestsSwift/AppServices/ElectronShell/ElectronBackedAppServerTests.swift`

- [ ] **Step 1: 写 command client 失败测试**

在 `apps/desktop/TestsSwift/AppServices/ElectronShell/ElectronBackedAppServerTests.swift` 增加：

```swift
func testPrepareThreadWindowSendsPrepareCommand() throws {
    let shell = RecordingElectronShellProcess()
    let appServer = ElectronBackedAppServer(shell: shell, platformClient: nil)

    try appServer.prepareThreadWindow()

    guard case .prepare = shell.sentCommands.first else {
        return XCTFail("expected prepare command")
    }
}

func testOpenInitialPromptSendsElectronPayload() throws {
    let shell = RecordingElectronShellProcess()
    let appServer = ElectronBackedAppServer(shell: shell, platformClient: nil)
    let prompt = try XCTUnwrap(PromptSubmission.compose(draft: "hello", attachments: []))

    try appServer.openInitialPrompt(prompt)

    guard case .openInitialPrompt(_, let payload) = shell.sentCommands.first else {
        return XCTFail("expected open initial prompt command")
    }
    XCTAssertEqual(payload.text, "hello")
    XCTAssertEqual(payload.attachments, [])
    XCTAssertNil(payload.actionBinding)
}

func testVisibleThreadWindowClosedInvokesWindowClosedCallback() {
    let shell = RecordingElectronShellProcess()
    let appServer = ElectronBackedAppServer(shell: shell, platformClient: nil)
    var closeCount = 0
    appServer.onThreadWindowClosed = { closeCount += 1 }

    appServer.start()
    shell.emit(.agentServerHealth(available: true, message: nil))
    shell.emit(.threadWindowPrepared(timestamp: "2026-06-08T00:00:01.000Z"))
    shell.emit(.threadWindowClosed(timestamp: "2026-06-08T00:00:02.000Z", wasVisible: true))

    XCTAssertEqual(closeCount, 1)
    XCTAssertFalse(appServer.isAvailable)
    XCTAssertEqual(appServer.startupErrorMessage, "Electron ThreadWindow 已关闭，正在重新预热…")
}

func testHiddenThreadWindowClosedDoesNotInvokeWindowClosedCallback() {
    let shell = RecordingElectronShellProcess()
    let appServer = ElectronBackedAppServer(shell: shell, platformClient: nil)
    var closeCount = 0
    appServer.onThreadWindowClosed = { closeCount += 1 }

    appServer.start()
    shell.emit(.threadWindowClosed(timestamp: "2026-06-08T00:00:02.000Z", wasVisible: false))

    XCTAssertEqual(closeCount, 0)
}
```

运行：

```bash
bash ./scripts/swiftw test --filter ElectronBackedAppServerTests
```

预期：FAIL，`ThreadWindowCommanding` 尚不存在，close event case 也已变化。

- [ ] **Step 2: 创建 command client 协议**

创建 `apps/desktop/Sources/AppServices/ElectronShell/ThreadWindowCommanding.swift`：

```swift
import Foundation

@MainActor
protocol ThreadWindowCommanding: AnyObject {
    var onThreadWindowClosed: (() -> Void)? { get set }

    func prepareThreadWindow() throws
    func openInitialPrompt(_ prompt: PromptSubmission) throws
    func openHistory() throws
    func focus(threadId: String?) throws
}
```

- [ ] **Step 3: 给 ElectronInitialPromptPayload 增加 PromptSubmission initializer**

在 `ElectronShellProtocol.swift` 的 `ElectronInitialPromptPayload` 中加入：

```swift
init(prompt: PromptSubmission, clientRequestId: String = UUID().uuidString) {
    self.clientRequestId = clientRequestId
    self.text = prompt.composed
    self.attachments = prompt.socketAttachments
    self.actionBinding = prompt.actionBinding
}
```

- [ ] **Step 4: 让 ElectronBackedAppServer conform ThreadWindowCommanding**

在 class 声明改为：

```swift
final class ElectronBackedAppServer: AppServerManaging, ThreadWindowCommanding {
```

加入属性：

```swift
var onThreadWindowClosed: (() -> Void)?
```

加入方法：

```swift
func prepareThreadWindow() throws {
    try shell.send(.prepare(commandId: UUID().uuidString))
}

func openInitialPrompt(_ prompt: PromptSubmission) throws {
    try shell.send(.openInitialPrompt(
        commandId: UUID().uuidString,
        payload: ElectronInitialPromptPayload(prompt: prompt)
    ))
}

func openHistory() throws {
    try shell.send(.openHistory(commandId: UUID().uuidString))
}

func focus(threadId: String?) throws {
    try shell.send(.focus(commandId: UUID().uuidString, threadId: threadId))
}
```

把 close event handling 改成：

```swift
case .threadWindowClosed(_, let wasVisible):
    hasPreparedThreadWindow = false
    threadWindowErrorMessage = "Electron ThreadWindow 已关闭，正在重新预热…"
    if wasVisible {
        onThreadWindowClosed?()
    }
    publishAvailability(force: true)
```

在 `stop()` 中清理：

```swift
onThreadWindowClosed = nil
```

- [ ] **Step 5: 修复旧测试 close event 调用**

把 `ElectronBackedAppServerTests` 中旧的：

```swift
shell.emit(.threadWindowClosed(timestamp: "2026-06-08T00:00:02.000Z"))
```

改为：

```swift
shell.emit(.threadWindowClosed(timestamp: "2026-06-08T00:00:02.000Z", wasVisible: false))
```

除非测试明确验证 visible close callback。

- [ ] **Step 6: 验证 Swift command client 测试通过**

运行：

```bash
bash ./scripts/swiftw test --filter ElectronBackedAppServerTests
```

预期：PASS。

- [ ] **Step 7: 提交 Swift command client**

运行：

```bash
git add apps/desktop/Sources/AppServices/ElectronShell/ThreadWindowCommanding.swift \
  apps/desktop/Sources/AppServices/ElectronShell/ElectronShellProtocol.swift \
  apps/desktop/Sources/AppServices/ElectronShell/ElectronBackedAppServer.swift \
  apps/desktop/TestsSwift/AppServices/ElectronShell/ElectronBackedAppServerTests.swift
git commit -m "feat: add swift electron thread window client"
```

### Task 5: 用 ThreadWindowManaging 抽象路由 Coordinator

**Files:**
- Create: `apps/desktop/Sources/Coordinator/ThreadWindowManaging.swift`
- Modify: `apps/desktop/Sources/Coordinator/ThreadWindowLifecycle.swift`
- Create: `apps/desktop/Sources/Coordinator/ElectronThreadWindowLifecycle.swift`
- Modify: `apps/desktop/Sources/AppServices/AppServices.swift`
- Modify: `apps/desktop/TestsSwift/AppServices/AppServicesTests.swift`
- Modify: `apps/desktop/Sources/Coordinator/AppCoordinator.swift`
- Modify: `apps/desktop/TestsSwift/Coordinator/AppCoordinatorTests.swift`
- Create: `apps/desktop/TestsSwift/Coordinator/ElectronThreadWindowLifecycleTests.swift`

- [ ] **Step 1: 创建 ThreadWindowManaging 协议**

创建 `apps/desktop/Sources/Coordinator/ThreadWindowManaging.swift`：

```swift
import Foundation

@MainActor
protocol ThreadWindowManaging: AnyObject {
    var webHost: ThreadWindowWebHost? { get }

    func prepareForPromptPanel()
    func openOrFocusHistory(onClosed: @escaping @MainActor () -> Void)
    func createTabWithInitialPrompt(_ prompt: PromptSubmission, onClosed: @escaping @MainActor () -> Void)
    func focus(threadID: String?) -> Bool
    func close()
}
```

- [ ] **Step 2: 让 WKWebView lifecycle conform 协议**

在 `ThreadWindowLifecycle.swift` 改 class 声明：

```swift
final class ThreadWindowLifecycle: ThreadWindowManaging {
```

增加 no-op prepare：

```swift
func prepareForPromptPanel() {}
```

把 `focus()` 改成：

```swift
func focus(threadID: String? = nil) -> Bool {
    guard let window else { return false }
    window.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
    return true
}
```

保留调用点兼容：

```swift
@discardableResult
func focus() -> Bool {
    focus(threadID: nil)
}
```

- [ ] **Step 3: 写 Electron lifecycle 失败测试**

创建 `apps/desktop/TestsSwift/Coordinator/ElectronThreadWindowLifecycleTests.swift`：

```swift
import XCTest
@testable import HandAgentDesktop

@MainActor
final class ElectronThreadWindowLifecycleTests: XCTestCase {
    func testPrepareSendsPrepareCommand() {
        let client = RecordingThreadWindowCommandClient()
        let lifecycle = ElectronThreadWindowLifecycle(client: client)

        lifecycle.prepareForPromptPanel()

        XCTAssertEqual(client.prepareCount, 1)
    }

    func testInitialPromptSendsOpenInitialPromptAndMarksOpen() throws {
        let client = RecordingThreadWindowCommandClient()
        let lifecycle = ElectronThreadWindowLifecycle(client: client)
        let prompt = try XCTUnwrap(PromptSubmission.compose(draft: "hello", attachments: []))

        lifecycle.createTabWithInitialPrompt(prompt, onClosed: {})

        XCTAssertEqual(client.openedPrompts.map(\.composed), ["hello"])
        XCTAssertTrue(lifecycle.focus(threadID: nil))
    }

    func testOpenHistorySendsOpenHistory() {
        let client = RecordingThreadWindowCommandClient()
        let lifecycle = ElectronThreadWindowLifecycle(client: client)

        lifecycle.openOrFocusHistory(onClosed: {})

        XCTAssertEqual(client.openHistoryCount, 1)
        XCTAssertTrue(lifecycle.focus(threadID: nil))
    }

    func testVisibleCloseCallbackClearsOpenStateAndCallsOnClosed() {
        let client = RecordingThreadWindowCommandClient()
        let lifecycle = ElectronThreadWindowLifecycle(client: client)
        var closeCount = 0

        lifecycle.openOrFocusHistory { closeCount += 1 }
        client.onThreadWindowClosed?()

        XCTAssertEqual(closeCount, 1)
        XCTAssertFalse(lifecycle.focus(threadID: nil))
    }
}

@MainActor
private final class RecordingThreadWindowCommandClient: ThreadWindowCommanding {
    var onThreadWindowClosed: (() -> Void)?
    private(set) var prepareCount = 0
    private(set) var openedPrompts: [PromptSubmission] = []
    private(set) var openHistoryCount = 0
    private(set) var focusedThreadIDs: [String?] = []

    func prepareThreadWindow() throws {
        prepareCount += 1
    }

    func openInitialPrompt(_ prompt: PromptSubmission) throws {
        openedPrompts.append(prompt)
    }

    func openHistory() throws {
        openHistoryCount += 1
    }

    func focus(threadId: String?) throws {
        focusedThreadIDs.append(threadId)
    }
}
```

运行：

```bash
bash ./scripts/swiftw test --filter ElectronThreadWindowLifecycleTests
```

预期：FAIL，`ElectronThreadWindowLifecycle` 尚不存在。

- [ ] **Step 4: 实现 ElectronThreadWindowLifecycle**

创建 `apps/desktop/Sources/Coordinator/ElectronThreadWindowLifecycle.swift`：

```swift
import Foundation

@Observable
@MainActor
final class ElectronThreadWindowLifecycle: ThreadWindowManaging {
    var webHost: ThreadWindowWebHost? { nil }

    @ObservationIgnored private let client: any ThreadWindowCommanding
    @ObservationIgnored private var isOpen = false
    @ObservationIgnored private var onClosed: (@MainActor () -> Void)?

    init(client: any ThreadWindowCommanding) {
        self.client = client
        self.client.onThreadWindowClosed = { [weak self] in
            Task { @MainActor in
                self?.handleClosed()
            }
        }
    }

    func prepareForPromptPanel() {
        try? client.prepareThreadWindow()
    }

    func openOrFocusHistory(onClosed: @escaping @MainActor () -> Void) {
        self.onClosed = onClosed
        do {
            try client.openHistory()
            isOpen = true
        } catch {
            isOpen = false
        }
    }

    func createTabWithInitialPrompt(
        _ prompt: PromptSubmission,
        onClosed: @escaping @MainActor () -> Void
    ) {
        self.onClosed = onClosed
        do {
            try client.openInitialPrompt(prompt)
            isOpen = true
        } catch {
            isOpen = false
        }
    }

    func focus(threadID: String?) -> Bool {
        guard isOpen else { return false }
        do {
            try client.focus(threadId: threadID)
            return true
        } catch {
            return false
        }
    }

    func close() {
        isOpen = false
        onClosed = nil
    }

    private func handleClosed() {
        guard isOpen else { return }
        isOpen = false
        let callback = onClosed
        onClosed = nil
        callback?()
    }
}
```

- [ ] **Step 5: 让 AppServices 同时构建 app server 和可选 Electron thread client**

在 `AppServices.swift` 中增加属性：

```swift
let threadWindowCommandClient: (any ThreadWindowCommanding)?
```

给 initializer 增加参数：

```swift
threadWindowCommandClient: (any ThreadWindowCommanding)? = nil,
```

在 initializer 内使用同一 Electron runtime：

```swift
let defaultRuntime = appServer == nil
    ? AppServices.defaultRuntime(platformServerURL: platformServerURL)
    : nil
self.appServer = appServer ?? defaultRuntime!.appServer
self.threadWindowCommandClient = threadWindowCommandClient ?? defaultRuntime?.threadWindowCommandClient
```

新增 private struct 和 builder：

```swift
@MainActor
struct AppServicesRuntime {
    let appServer: any AppServerManaging
    let threadWindowCommandClient: (any ThreadWindowCommanding)?
}

static func defaultRuntime(
    environment: [String: String] = ProcessInfo.processInfo.environment,
    platformServerURL: URL
) -> AppServicesRuntime {
    let platformClient = PlatformBridgeConnectionClient(
        connection: AppServerConnection(serverURL: platformServerURL),
        platformBridge: PlatformBridgeService()
    )

    if environment["HANDAGENT_ELECTRON_SHELL"] == "1" {
        let configuration = defaultElectronShellLaunchConfiguration(environment: environment)
        let electronRuntime = ElectronBackedAppServer(
            shell: ElectronShellProcess(
                launchPath: configuration.launchPath,
                arguments: configuration.arguments,
                environment: configuration.environment,
                currentDirectoryURL: configuration.currentDirectoryURL
            ),
            platformClient: platformClient
        )
        return AppServicesRuntime(
            appServer: electronRuntime,
            threadWindowCommandClient: electronRuntime
        )
    }

    return AppServicesRuntime(
        appServer: AppServer(agentServer: AgentServerService(), platformClient: platformClient),
        threadWindowCommandClient: nil
    )
}
```

把 `defaultAppServer(...)` 改成：

```swift
static func defaultAppServer(
    environment: [String: String] = ProcessInfo.processInfo.environment,
    platformServerURL: URL
) -> any AppServerManaging {
    defaultRuntime(environment: environment, platformServerURL: platformServerURL).appServer
}
```

在 `AppServices.testing()` 中显式传：

```swift
threadWindowCommandClient: nil,
```

- [ ] **Step 6: 给 AppServices 写 runtime 边界测试**

在 `apps/desktop/TestsSwift/AppServices/AppServicesTests.swift` 增加：

```swift
func testElectronRuntimeProvidesThreadWindowCommandClient() throws {
    let runtime = AppServices.defaultRuntime(
        environment: [
            "HANDAGENT_ELECTRON_SHELL": "1",
            "HANDAGENT_ELECTRON_MAIN": "apps/electron-shell/dist/main/main.js",
        ],
        platformServerURL: URL(string: "ws://127.0.0.1:4317/api/platform")!
    )

    XCTAssertTrue(runtime.appServer is ElectronBackedAppServer)
    XCTAssertTrue(runtime.threadWindowCommandClient is ElectronBackedAppServer)
}

func testDefaultRuntimeDoesNotProvideThreadWindowCommandClientWithoutElectronFlag() throws {
    let runtime = AppServices.defaultRuntime(
        environment: [:],
        platformServerURL: URL(string: "ws://127.0.0.1:4317/api/platform")!
    )

    XCTAssertTrue(runtime.appServer is AppServer)
    XCTAssertNil(runtime.threadWindowCommandClient)
}
```

运行：

```bash
bash ./scripts/swiftw test --filter AppServicesTests
```

预期：PASS。

- [ ] **Step 7: 修改 AppCoordinator 选择 lifecycle**

把 `AppCoordinator.threadWindowLifecycle` 属性改为：

```swift
@ObservationIgnored private let threadWindowLifecycle: any ThreadWindowManaging
```

在 init 中选择：

```swift
if let electronThreadWindowClient = services.threadWindowCommandClient {
    self.threadWindowLifecycle = ElectronThreadWindowLifecycle(client: electronThreadWindowClient)
} else {
    self.threadWindowLifecycle = ThreadWindowLifecycle(
        threadWebSocketURL: services.appServerURL,
        webAppURL: services.threadWindowWebAppURL,
        windowPresenter: services.threadWindowPresenter,
        activationPolicy: activationPolicy,
        setActivationPolicy: services.setActivationPolicy
    )
}
```

把 PromptPanel 打开入口改为先 prepare：

```swift
case .showPromptPanel:
    refreshActionDefinitions()
    threadWindowLifecycle.prepareForPromptPanel()
    promptPanelController.show()
case .togglePromptPanel:
    refreshActionDefinitions()
    threadWindowLifecycle.prepareForPromptPanel()
    promptPanelController.toggle()
```

把 StatusBubble focus 改为：

```swift
private func handleStatusBubbleTap(_ threadID: String?) {
    if threadID != nil, threadWindowLifecycle.focus(threadID: threadID) { return }
    promptPanelController.show()
}
```

- [ ] **Step 8: 写 Coordinator Electron 路径测试**

在 `apps/desktop/TestsSwift/Coordinator/AppCoordinatorTests.swift` 增加：

```swift
@MainActor
func testElectronSubmitPromptSendsCommandWithoutCreatingWebHost() {
    let client = RecordingThreadWindowCommandClient()
    let services = AppServices(
        appServer: NopAppServer(),
        threadWindowCommandClient: client,
        appServerURL: URL(string: "ws://127.0.0.1:0/noop")!,
        hotkeyRegistrar: NopHotkeyRegistrar(),
        threadWindowPresenter: NopThreadWindowPresenter(),
        settingsWindowPresenter: NopSettingsWindowPresenter(),
        fatalAlertPresenter: NopFatalAlertPresenter(),
        setActivationPolicy: { _ in },
        showsStatusBubble: false
    )
    let coordinator = AppCoordinator(services: services)

    coordinator.send(.submitPrompt("hello", attachments: []))

    XCTAssertNil(coordinator.threadWindowWebHost)
    XCTAssertEqual(client.openedPrompts.map(\.composed), ["hello"])
}

@MainActor
func testElectronOpenHistorySendsOpenHistoryWithoutCreatingWebHost() {
    let client = RecordingThreadWindowCommandClient()
    let services = AppServices(
        appServer: NopAppServer(),
        threadWindowCommandClient: client,
        appServerURL: URL(string: "ws://127.0.0.1:0/noop")!,
        hotkeyRegistrar: NopHotkeyRegistrar(),
        threadWindowPresenter: NopThreadWindowPresenter(),
        settingsWindowPresenter: NopSettingsWindowPresenter(),
        fatalAlertPresenter: NopFatalAlertPresenter(),
        setActivationPolicy: { _ in },
        showsStatusBubble: false
    )
    let coordinator = AppCoordinator(services: services)

    coordinator.send(.openHistory)

    XCTAssertNil(coordinator.threadWindowWebHost)
    XCTAssertEqual(client.openHistoryCount, 1)
}
```

在测试文件底部增加同 Task 5 Step 3 的 `RecordingThreadWindowCommandClient`，如果该类型已经在另一个测试文件中是 `private`，这里重新定义一份。

运行：

```bash
bash ./scripts/swiftw test --filter AppCoordinatorTests
```

预期：PASS。

- [ ] **Step 9: 验证 Coordinator 和 lifecycle 测试组**

运行：

```bash
bash ./scripts/swiftw test --filter ThreadWindowLifecycleTests
bash ./scripts/swiftw test --filter ElectronThreadWindowLifecycleTests
bash ./scripts/swiftw test --filter AppCoordinatorTests
```

预期：全部 PASS。

- [ ] **Step 10: 提交 Swift routing**

运行：

```bash
git add apps/desktop/Sources/Coordinator/ThreadWindowManaging.swift \
  apps/desktop/Sources/Coordinator/ThreadWindowLifecycle.swift \
  apps/desktop/Sources/Coordinator/ElectronThreadWindowLifecycle.swift \
  apps/desktop/Sources/AppServices/AppServices.swift \
  apps/desktop/Sources/Coordinator/AppCoordinator.swift \
  apps/desktop/TestsSwift/AppServices/AppServicesTests.swift \
  apps/desktop/TestsSwift/Coordinator/AppCoordinatorTests.swift \
  apps/desktop/TestsSwift/Coordinator/ThreadWindowLifecycleTests.swift \
  apps/desktop/TestsSwift/Coordinator/ElectronThreadWindowLifecycleTests.swift
git commit -m "feat: route thread window lifecycle through electron flag"
```

### Task 6: 更新文档和手工 QA

**Files:**
- Modify: `handAgent.md`
- Modify: `apps/apps.md`
- Modify: `apps/desktop/desktop.md`
- Modify: `apps/desktop/Sources/Coordinator/coordinator.md`
- Modify: `apps/desktop/Sources/ThreadWindow/thread-window.md`
- Modify: `apps/desktop/Sources/AppServices/ElectronShell/electron-shell.md`
- Modify: `apps/electron-shell/electron-shell.md`
- Modify: `apps/thread-window-web/thread-window-web.md`
- Modify: `docs/manual-qa.md`

- [ ] **Step 1: 更新根架构文档**

在 `handAgent.md` 的 Electron 说明中把 Phase 0 描述改成 Phase 1 边界：

```markdown
Phase 1 Electron UI shell 只在 `HANDAGENT_ELECTRON_SHELL=1` 时启用。该路径由 Swift 启动 Electron，Electron 监督 agent-server、预热隐藏 ThreadWindow，并在 PromptPanel submit/openHistory 时展示 Electron `BrowserWindow` ThreadWindow；默认路径仍保持 Swift `AppServer` 启动 agent-server、Swift `WKWebView` 承载 ThreadWindow。平台能力仍只通过 Swift `/api/platform` 执行。
```

在主调用链路旁补充：

```markdown
Electron flag 路径下，步骤 `Swift 创建 ThreadWindow WKWebView` 改为 `Swift 发送 thread_window.open_initial_prompt 给 Electron main`，React 后续 `/api/thread` 行为不变。
```

- [ ] **Step 2: 更新 apps 层文档**

在 `apps/apps.md` 的 Thread 交互小节替换 Phase 0 句子：

```markdown
当 `HANDAGENT_ELECTRON_SHELL=1` 时，Swift 不创建 `WKWebView` ThreadWindow；PromptPanel show 会请求 Electron 预热隐藏 `BrowserWindow`，PromptPanel submit 和 openHistory 会通过 Electron command bridge 展示同一个 React ThreadWindow。默认路径仍由 Swift `WKWebView` 承载。
```

- [ ] **Step 3: 更新 desktop 和 Coordinator 文档**

在 `apps/desktop/desktop.md` 的启动流程段落替换为：

```markdown
当 `HANDAGENT_ELECTRON_SHELL=1` 时，`AppServices.defaultRuntime` 会创建同一个 `ElectronBackedAppServer` 实例作为 app-server health source 和 Electron ThreadWindow command client。Swift 不直接启动 agent-server，也不创建 WKWebView ThreadWindow；PromptPanel submit/openHistory/focus 通过 `ThreadWindowManaging` 路由到 Electron。
```

在 `apps/desktop/Sources/Coordinator/coordinator.md` 的文件表加入：

```markdown
| `ThreadWindowManaging.swift` | Coordinator 使用的 ThreadWindow 抽象，默认实现是 WKWebView lifecycle，Electron flag 路径实现是 Electron command lifecycle |
| `ElectronThreadWindowLifecycle.swift` | 通过 `ThreadWindowCommanding` 向 Electron main 发送 prepare/open/focus command，不持有 Swift window 或 thread UI 状态 |
```

并把 PromptPanel 提交语义改为：

```markdown
PromptPanel 提交语义：默认路径复用全局 Swift WKWebView ThreadWindow；Electron flag 路径发送 `thread_window.open_initial_prompt` 给 Electron main。两条路径都只传 initial prompt payload，React 收到后通过 `/api/thread` 发送 `thread.start`，再在 `thread.started` 后发送首轮 `input.submit` 和 attachments。
```

- [ ] **Step 4: 更新 ThreadWindow 和 ElectronShell 文档**

在 `apps/desktop/Sources/ThreadWindow/thread-window.md` 的开头改成：

```markdown
`ThreadWindow` 目录只保留 Swift 侧的 WKWebView host。它服务默认路径；当 `HANDAGENT_ELECTRON_SHELL=1` 时，真实 ThreadWindow host 由 `apps/electron-shell` 的 Electron `BrowserWindow` 承载。
```

在 `apps/desktop/Sources/AppServices/ElectronShell/electron-shell.md` 的职责中加入：

```markdown
- 作为 `ThreadWindowCommanding` 实现，接收 Coordinator 的 prepare/openInitialPrompt/openHistory/focus 意图，并编码为 Electron shell command。
- visible Electron ThreadWindow 关闭时，通过 `onThreadWindowClosed` 通知 Coordinator 清理打开状态；隐藏预热窗口关闭只影响可提交 gate。
```

在 `apps/electron-shell/electron-shell.md` 的 Phase 0 边界替换为 Phase 1：

```markdown
## Phase 1 职责

- 通过 stdio newline-delimited JSON 接收 Swift command，回写 Electron event。
- 作为 feature flag 路径下唯一的 agent-server supervisor。
- 在 agent-server 可用后创建隐藏 ThreadWindow `BrowserWindow` 并加载现有 React bundle。
- 处理 `thread_window.prepare`、`thread_window.open_initial_prompt`、`thread_window.open_history` 和 `thread_window.focus`。
- visible ThreadWindow 关闭后回报 `thread_window.closed wasVisible=true`，并在 agent-server 仍可用时重新预热隐藏窗口。
```

- [ ] **Step 5: 更新 thread-window-web 文档**

在 `apps/thread-window-web/thread-window-web.md` 的运行边界中把 Phase 0 句子改成：

```markdown
默认路径下 Swift 负责加载 Web bundle、注入配置和初始 prompt；Electron flag 路径下 Electron preload 注入同名 `window.handAgentThreadWindowConfig` 和 `window.handAgentReceiveInitialPrompt`。React 不区分 host 来源，仍直接连接 `/api/thread`。
```

- [ ] **Step 6: 增加 manual QA 项**

在 `docs/manual-qa.md` 的 Electron UI Shell Phase 0 后新增：

```markdown
## Electron UI Shell Phase 1（P2）

1. 默认不设置 `HANDAGENT_ELECTRON_SHELL`，运行 `bash ./scripts/swiftw run HandAgentDesktop`，提交 prompt 后确认仍打开 Swift `WKWebView` ThreadWindow。
1. 运行 `pnpm --filter handagent-electron-shell build`。
1. 设置 `HANDAGENT_ELECTRON_SHELL=1` 后运行桌面 App，确认 Electron shell 和 agent-server 各一份进程。
1. 通过全局快捷键打开 PromptPanel，确认不会显示 ThreadWindow，但 Electron 已可完成 hidden ThreadWindow prepare；PromptPanel 在 health + prepared 前不可提交。
1. 提交 `ELECTRON_PHASE1_INITIAL_PROMPT_QA_20260608`，确认打开的是 Electron ThreadWindow，而不是 Swift WKWebView ThreadWindow。
1. 确认 Electron ThreadWindow 创建新 tab/thread，并显示该 user message；`~/.spotAgent/threads/` 中对应 thread 文件包含该首条 user message。
1. 再次打开 PromptPanel 连续提交第二条不同 prompt，确认复用同一个 Electron ThreadWindow，但创建新的 tab/thread。
1. 触发 `openHistory`，确认聚焦 Electron ThreadWindow 并显示历史侧栏，不创建 Swift WKWebView host。
1. 关闭 visible Electron ThreadWindow 后，确认 Swift 侧不残留打开窗口状态；再次打开 PromptPanel 时先看到预热 gate，预热完成后可再次提交。
1. 触发 platform tool，例如 `clipboard.read` 或 `app.frontmost`，确认 agent-server 仍通过 `/api/platform` 请求 Swift 回写结果。
1. 退出 HandAgent 后确认 Electron 和 Node agent-server 进程不残留。
```

- [ ] **Step 7: 提交文档更新**

运行：

```bash
git add handAgent.md apps/apps.md apps/desktop/desktop.md \
  apps/desktop/Sources/Coordinator/coordinator.md \
  apps/desktop/Sources/ThreadWindow/thread-window.md \
  apps/desktop/Sources/AppServices/ElectronShell/electron-shell.md \
  apps/electron-shell/electron-shell.md \
  apps/thread-window-web/thread-window-web.md \
  docs/manual-qa.md
git commit -m "docs: update electron thread window phase one"
```

### Task 7: Final verification and branch handoff

**Files:**
- Read: all modified files from Tasks 1-6

- [ ] **Step 1: Run TypeScript verification**

运行：

```bash
bash ./scripts/test.sh
pnpm --filter handagent-electron-shell build
pnpm --filter handagent-thread-window-web build
```

预期：全部 PASS。

- [ ] **Step 2: Run Swift verification**

运行：

```bash
bash ./scripts/swiftw test
bash ./scripts/swiftw build
```

预期：全部 PASS。

- [ ] **Step 3: Run diff hygiene**

运行：

```bash
git diff --check
git status --short
```

预期：`git diff --check` 无输出；`git status --short` 只包含实施者确认过的未提交修改。若前面每个 task 都已提交，最终 status 应为空。

- [ ] **Step 4: Manual QA note**

不要把 Phase 1 manual QA 写成已通过，除非实际运行桌面 App 完成 `docs/manual-qa.md` 中的 Electron UI Shell Phase 1 条目。若只跑了自动化验证，最终说明写：

```text
未执行实机 manual QA；已在 docs/manual-qa.md 增加 Electron UI Shell Phase 1 验收项。
```

- [ ] **Step 5: Final commit if needed**

如果 Task 7 过程中只产生文档修正或测试修正，提交：

```bash
git add <changed-files>
git commit -m "chore: finalize electron thread window phase one"
```

若没有新增修改，不创建空提交。

## Self-Review Checklist

- Spec coverage：本计划覆盖 migration spec 的 Phase 1：prepare、open_initial_prompt、open_history、focus、visible close、默认路径 fallback、React `/api/thread` 不变、Swift `/api/platform` 不变。
- Out of scope：`/api/activity`、StatusBubble、桌宠、`utilityProcess` hardening、打包签名分别留在后续 phase，不进入本计划。
- Placeholder scan：本文没有遗留占位式步骤；每个代码修改步骤都给出目标文件和具体片段。
- Type consistency：TypeScript command `thread_window.prepare` 对应 Swift `ElectronShellCommand.prepare`；TypeScript close event `wasVisible` 对应 Swift `.threadWindowClosed(timestamp:wasVisible:)`；Swift `ThreadWindowCommanding.focus(threadId:)` 由 Coordinator `focus(threadID:)` 转发。

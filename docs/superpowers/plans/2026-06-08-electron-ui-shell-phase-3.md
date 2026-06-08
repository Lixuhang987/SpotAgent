# Electron UI Shell Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 加固 Electron flag 路径下的 app-server 后台监督模型，移除旧的 `thread_window.prepare` command，把 hidden ThreadWindow 预热收敛到 App 启动阶段，并记录 `utilityProcess` 与 Node child process 的明确选型。

**Architecture:** Phase 3 不新增 UI。Electron main 仍是 feature flag 路径下唯一的 agent-server supervisor；agent-server 是唯一承载 `packages/core` thread/runtime/tool 循环的后台进程，ThreadWindow 和 StatusBubble 只是 renderer。Swift 只观察 Electron 回传的 `agent_server.health` 与 `thread_window.prepared`，不再在 PromptPanel show/toggle 时请求 prepare。

**Tech Stack:** TypeScript, Vitest, Electron 42 `utilityProcess`, Node child process, React renderer preload boundary, Swift 6, AppKit, XCTest, newline-delimited JSON over stdio.

---

## Scope Check

本计划只实现迁移 spec 的 Phase 3：

- 删除 Swift <-> Electron 协议中的 `thread_window.prepare` command。
- 删除 Swift `prepareThreadWindow()` / `prepareForPromptPanel()` 路径，PromptPanel show/toggle 不再触发 Electron prepare。
- 保持 Electron main 在 `agent_server.health available=true` 后主动预热 hidden ThreadWindow，并发送 `thread_window.prepared`。
- 增加 supervisor 选型描述：优先 `utilityProcess`；当前没有可 fork 的 agent-server JS 构建入口时，保留 Node child process 并记录具体阻塞原因。
- 明确 core runtime 只在受监督 agent-server 中运行；关闭 ThreadWindow 或 StatusBubble 不停止 agent-server。
- 加固 stdout/stderr、重启上限、shutdown、dev worktree、mock LLM 和 packaged `.app` 路径的验证。

本计划不替换 `/api/thread` 或 `/api/activity` WebSocket transport，不迁移 `/api/platform`，不做签名/公证，不迁移 PromptPanel 或 Settings。

## Current Mismatch To Fix

当前 `codex/electron-ui-shell-phase-0` 已完成 Phase 0-2，但仍保留旧 spec 语义：

- `apps/electron-shell/src/main/protocol/electronShellProtocol.ts` 仍接受 `thread_window.prepare`。
- `apps/desktop/Sources/AppServices/ElectronShell/ElectronShellProtocol.swift` 仍编码 `.prepare`。
- `apps/desktop/Sources/AppServices/ElectronShell/ThreadWindowCommanding.swift` 仍有 `prepareThreadWindow()`.
- `apps/desktop/Sources/Coordinator/AppCoordinator.swift` 在 `.showPromptPanel` / `.togglePromptPanel` 中调用 `threadWindowLifecycle.prepareForPromptPanel()`.
- `apps/electron-shell/src/main/electronShellRuntime.ts` 同时支持手动 prepare command 和 server-ready 后主动 prepare。
- `apps/electron-shell/src/main/serverSupervisor/nodeAgentServerSupervisor.ts` 只有 Node child process 实现，stdout/stderr 只转写到 Electron stderr，没有明确 supervisor 描述或 utilityProcess blocker。

Phase 3 的第一目标是把这些旧语义收敛到新 spec。

## File Map

| 操作 | 路径 | 职责 |
|------|------|------|
| Modify | `apps/electron-shell/src/main/protocol/electronShellProtocol.ts` | 删除 `thread_window.prepare` command 类型和 guard 分支 |
| Modify | `apps/electron-shell/tests/protocol/electronShellProtocol.test.ts` | 改为断言 prepare command 被拒绝 |
| Modify | `apps/electron-shell/src/main/electronShellRuntime.ts` | 删除手动 prepare command handler，只保留 server-ready 后主动预热 |
| Modify | `apps/electron-shell/tests/main/electronShellRuntime.test.ts` | 删除 prepare ack 测试，覆盖 health 触发预热与 close 后重预热 |
| Create | `apps/electron-shell/src/main/serverSupervisor/agentServerSupervisor.ts` | 定义 supervisor 接口、health event、description 与 log sink 类型 |
| Create | `apps/electron-shell/src/main/serverSupervisor/agentServerEntry.ts` | 解析 TS source entry、可选 JS utility entry 与 blocker |
| Create | `apps/electron-shell/src/main/serverSupervisor/agentServerSupervisorFactory.ts` | 根据入口可用性选择 utilityProcess 或 Node child supervisor |
| Create | `apps/electron-shell/src/main/serverSupervisor/utilityProcessAgentServerSupervisor.ts` | 可测试的 utilityProcess supervisor 候选实现 |
| Modify | `apps/electron-shell/src/main/serverSupervisor/nodeAgentServerSupervisor.ts` | 实现统一接口、description、日志 sink、重启上限诊断 |
| Create | `apps/electron-shell/tests/serverSupervisor/agentServerEntry.test.ts` | 覆盖 utility entry 解析与 blocker |
| Create | `apps/electron-shell/tests/serverSupervisor/agentServerSupervisorFactory.test.ts` | 覆盖 utility 优先与 Node fallback |
| Create | `apps/electron-shell/tests/serverSupervisor/utilityProcessAgentServerSupervisor.test.ts` | 覆盖 utility fork 参数、health、shutdown、fatal error |
| Modify | `apps/electron-shell/tests/serverSupervisor/nodeAgentServerSupervisor.test.ts` | 覆盖 description、log sink、最大重启后诊断 |
| Modify | `apps/electron-shell/src/main/main.ts` | 使用 supervisor factory，注入 Electron `utilityProcess` 和日志 sink |
| Modify | `apps/desktop/Sources/AppServices/ElectronShell/ElectronShellProtocol.swift` | 删除 `.prepare` command |
| Modify | `apps/desktop/TestsSwift/AppServices/ElectronShell/ElectronShellProtocolTests.swift` | 删除 prepare 编码测试，保留 prepared event 解码 |
| Modify | `apps/desktop/Sources/AppServices/ElectronShell/ThreadWindowCommanding.swift` | 删除 `.prepare` kind 与 `prepareThreadWindow()` |
| Modify | `apps/desktop/Sources/AppServices/ElectronShell/ElectronBackedAppServer.swift` | 删除 prepare command 发送与 pending kind |
| Modify | `apps/desktop/TestsSwift/AppServices/ElectronShell/ElectronBackedAppServerTests.swift` | 删除 prepare command 测试，覆盖关闭 UI 不停止 server |
| Modify | `apps/desktop/Sources/Coordinator/ThreadWindowManaging.swift` | 删除 `prepareForPromptPanel()` |
| Modify | `apps/desktop/Sources/Coordinator/ElectronThreadWindowLifecycle.swift` | 删除 prepareForPromptPanel 实现与 `.prepare` result 分支 |
| Modify | `apps/desktop/Sources/Coordinator/ThreadWindowLifecycle.swift` | 删除默认路径 no-op prepare |
| Modify | `apps/desktop/Sources/Coordinator/AppCoordinator.swift` | PromptPanel show/toggle 不再触发 prewarm |
| Modify | `apps/desktop/TestsSwift/Coordinator/AppCoordinatorTests.swift` | 覆盖 PromptPanel show/toggle 不发送 Electron prepare |
| Modify | `apps/desktop/TestsSwift/Coordinator/ElectronThreadWindowLifecycleTests.swift` | 删除 prepare 测试，覆盖 open/focus 仍正常 |
| Modify | `apps/desktop/TestsSwift/Coordinator/ThreadWindowLifecycleTests.swift` | 删除 no-op prepare 相关断言 |
| Modify | `apps/desktop/Sources/AppServices/AppServices.swift` | packaged `.app` 下优先使用 bundled Electron shell main 路径 |
| Modify | `apps/desktop/TestsSwift/AppServices/AppServicesTests.swift` | 覆盖 dev worktree、bundle resource、mock LLM env |
| Modify | `scripts/package-app.sh` | 打包时构建并复制 Electron shell dist 到 app resources |
| Modify | `scripts/package-app.test.sh` | 覆盖 Electron shell dist copy 与 mock marker |
| Modify | `apps/electron-shell/electron-shell.md` | 记录 Phase 3 supervisor、utilityProcess blocker 与启动预热语义 |
| Modify | `apps/desktop/Sources/AppServices/ElectronShell/electron-shell.md` | 更新 Swift bridge 边界：不再支持 prepare command |
| Modify | `apps/desktop/Sources/Coordinator/coordinator.md` | 更新 PromptPanel show/toggle 不触发 ThreadWindow prepare |
| Modify | `apps/desktop/desktop.md` | 更新 Electron flag 启动与 packaged 路径 |
| Modify | `handAgent.md` | 更新当前架构不变量 |
| Modify | `docs/manual-qa.md` | 新增 Phase 3 手工验收项 |

## External Facts To Preserve

- 本地 Electron 42 类型显示 `utilityProcess.fork(modulePath, args?, options?)` 只能在 Electron `app` ready 后调用。
- `ForkOptions` 支持 `env`、`execArgv`、`cwd`、`stdio` 和 `serviceName`。
- 当前 `apps/agent-server` 没有 `dist/server/server.js` 或其他 JS 构建入口；现有启动依赖 `node --experimental-transform-types --experimental-specifier-resolution=node apps/agent-server/src/server/server.ts`。
- 因此 Phase 3 的默认生产路径可以继续使用 Node child process，但必须在 runtime description 和文档中明确记录 blocker：缺少可交给 `utilityProcess.fork` 的构建后 JS entry。

## Tasks

### Task 1: 删除 Electron TypeScript prepare command

**Files:**
- Modify: `apps/electron-shell/src/main/protocol/electronShellProtocol.ts`
- Modify: `apps/electron-shell/tests/protocol/electronShellProtocol.test.ts`
- Modify: `apps/electron-shell/src/main/electronShellRuntime.ts`
- Modify: `apps/electron-shell/tests/main/electronShellRuntime.test.ts`

- [ ] **Step 1: 写协议失败测试**

在 `apps/electron-shell/tests/protocol/electronShellProtocol.test.ts` 中删除旧的 `parses prepare commands` 测试，新增：

```typescript
it("rejects prepare commands because prewarming is startup-owned", () => {
  expect(() => parseCommand(JSON.stringify({
    channel: "electron_shell",
    type: "thread_window.prepare",
    commandId: "cmd-prepare",
  }))).toThrow("unsupported electron shell command");
});
```

运行：

```bash
pnpm --filter handagent-electron-shell test electronShellProtocol.test.ts
```

预期：FAIL，因为 `parseCommand` 仍接受 `thread_window.prepare`。

- [ ] **Step 2: 修改 TypeScript 协议**

在 `apps/electron-shell/src/main/protocol/electronShellProtocol.ts` 中从 `SwiftToElectronCommand` 删除：

```typescript
  | {
      channel: "electron_shell";
      type: "thread_window.prepare";
      commandId: string;
    }
```

在 `isSwiftToElectronCommand` 中从无 payload command 分支删除：

```typescript
case "thread_window.prepare":
```

- [ ] **Step 3: 更新 Electron runtime 测试**

在 `apps/electron-shell/tests/main/electronShellRuntime.test.ts` 中删除：

```text
删除完整测试块：acknowledges prepare commands after preparing the thread window
删除完整测试块：acks prepare false when preparation fails
```

保留并强化 server-ready 预热测试：

```typescript
it("prewarms the thread window only after agent server health is available", async () => {
  const harness = createHarness();

  harness.runtime.handleAgentServerHealth({ available: false, message: "starting" });
  expect(harness.prewarmer.prepare).not.toHaveBeenCalled();

  harness.runtime.handleAgentServerHealth({ available: true });
  await Promise.resolve();

  expect(harness.prewarmer.prepare).toHaveBeenCalledTimes(1);
  expect(harness.events).toContainEqual({
    channel: "electron_shell",
    type: "thread_window.prepared",
    timestamp: "2026-06-08T00:00:00.000Z",
  });
});
```

运行：

```bash
pnpm --filter handagent-electron-shell test electronShellRuntime.test.ts
```

预期：FAIL，旧 runtime 仍有 prepare command case，且测试文件仍按旧语义组织。

- [ ] **Step 4: 修改 Electron runtime**

在 `apps/electron-shell/src/main/electronShellRuntime.ts` 的 `handleCommand` switch 中删除：

```typescript
case "thread_window.prepare":
  await this.runCommand(command, () => this.options.prewarmer.prepare());
  return;
```

保留 `prepareThreadWindowAfterServerReady()`，它仍由 `handleAgentServerHealth({ available: true })` 和 `handleThreadWindowClosed({ wasPrepared: true, wasVisible: true })` 这类内部事件调用。

- [ ] **Step 5: 验证并提交**

运行：

```bash
pnpm --filter handagent-electron-shell test electronShellProtocol.test.ts electronShellRuntime.test.ts
```

预期：PASS。

提交：

```bash
git add apps/electron-shell/src/main/protocol/electronShellProtocol.ts \
  apps/electron-shell/tests/protocol/electronShellProtocol.test.ts \
  apps/electron-shell/src/main/electronShellRuntime.ts \
  apps/electron-shell/tests/main/electronShellRuntime.test.ts
git commit -m "fix: remove electron thread prepare command"
```

### Task 2: 删除 Swift prepare command 和 PromptPanel show 预热

**Files:**
- Modify: `apps/desktop/Sources/AppServices/ElectronShell/ElectronShellProtocol.swift`
- Modify: `apps/desktop/TestsSwift/AppServices/ElectronShell/ElectronShellProtocolTests.swift`
- Modify: `apps/desktop/Sources/AppServices/ElectronShell/ThreadWindowCommanding.swift`
- Modify: `apps/desktop/Sources/AppServices/ElectronShell/ElectronBackedAppServer.swift`
- Modify: `apps/desktop/TestsSwift/AppServices/ElectronShell/ElectronBackedAppServerTests.swift`
- Modify: `apps/desktop/Sources/Coordinator/ThreadWindowManaging.swift`
- Modify: `apps/desktop/Sources/Coordinator/ElectronThreadWindowLifecycle.swift`
- Modify: `apps/desktop/Sources/Coordinator/ThreadWindowLifecycle.swift`
- Modify: `apps/desktop/Sources/Coordinator/AppCoordinator.swift`
- Modify: `apps/desktop/TestsSwift/Coordinator/AppCoordinatorTests.swift`
- Modify: `apps/desktop/TestsSwift/Coordinator/ElectronThreadWindowLifecycleTests.swift`

- [ ] **Step 1: 更新 Swift 协议测试**

删除 `apps/desktop/TestsSwift/AppServices/ElectronShell/ElectronShellProtocolTests.swift` 中的 `testEncodesPrepareCommand`。

新增确认 prepared event 仍可解码：

```swift
func testDecodesThreadWindowPreparedEvent() throws {
    let data = """
    {"channel":"electron_shell","type":"thread_window.prepared","timestamp":"2026-06-08T00:00:00.000Z"}
    """.data(using: .utf8)!

    let event = try JSONDecoder().decode(ElectronShellEvent.self, from: data)

    XCTAssertEqual(event, .threadWindowPrepared(timestamp: "2026-06-08T00:00:00.000Z"))
}
```

运行：

```bash
bash ./scripts/swiftw test --filter ElectronShellProtocolTests
```

预期：当前代码仍可通过 prepared event，但后续删除 `.prepare` 前，旧 prepare 测试必须已移除。

- [ ] **Step 2: 删除 Swift command DTO 中的 prepare case**

在 `apps/desktop/Sources/AppServices/ElectronShell/ElectronShellProtocol.swift` 中删除：

```swift
case prepare(commandId: String)
```

并删除 encode switch 中：

```swift
case .prepare(let commandId):
    try container.encode("thread_window.prepare", forKey: .type)
    try container.encode(commandId, forKey: .commandId)
```

- [ ] **Step 3: 删除 ThreadWindowCommanding 的 prepare API**

在 `apps/desktop/Sources/AppServices/ElectronShell/ThreadWindowCommanding.swift` 中删除：

```swift
case prepare
```

和：

```swift
@discardableResult
func prepareThreadWindow() throws -> String
```

在 `apps/desktop/Sources/AppServices/ElectronShell/ElectronBackedAppServer.swift` 中删除：

```swift
@discardableResult
func prepareThreadWindow() throws -> String {
    try sendThreadWindowCommand(.prepare) { .prepare(commandId: $0) }
}
```

- [ ] **Step 4: 删除 Coordinator prepare hook**

在 `apps/desktop/Sources/Coordinator/ThreadWindowManaging.swift` 中删除：

```swift
func prepareForPromptPanel()
```

在 `apps/desktop/Sources/Coordinator/ElectronThreadWindowLifecycle.swift` 中删除：

```swift
func prepareForPromptPanel() {
    try? client.prepareThreadWindow()
}
```

并从 `handleCommandResult` 删除：

```swift
case .prepare:
    break
```

在 `apps/desktop/Sources/Coordinator/ThreadWindowLifecycle.swift` 中删除默认路径 no-op：

```swift
func prepareForPromptPanel() {}
```

在 `apps/desktop/Sources/Coordinator/AppCoordinator.swift` 的 `.showPromptPanel` 和 `.togglePromptPanel` 分支中删除：

```swift
threadWindowLifecycle.prepareForPromptPanel()
```

- [ ] **Step 5: 更新 Swift 测试替身**

在 `apps/desktop/TestsSwift/Coordinator/AppCoordinatorTests.swift` 和 `apps/desktop/TestsSwift/Coordinator/ElectronThreadWindowLifecycleTests.swift` 的 recording client 中删除 `prepareThreadWindow()` 实现与 prepare 计数。

新增 AppCoordinator 测试：

```swift
func testShowPromptPanelDoesNotSendElectronPrepareCommand() {
    let appServer = NopAppServer()
    let threadClient = RecordingThreadWindowCommandClient()
    let services = makeServices(
        appServer: appServer,
        threadClient: threadClient,
        showsStatusBubble: false
    )
    let coordinator = AppCoordinator(services: services)

    coordinator.send(.showPromptPanel)
    coordinator.send(.togglePromptPanel)

    XCTAssertTrue(threadClient.sentCommands.isEmpty)
}
```

`RecordingThreadWindowCommandClient` 的 `sentCommands` 只记录 `.openInitialPrompt`、`.openHistory`、`.focus`。

- [ ] **Step 6: 验证并提交**

运行：

```bash
bash ./scripts/swiftw test --filter ElectronShellProtocolTests
bash ./scripts/swiftw test --filter ElectronBackedAppServerTests
bash ./scripts/swiftw test --filter AppCoordinatorTests
bash ./scripts/swiftw test --filter ElectronThreadWindowLifecycleTests
rg -n "thread_window\\.prepare|prepareThreadWindow|prepareForPromptPanel" apps/desktop/Sources apps/electron-shell/src
```

预期：Swift 测试 PASS；`rg` 只允许在文档或计划中命中，不允许在 `apps/desktop/Sources` 或 `apps/electron-shell/src` 中命中。

提交：

```bash
git add apps/desktop/Sources/AppServices/ElectronShell/ElectronShellProtocol.swift \
  apps/desktop/TestsSwift/AppServices/ElectronShell/ElectronShellProtocolTests.swift \
  apps/desktop/Sources/AppServices/ElectronShell/ThreadWindowCommanding.swift \
  apps/desktop/Sources/AppServices/ElectronShell/ElectronBackedAppServer.swift \
  apps/desktop/TestsSwift/AppServices/ElectronShell/ElectronBackedAppServerTests.swift \
  apps/desktop/Sources/Coordinator/ThreadWindowManaging.swift \
  apps/desktop/Sources/Coordinator/ElectronThreadWindowLifecycle.swift \
  apps/desktop/Sources/Coordinator/ThreadWindowLifecycle.swift \
  apps/desktop/Sources/Coordinator/AppCoordinator.swift \
  apps/desktop/TestsSwift/Coordinator/AppCoordinatorTests.swift \
  apps/desktop/TestsSwift/Coordinator/ElectronThreadWindowLifecycleTests.swift \
  apps/desktop/TestsSwift/Coordinator/ThreadWindowLifecycleTests.swift
git commit -m "fix: stop preparing thread window from prompt panel"
```

### Task 3: 抽象 agent-server supervisor 并记录 core runtime host

**Files:**
- Create: `apps/electron-shell/src/main/serverSupervisor/agentServerSupervisor.ts`
- Create: `apps/electron-shell/src/main/serverSupervisor/agentServerEntry.ts`
- Create: `apps/electron-shell/tests/serverSupervisor/agentServerEntry.test.ts`
- Modify: `apps/electron-shell/src/main/serverSupervisor/nodeAgentServerSupervisor.ts`
- Modify: `apps/electron-shell/tests/serverSupervisor/nodeAgentServerSupervisor.test.ts`

- [ ] **Step 1: 创建 supervisor 接口测试**

创建 `apps/electron-shell/tests/serverSupervisor/agentServerEntry.test.ts`：

```typescript
import { describe, expect, it } from "vitest";
import { resolveAgentServerEntry } from "../../src/main/serverSupervisor/agentServerEntry.js";

describe("resolveAgentServerEntry", () => {
  it("selects a utilityProcess JS entry when it exists", () => {
    const entry = resolveAgentServerEntry({
      repoRoot: "/repo",
      fileExists: (path) => path === "/repo/apps/agent-server/dist/server/server.js",
    });

    expect(entry.utilityProcessEntry).toBe("/repo/apps/agent-server/dist/server/server.js");
    expect(entry.utilityProcessBlocker).toBeNull();
    expect(entry.nodeChildEntry).toBe("apps/agent-server/src/server/server.ts");
  });

  it("records the concrete utilityProcess blocker when no JS entry exists", () => {
    const entry = resolveAgentServerEntry({
      repoRoot: "/repo",
      fileExists: () => false,
    });

    expect(entry.utilityProcessEntry).toBeNull();
    expect(entry.utilityProcessBlocker).toBe(
      "apps/agent-server/dist/server/server.js 不存在；当前 agent-server 仍依赖 TypeScript 源码入口和 Node --experimental-transform-types"
    );
    expect(entry.nodeChildEntry).toBe("apps/agent-server/src/server/server.ts");
  });
});
```

运行：

```bash
pnpm --filter handagent-electron-shell test agentServerEntry.test.ts
```

预期：FAIL，文件尚不存在。

- [ ] **Step 2: 创建 supervisor 类型与 entry 解析**

创建 `apps/electron-shell/src/main/serverSupervisor/agentServerSupervisor.ts`：

```typescript
export type AgentServerHealthEvent = {
  available: boolean;
  message?: string;
};

export type AgentServerSupervisorDescription = {
  mode: "node_child" | "utility_process";
  entry: string;
  coreRuntimeHost: "agent-server";
  utilityProcessBlocker: string | null;
};

export type AgentServerLogSink = (line: string) => void;

export type AgentServerSupervisor = {
  start(): void;
  stop(): void;
  onHealth(listener: (event: AgentServerHealthEvent) => void): () => void;
  describe(): AgentServerSupervisorDescription;
};
```

创建 `apps/electron-shell/src/main/serverSupervisor/agentServerEntry.ts`：

```typescript
import { join } from "node:path";

export type AgentServerEntryResolution = {
  nodeChildEntry: "apps/agent-server/src/server/server.ts";
  utilityProcessEntry: string | null;
  utilityProcessBlocker: string | null;
};

type Options = {
  repoRoot: string;
  fileExists?: (path: string) => boolean;
  utilityEntryOverride?: string | null;
};

const nodeChildEntry = "apps/agent-server/src/server/server.ts" as const;
const defaultUtilityEntry = "apps/agent-server/dist/server/server.js";
const missingUtilityEntryBlocker =
  "apps/agent-server/dist/server/server.js 不存在；当前 agent-server 仍依赖 TypeScript 源码入口和 Node --experimental-transform-types";

export function resolveAgentServerEntry(options: Options): AgentServerEntryResolution {
  const fileExists = options.fileExists ?? (() => false);
  const utilityEntry = options.utilityEntryOverride ?? join(options.repoRoot, defaultUtilityEntry);

  if (utilityEntry && fileExists(utilityEntry)) {
    return {
      nodeChildEntry,
      utilityProcessEntry: utilityEntry,
      utilityProcessBlocker: null,
    };
  }

  return {
    nodeChildEntry,
    utilityProcessEntry: null,
    utilityProcessBlocker: missingUtilityEntryBlocker,
  };
}
```

- [ ] **Step 3: 修改 Node supervisor 实现接口**

在 `apps/electron-shell/src/main/serverSupervisor/nodeAgentServerSupervisor.ts` 中：

1. 从 `agentServerSupervisor.ts` import `AgentServerHealthEvent`, `AgentServerLogSink`, `AgentServerSupervisor`, `AgentServerSupervisorDescription`。
2. 删除本文件内重复的 `AgentServerHealthEvent` export。
3. 让 class 实现 `AgentServerSupervisor`。
4. 在 `SupervisorOptions` 增加：

```typescript
utilityProcessBlocker?: string | null;
logSink?: AgentServerLogSink;
```

5. 增加：

```typescript
describe(): AgentServerSupervisorDescription {
  return {
    mode: "node_child",
    entry: "apps/agent-server/src/server/server.ts",
    coreRuntimeHost: "agent-server",
    utilityProcessBlocker: this.options.utilityProcessBlocker ?? null,
  };
}
```

6. 把 `process.stderr.write(formatChildOutput("stdout", chunk))` 和 `process.stderr.write(formatChildOutput("stderr", chunk))` 改为：

```typescript
this.writeLog(formatChildOutput("stdout", chunk));
```

并新增：

```typescript
private writeLog(line: string): void {
  if (this.options.logSink) {
    this.options.logSink(line);
    return;
  }
  process.stderr.write(line);
}
```

7. 在 `handleFailure` 到达上限时发出明确 health：

```typescript
if (this.restartAttempts >= this.maxRestartAttempts) {
  this.emitHealth({
    available: false,
    message: `agent-server stopped after ${this.maxRestartAttempts} restart attempts: ${message}`,
  });
  return;
}
```

- [ ] **Step 4: 更新 Node supervisor 测试**

在 `apps/electron-shell/tests/serverSupervisor/nodeAgentServerSupervisor.test.ts` 增加：

```typescript
it("describes the node child supervisor and utilityProcess blocker", () => {
  const supervisor = new NodeAgentServerSupervisor({
    repoRoot: "/repo",
    nodePath: "/usr/bin/node",
    env: {},
    utilityProcessBlocker: "missing built JS entry",
    waitForReady: () => Promise.resolve(),
    spawnProcess: () => new FakeChildProcess(),
  });

  expect(supervisor.describe()).toEqual({
    mode: "node_child",
    entry: "apps/agent-server/src/server/server.ts",
    coreRuntimeHost: "agent-server",
    utilityProcessBlocker: "missing built JS entry",
  });
});

it("writes child stdout and stderr to the injected log sink", () => {
  const process = new FakeChildProcess();
  const lines: string[] = [];
  const supervisor = new NodeAgentServerSupervisor({
    repoRoot: "/repo",
    nodePath: "/usr/bin/node",
    env: {},
    logSink: (line) => lines.push(line),
    waitForReady: () => Promise.resolve(),
    spawnProcess: () => process,
  });

  supervisor.start();
  process.stdout.emit("data", Buffer.from("ready\n"));
  process.stderr.emit("data", Buffer.from("warn\n"));

  expect(lines).toEqual([
    "[agent-server stdout] ready\n",
    "[agent-server stderr] warn\n",
  ]);
});
```

运行：

```bash
pnpm --filter handagent-electron-shell test agentServerEntry.test.ts nodeAgentServerSupervisor.test.ts
```

预期：PASS。

- [ ] **Step 5: 提交 supervisor abstraction**

```bash
git add apps/electron-shell/src/main/serverSupervisor/agentServerSupervisor.ts \
  apps/electron-shell/src/main/serverSupervisor/agentServerEntry.ts \
  apps/electron-shell/tests/serverSupervisor/agentServerEntry.test.ts \
  apps/electron-shell/src/main/serverSupervisor/nodeAgentServerSupervisor.ts \
  apps/electron-shell/tests/serverSupervisor/nodeAgentServerSupervisor.test.ts
git commit -m "feat: describe electron agent server supervisor"
```

### Task 4: 增加 utilityProcess 候选 supervisor 和 factory

**Files:**
- Create: `apps/electron-shell/src/main/serverSupervisor/utilityProcessAgentServerSupervisor.ts`
- Create: `apps/electron-shell/src/main/serverSupervisor/agentServerSupervisorFactory.ts`
- Create: `apps/electron-shell/tests/serverSupervisor/utilityProcessAgentServerSupervisor.test.ts`
- Create: `apps/electron-shell/tests/serverSupervisor/agentServerSupervisorFactory.test.ts`
- Modify: `apps/electron-shell/src/main/main.ts`

- [ ] **Step 1: 写 utilityProcess supervisor 失败测试**

创建 `apps/electron-shell/tests/serverSupervisor/utilityProcessAgentServerSupervisor.test.ts`：

```typescript
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { UtilityProcessAgentServerSupervisor } from "../../src/main/serverSupervisor/utilityProcessAgentServerSupervisor.js";

describe("UtilityProcessAgentServerSupervisor", () => {
  it("forks the built agent-server entry after Electron is ready", async () => {
    const utility = new FakeUtilityProcess();
    const fork = vi.fn(() => utility);
    const supervisor = new UtilityProcessAgentServerSupervisor({
      repoRoot: "/repo",
      entry: "/repo/apps/agent-server/dist/server/server.js",
      env: { HANDAGENT_LLM_MODE: "mock" },
      forkUtilityProcess: fork,
      waitForReady: () => Promise.resolve(),
    });

    supervisor.start();

    expect(fork).toHaveBeenCalledWith(
      "/repo/apps/agent-server/dist/server/server.js",
      [],
      {
        cwd: "/repo",
        env: expect.objectContaining({ HANDAGENT_LLM_MODE: "mock" }),
        stdio: "pipe",
        serviceName: "HandAgent agent-server",
      },
    );
  });

  it("describes utilityProcess as an agent-server core runtime host", () => {
    const supervisor = new UtilityProcessAgentServerSupervisor({
      repoRoot: "/repo",
      entry: "/repo/apps/agent-server/dist/server/server.js",
      env: {},
      forkUtilityProcess: () => new FakeUtilityProcess(),
      waitForReady: () => Promise.resolve(),
    });

    expect(supervisor.describe()).toEqual({
      mode: "utility_process",
      entry: "/repo/apps/agent-server/dist/server/server.js",
      coreRuntimeHost: "agent-server",
      utilityProcessBlocker: null,
    });
  });
});

class FakeUtilityProcess extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  killed = false;

  kill(): void {
    this.killed = true;
  }
}
```

运行：

```bash
pnpm --filter handagent-electron-shell test utilityProcessAgentServerSupervisor.test.ts
```

预期：FAIL，文件尚不存在。

- [ ] **Step 2: 实现 utilityProcess supervisor**

创建 `apps/electron-shell/src/main/serverSupervisor/utilityProcessAgentServerSupervisor.ts`。结构与 `NodeAgentServerSupervisor` 保持一致，但启动使用注入的 `forkUtilityProcess`：

```typescript
import type { EventEmitter } from "node:events";
import type {
  AgentServerHealthEvent,
  AgentServerLogSink,
  AgentServerSupervisor,
  AgentServerSupervisorDescription,
} from "./agentServerSupervisor.js";

export type UtilityProcessLike = EventEmitter & {
  stdout?: EventEmitter | null;
  stderr?: EventEmitter | null;
  killed?: boolean;
  kill(): void;
};

type UtilityForkOptions = {
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdio: "pipe";
  serviceName: string;
};

type Options = {
  repoRoot: string;
  entry: string;
  env: NodeJS.ProcessEnv;
  forkUtilityProcess: (modulePath: string, args: string[], options: UtilityForkOptions) => UtilityProcessLike;
  waitForReady: () => Promise<void>;
  logSink?: AgentServerLogSink;
};

export class UtilityProcessAgentServerSupervisor implements AgentServerSupervisor {
  private process: UtilityProcessLike | null = null;
  private listeners = new Set<(event: AgentServerHealthEvent) => void>();
  private userRequestedStop = false;

  constructor(private readonly options: Options) {}

  describe(): AgentServerSupervisorDescription {
    return {
      mode: "utility_process",
      entry: this.options.entry,
      coreRuntimeHost: "agent-server",
      utilityProcessBlocker: null,
    };
  }

  onHealth(listener: (event: AgentServerHealthEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    if (this.process) return;
    this.userRequestedStop = false;
    const process = this.options.forkUtilityProcess(this.options.entry, [], {
      cwd: this.options.repoRoot,
      env: Object.assign({}, globalThis.process?.env, this.options.env),
      stdio: "pipe",
      serviceName: "HandAgent agent-server",
    });
    this.process = process;
    process.on("exit", (code: number | null) => this.handleExit(process, code));
    process.on("error", (_type: unknown, _location: unknown, report: unknown) => {
      this.handleFailure(process, `agent-server utility process error: ${String(report)}`);
    });
    this.drainOutput(process);
    void this.emitAvailableWhenReady(process);
  }

  stop(): void {
    this.userRequestedStop = true;
    const process = this.process;
    this.process = null;
    process?.kill();
    this.emitHealth({ available: false, message: "agent-server stopped" });
  }

  private async emitAvailableWhenReady(process: UtilityProcessLike): Promise<void> {
    try {
      await this.options.waitForReady();
    } catch (error) {
      if (this.process !== process || this.userRequestedStop) return;
      process.kill();
      this.handleFailure(process, `agent-server readiness failed: ${errorMessage(error)}`);
      return;
    }
    if (this.process === process && !this.userRequestedStop) {
      this.emitHealth({ available: true });
    }
  }

  private handleExit(process: UtilityProcessLike, code: number | null): void {
    if (this.process !== process) return;
    this.process = null;
    if (!this.userRequestedStop && code !== 0) {
      this.emitHealth({ available: false, message: `agent-server exited with code ${code ?? "unknown"}` });
    }
  }

  private handleFailure(process: UtilityProcessLike, message: string): void {
    if (this.process !== process) return;
    this.process = null;
    this.emitHealth({ available: false, message });
  }

  private emitHealth(event: AgentServerHealthEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  private drainOutput(process: UtilityProcessLike): void {
    process.stdout?.on("data", (chunk) => this.writeLog(formatOutput("stdout", chunk)));
    process.stderr?.on("data", (chunk) => this.writeLog(formatOutput("stderr", chunk)));
  }

  private writeLog(line: string): void {
    this.options.logSink?.(line);
  }
}

function formatOutput(streamName: "stdout" | "stderr", chunk: unknown): string {
  const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
  return `[agent-server ${streamName}] ${text}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}
```

- [ ] **Step 3: 写 supervisor factory 测试**

创建 `apps/electron-shell/tests/serverSupervisor/agentServerSupervisorFactory.test.ts`：

```typescript
import { describe, expect, it } from "vitest";
import { createAgentServerSupervisor } from "../../src/main/serverSupervisor/agentServerSupervisorFactory.js";

describe("createAgentServerSupervisor", () => {
  it("prefers utilityProcess when a JS entry exists", () => {
    const supervisor = createAgentServerSupervisor({
      repoRoot: "/repo",
      nodePath: "/usr/bin/node",
      env: {},
      fileExists: (path) => path === "/repo/apps/agent-server/dist/server/server.js",
      forkUtilityProcess: () => ({
        on: () => undefined,
        stdout: null,
        stderr: null,
        kill: () => undefined,
      }),
      waitForReady: () => Promise.resolve(),
    });

    expect(supervisor.describe()).toMatchObject({
      mode: "utility_process",
      entry: "/repo/apps/agent-server/dist/server/server.js",
      coreRuntimeHost: "agent-server",
      utilityProcessBlocker: null,
    });
  });

  it("falls back to Node child process and exposes the utilityProcess blocker", () => {
    const supervisor = createAgentServerSupervisor({
      repoRoot: "/repo",
      nodePath: "/usr/bin/node",
      env: {},
      fileExists: () => false,
      spawnProcess: () => ({
        on: () => undefined,
        stdout: null,
        stderr: null,
        kill: () => undefined,
      }),
      waitForReady: () => Promise.resolve(),
    });

    expect(supervisor.describe()).toMatchObject({
      mode: "node_child",
      entry: "apps/agent-server/src/server/server.ts",
      coreRuntimeHost: "agent-server",
      utilityProcessBlocker: "apps/agent-server/dist/server/server.js 不存在；当前 agent-server 仍依赖 TypeScript 源码入口和 Node --experimental-transform-types",
    });
  });
});
```

- [ ] **Step 4: 实现 supervisor factory**

创建 `apps/electron-shell/src/main/serverSupervisor/agentServerSupervisorFactory.ts`：

```typescript
import { existsSync } from "node:fs";
import { NodeAgentServerSupervisor, type AgentServerChildProcess } from "./nodeAgentServerSupervisor.js";
import type { AgentServerLogSink, AgentServerSupervisor } from "./agentServerSupervisor.js";
import { resolveAgentServerEntry } from "./agentServerEntry.js";
import {
  UtilityProcessAgentServerSupervisor,
  type UtilityProcessLike,
} from "./utilityProcessAgentServerSupervisor.js";

type Options = {
  repoRoot: string;
  nodePath: string;
  env: NodeJS.ProcessEnv;
  fileExists?: (path: string) => boolean;
  forkUtilityProcess?: (modulePath: string, args: string[], options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    stdio: "pipe";
    serviceName: string;
  }) => UtilityProcessLike;
  spawnProcess?: (command: string, args: string[], options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
  }) => AgentServerChildProcess;
  waitForReady?: () => Promise<void>;
  logSink?: AgentServerLogSink;
};

export function createAgentServerSupervisor(options: Options): AgentServerSupervisor {
  const entry = resolveAgentServerEntry({
    repoRoot: options.repoRoot,
    fileExists: options.fileExists ?? existsSync,
  });

  if (entry.utilityProcessEntry && options.forkUtilityProcess) {
    return new UtilityProcessAgentServerSupervisor({
      repoRoot: options.repoRoot,
      entry: entry.utilityProcessEntry,
      env: options.env,
      forkUtilityProcess: options.forkUtilityProcess,
      waitForReady: options.waitForReady ?? (() => Promise.resolve()),
      logSink: options.logSink,
    });
  }

  return new NodeAgentServerSupervisor({
    repoRoot: options.repoRoot,
    nodePath: options.nodePath,
    env: options.env,
    spawnProcess: options.spawnProcess,
    waitForReady: options.waitForReady,
    utilityProcessBlocker: entry.utilityProcessBlocker,
    logSink: options.logSink,
  });
}
```

- [ ] **Step 5: 接线 Electron main**

在 `apps/electron-shell/src/main/main.ts`：

1. 把 import:

```typescript
import { BrowserWindow, app, ipcMain, screen } from "electron";
import { NodeAgentServerSupervisor } from "./serverSupervisor/nodeAgentServerSupervisor.js";
```

改为：

```typescript
import { BrowserWindow, app, ipcMain, screen, utilityProcess } from "electron";
import { createAgentServerSupervisor } from "./serverSupervisor/agentServerSupervisorFactory.js";
```

2. 把 supervisor 创建改为：

```typescript
const supervisor = createAgentServerSupervisor({
  repoRoot,
  nodePath,
  env: process.env.HANDAGENT_LLM_MODE
    ? { HANDAGENT_LLM_MODE: process.env.HANDAGENT_LLM_MODE }
    : {},
  forkUtilityProcess: (modulePath, args, options) =>
    utilityProcess.fork(modulePath, args, options),
  logSink: (line) => process.stderr.write(line),
});
```

3. 在 `app.whenReady()` 后、`startSupervisor()` 前输出 supervisor description：

```typescript
process.stderr.write(`[electron-shell] agent-server supervisor: ${JSON.stringify(supervisor.describe())}\n`);
```

- [ ] **Step 6: 验证并提交**

运行：

```bash
pnpm --filter handagent-electron-shell test agentServerSupervisorFactory.test.ts utilityProcessAgentServerSupervisor.test.ts
pnpm --filter handagent-electron-shell build
```

预期：PASS。当前没有 `apps/agent-server/dist/server/server.js` 时，默认 description 为 `mode: "node_child"` 并带具体 blocker。

提交：

```bash
git add apps/electron-shell/src/main/serverSupervisor/utilityProcessAgentServerSupervisor.ts \
  apps/electron-shell/src/main/serverSupervisor/agentServerSupervisorFactory.ts \
  apps/electron-shell/tests/serverSupervisor/utilityProcessAgentServerSupervisor.test.ts \
  apps/electron-shell/tests/serverSupervisor/agentServerSupervisorFactory.test.ts \
  apps/electron-shell/src/main/main.ts
git commit -m "feat: evaluate utility process agent server supervision"
```

### Task 5: 加固 shutdown、重启和 core 常驻验证

**Files:**
- Modify: `apps/electron-shell/tests/serverSupervisor/nodeAgentServerSupervisor.test.ts`
- Modify: `apps/electron-shell/tests/main/electronShellRuntime.test.ts`
- Modify: `apps/desktop/TestsSwift/AppServices/ElectronShell/ElectronBackedAppServerTests.swift`
- Modify: `apps/desktop/TestsSwift/Coordinator/AppCoordinatorTests.swift`

- [ ] **Step 1: 覆盖最大重启后的明确 health**

在 `apps/electron-shell/tests/serverSupervisor/nodeAgentServerSupervisor.test.ts` 增加：

```typescript
it("reports a final unavailable health event after max restart attempts", () => {
  const process = new FakeChildProcess();
  const health: Array<{ available: boolean; message?: string }> = [];
  const scheduled: Array<() => void> = [];
  const supervisor = new NodeAgentServerSupervisor({
    repoRoot: "/repo",
    nodePath: "/usr/bin/node",
    env: {},
    maxRestartAttempts: 1,
    waitForReady: () => Promise.resolve(),
    spawnProcess: () => process,
    scheduleRestart: (callback) => scheduled.push(callback),
  });
  supervisor.onHealth((event) => health.push(event));

  supervisor.start();
  process.emit("exit", 9, null);
  scheduled[0]?.();
  process.emit("exit", 9, null);

  expect(health.at(-1)).toEqual({
    available: false,
    message: "agent-server stopped after 1 restart attempts: agent-server exited with code 9",
  });
});
```

运行：

```bash
pnpm --filter handagent-electron-shell test nodeAgentServerSupervisor.test.ts
```

预期：PASS after Task 3 implementation。

- [ ] **Step 2: 覆盖关闭 UI 不停止 supervisor**

在 `apps/electron-shell/tests/main/electronShellRuntime.test.ts` 增加：

```typescript
it("does not stop the supervisor when the visible thread window closes", () => {
  const harness = createHarness();
  harness.runtime.handleAgentServerHealth({ available: true });

  harness.runtime.handleThreadWindowClosed({ wasPrepared: true, wasVisible: true });

  expect(harness.stopSupervisor).not.toHaveBeenCalled();
  expect(harness.quit).not.toHaveBeenCalled();
  expect(harness.events).toContainEqual({
    channel: "electron_shell",
    type: "thread_window.closed",
    timestamp: "2026-06-08T00:00:00.000Z",
    wasVisible: true,
  });
});
```

运行：

```bash
pnpm --filter handagent-electron-shell test electronShellRuntime.test.ts
```

预期：PASS。

- [ ] **Step 3: 覆盖 Swift stop 才 shutdown**

在 `apps/desktop/TestsSwift/AppServices/ElectronShell/ElectronBackedAppServerTests.swift` 确认或新增：

```swift
func testThreadWindowClosedDoesNotSendShutdown() {
    let shell = RecordingElectronShellProcess()
    let appServer = ElectronBackedAppServer(shell: shell, platformClient: nil)

    appServer.start()
    shell.emit(.agentServerHealth(available: true, message: nil))
    shell.emit(.threadWindowPrepared(timestamp: "2026-06-08T00:00:01.000Z"))
    shell.emit(.threadWindowClosed(timestamp: "2026-06-08T00:00:02.000Z", wasVisible: true))

    XCTAssertFalse(shell.sentCommands.contains { command in
        if case .shutdown = command { return true }
        return false
    })
}
```

运行：

```bash
bash ./scripts/swiftw test --filter ElectronBackedAppServerTests
```

预期：PASS。

- [ ] **Step 4: 验证 core runtime 只在 agent-server 文档边界内**

运行：

```bash
rg -n "AgentRuntime|ThreadRuntimeOrchestrator|ToolRegistry|LLMClient" apps/electron-shell apps/desktop/Sources
```

预期：只允许在文档说明中命中；Electron main/renderer 和 Swift host 不应 import 或实例化 core runtime 类型。

- [ ] **Step 5: 提交**

```bash
git add apps/electron-shell/tests/serverSupervisor/nodeAgentServerSupervisor.test.ts \
  apps/electron-shell/tests/main/electronShellRuntime.test.ts \
  apps/desktop/TestsSwift/AppServices/ElectronShell/ElectronBackedAppServerTests.swift \
  apps/desktop/TestsSwift/Coordinator/AppCoordinatorTests.swift
git commit -m "test: verify electron agent server stays resident"
```

### Task 6: 加固 packaged app 与 mock LLM 路径

**Files:**
- Modify: `apps/desktop/Sources/AppServices/AppServices.swift`
- Modify: `apps/desktop/TestsSwift/AppServices/AppServicesTests.swift`
- Modify: `scripts/package-app.sh`
- Modify: `scripts/package-app.test.sh`

- [ ] **Step 1: 写 Swift launch configuration 失败测试**

在 `apps/desktop/TestsSwift/AppServices/AppServicesTests.swift` 增加：

```swift
@MainActor
func testBundledElectronShellMainIsPreferredWhenPackagedResourcesExist() throws {
    let resources = URL(fileURLWithPath: "/App/Contents/Resources", isDirectory: true)
    let bundledMain = resources.appendingPathComponent("ElectronShell/dist/main/main.js")

    let configuration = AppServices.defaultElectronShellLaunchConfiguration(
        environment: [
            "HANDAGENT_ELECTRON_SHELL": "1",
            "HANDAGENT_ELECTRON_BINARY": "/custom/electron"
        ],
        currentDirectoryURL: URL(fileURLWithPath: "/not-repo", isDirectory: true),
        bundleExecutableURL: URL(fileURLWithPath: "/App/Contents/MacOS/HandAgentDesktop"),
        bundleResourceURL: resources,
        bundleURL: URL(fileURLWithPath: "/App", isDirectory: true),
        fileExists: { path in path == bundledMain.path }
    )

    XCTAssertEqual(configuration.launchPath, "/custom/electron")
    XCTAssertEqual(configuration.arguments, [bundledMain.path])
}
```

运行：

```bash
bash ./scripts/swiftw test --filter AppServicesTests
```

预期：FAIL，当前默认 main 仍是 `apps/electron-shell/dist/main/main.js`。

- [ ] **Step 2: 修改 launch configuration**

在 `apps/desktop/Sources/AppServices/AppServices.swift` 的 `defaultElectronShellLaunchConfiguration` 中，把 `electronMain` 解析改成：

```swift
let bundledElectronMain = bundleResourceURL?
    .appendingPathComponent("ElectronShell/dist/main/main.js")
let electronMain = environment["HANDAGENT_ELECTRON_MAIN"].flatMap { $0.isEmpty ? nil : $0 }
    ?? bundledElectronMain.flatMap { fileExists($0.path) ? $0.path : nil }
    ?? "apps/electron-shell/dist/main/main.js"
```

保留显式 `HANDAGENT_ELECTRON_MAIN` 优先级。

- [ ] **Step 3: 更新 package script 测试**

在 `scripts/package-app.test.sh` 增加断言：mock package 运行后必须复制 Electron shell dist。

期望新增断言形态：

```bash
if [[ ! -d "$DIST_DIR/HandAgentDesktop.app/Contents/Resources/ElectronShell/dist/main" ]]; then
  echo "missing bundled ElectronShell dist/main" >&2
  exit 1
fi
```

运行：

```bash
bash ./scripts/package-app.test.sh
```

预期：FAIL，当前 package script 尚未复制 Electron shell dist。

- [ ] **Step 4: 修改 package script**

在 `scripts/package-app.sh` 中增加：

```bash
ELECTRON_SHELL_DIST_DIR="${HANDAGENT_ELECTRON_SHELL_DIST_DIR:-$ROOT_DIR/apps/electron-shell/dist}"
```

在 build 阶段增加：

```bash
if [[ -z "${HANDAGENT_ELECTRON_SHELL_DIST_DIR:-}" ]]; then
  ensure_workspace_dependencies
  echo "[package-app] Building electron-shell"
  (cd "$ROOT_DIR" && pnpm --filter handagent-electron-shell build)
fi
```

在资源复制阶段增加：

```bash
if [[ ! -f "$ELECTRON_SHELL_DIST_DIR/main/main.js" ]]; then
  printf 'Missing Electron shell build: %s/main/main.js\n' "$ELECTRON_SHELL_DIST_DIR" >&2
  printf 'Run pnpm --filter handagent-electron-shell build or set HANDAGENT_ELECTRON_SHELL_DIST_DIR.\n' >&2
  exit 1
fi

rm -rf "$APP_DIR/Contents/Resources/ElectronShell"
mkdir -p "$APP_DIR/Contents/Resources/ElectronShell/dist"
cp -R "$ELECTRON_SHELL_DIST_DIR"/. "$APP_DIR/Contents/Resources/ElectronShell/dist/"
```

- [ ] **Step 5: 验证并提交**

运行：

```bash
bash ./scripts/package-app.test.sh
bash ./scripts/swiftw test --filter AppServicesTests
```

预期：PASS。

提交：

```bash
git add apps/desktop/Sources/AppServices/AppServices.swift \
  apps/desktop/TestsSwift/AppServices/AppServicesTests.swift \
  scripts/package-app.sh \
  scripts/package-app.test.sh
git commit -m "fix: package electron shell resources"
```

### Task 7: 更新文档与手工 QA

**Files:**
- Modify: `apps/electron-shell/electron-shell.md`
- Modify: `apps/desktop/Sources/AppServices/ElectronShell/electron-shell.md`
- Modify: `apps/desktop/Sources/Coordinator/coordinator.md`
- Modify: `apps/desktop/desktop.md`
- Modify: `handAgent.md`
- Modify: `docs/manual-qa.md`

- [ ] **Step 1: 更新 Electron shell 文档**

在 `apps/electron-shell/electron-shell.md` 中把 “Phase 2” 改为 “Phase 3”，并确保包含：

```markdown
## Phase 3 supervisor

- Electron main 在 app ready 后启动唯一 agent-server supervisor。
- supervisor 优先使用 `utilityProcess` 的构建后 JS entry；当前没有 `apps/agent-server/dist/server/server.js` 时，使用 Node child process，并在启动日志中记录 blocker。
- agent-server 是唯一承载 `packages/core` thread/runtime/tool 循环的后台进程。
- 关闭 ThreadWindow 或 ActivityWindow 不停止 agent-server；只有 Electron shutdown 会停止后台服务。
- `thread_window.prepare` 不再是 Swift command。hidden ThreadWindow 预热由 Electron main 在 agent-server ready 后主动执行。
```

- [ ] **Step 2: 更新 Swift ElectronShell 文档**

在 `apps/desktop/Sources/AppServices/ElectronShell/electron-shell.md` 中替换职责描述：

```markdown
- 作为 `ThreadWindowCommanding` 实现，只接收 openInitialPrompt/openHistory/focus 意图；不再接收 prepare 意图。
- 在 `agent_server.health available=true` 与 `thread_window.prepared` 同时成立后，向 `AgentServerHealth` 暴露可提交状态。
- PromptPanel show/toggle 不触发 ThreadWindow 预热；Electron main 在启动阶段负责 hidden ThreadWindow 预热。
```

- [ ] **Step 3: 更新 Coordinator 与仓库总览**

在 `apps/desktop/Sources/Coordinator/coordinator.md` 和 `apps/desktop/desktop.md` 写明：

```markdown
PromptPanel show/toggle 只负责显示原生输入面板和刷新 action 定义，不触发 ThreadWindow prepare。Electron flag 路径的 ThreadWindow 预热由 Electron main 在 agent-server ready 后主动完成。
```

在 `handAgent.md` 的 Electron shell 不变量中补充：

```markdown
Swift 不发送 `thread_window.prepare`；Electron main 是 hidden ThreadWindow 预热的唯一 owner。agent-server 是唯一承载 core runtime 的后台进程，关闭 Electron UI 窗口不停止该进程。
```

- [ ] **Step 4: 更新 manual QA**

在 `docs/manual-qa.md` 的 Electron UI Shell 区域新增：

```markdown
## Electron UI Shell Phase 3 Supervision Hardening（P2）

**实施状态**：未通过实机 QA；本节为待验收项，不得归档为已通过。

1. 运行 `pnpm --filter handagent-electron-shell build`。
1. 设置 `HANDAGENT_ELECTRON_SHELL=1` 后运行桌面 App，确认启动日志包含 agent-server supervisor description，并明确 `mode`、`coreRuntimeHost` 与 `utilityProcessBlocker`。
1. 打开 PromptPanel 多次，确认没有发送 `thread_window.prepare` command；ThreadWindow hidden prewarm 已在 app-server ready 后完成。
1. 提交 prompt，确认 Electron ThreadWindow 打开新 thread，首条 user message 不丢失。
1. 关闭 visible ThreadWindow，确认 agent-server 进程仍存在；再次打开 PromptPanel 并提交，确认仍通过同一后台服务执行。
1. 关闭 Electron StatusBubble，确认 agent-server 进程仍存在，ThreadWindow 仍可继续对话。
1. 模拟 agent-server 非零退出，确认 supervisor 按退避重启；超过最大次数后 Swift 显示明确 fatal/diagnostic 文案。
1. 执行 `bash ./scripts/package-app.sh --mock-llm`，确认 `.app/Contents/Resources/ElectronShell/dist/main/main.js` 存在。
1. 使用 mock LLM packaged app 路径启动 Electron flag，确认 prompt 返回 mock assistant，不访问真实 LLM。
1. 退出 HandAgent 后确认 Electron、agent-server 和 renderer 进程不残留。
```

- [ ] **Step 5: 文档 grep 验证并提交**

运行：

```bash
rg -n "thread_window\\.prepare|prepareForPromptPanel|prepareThreadWindow" apps docs handAgent.md
```

预期：只允许在 spec、Phase 3 plan、manual QA 的“确认不存在/删除旧 command”语境中出现。

提交：

```bash
git add apps/electron-shell/electron-shell.md \
  apps/desktop/Sources/AppServices/ElectronShell/electron-shell.md \
  apps/desktop/Sources/Coordinator/coordinator.md \
  apps/desktop/desktop.md \
  handAgent.md \
  docs/manual-qa.md
git commit -m "docs: update electron shell supervision hardening"
```

### Task 8: 最终验证与文档审核

**Files:**
- Verify only, plus any doc updates found by independent audit.

- [ ] **Step 1: 运行自动化验证**

运行：

```bash
bash ./scripts/test.sh
bash ./scripts/swiftw test
bash ./scripts/swiftw build
pnpm --filter handagent-electron-shell build
pnpm --filter handagent-thread-window-web build
git diff --check "$(git merge-base HEAD main)"..HEAD
```

预期：全部 PASS。

- [ ] **Step 2: 运行 source-level 不变量检查**

运行：

```bash
rg -n "thread_window\\.prepare|prepareForPromptPanel|prepareThreadWindow" apps/desktop/Sources apps/electron-shell/src
rg -n "AgentRuntime|ThreadRuntimeOrchestrator|ToolRegistry|LLMClient" apps/electron-shell/src apps/desktop/Sources
```

预期：

- 第一条命令无输出。
- 第二条命令无源码命中；如有命中，必须是文档文件，不允许 Electron/Swift UI 源码直接持有 core runtime。

- [ ] **Step 3: 独立文档审核**

按仓库 AGENTS 要求分发独立文档审核子 agent。子 agent 必须：

- 阅读 `docs/superpowers/specs/2026-06-08-electron-ui-shell-migration.md`。
- 阅读所有修改文件所在目录的 `<dir>.md`，沿父目录读到 `handAgent.md`。
- 核对 spec、Phase 3 plan、代码和相关 md 是否一致。
- 更新所有过期 md。
- 确认 `docs/manual-qa.md` 已包含 Phase 3 待验收项。

- [ ] **Step 4: 提交审核更新**

如果文档审核修改了文件，提交：

```bash
git add handAgent.md \
  apps/electron-shell/electron-shell.md \
  apps/desktop/Sources/AppServices/ElectronShell/electron-shell.md \
  apps/desktop/Sources/Coordinator/coordinator.md \
  apps/desktop/desktop.md \
  docs/manual-qa.md
git commit -m "docs: audit electron shell phase three hardening"
```

- [ ] **Step 5: 最终状态确认**

运行：

```bash
git status --short --branch
git log --oneline --decorate -5
```

预期：worktree 干净，最近提交包含 Phase 3 implementation、docs 和 audit。

## Self-Review

- Spec coverage：计划覆盖 Phase 3 的四个核心要求：删除 `thread_window.prepare`、启动阶段 hidden prewarm、`utilityProcess` 评估/Node fallback blocker、core runtime 常驻在 agent-server。
- Placeholder scan：本计划没有使用占位式任务；utilityProcess 不可用路径给出了当前具体 blocker。
- Type consistency：TypeScript `SwiftToElectronCommand` 删除 prepare，对应 Swift `ElectronShellCommand` 删除 `.prepare`；Swift `ThreadWindowCommanding` 删除 `prepareThreadWindow()`，对应 Coordinator `ThreadWindowManaging` 删除 `prepareForPromptPanel()`。

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-08-electron-ui-shell-phase-3.md`. Two execution options:

1. **Subagent-Driven (recommended)** - dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - execute tasks in this session using executing-plans, batch execution with checkpoints.

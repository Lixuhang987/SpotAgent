# Electron UI Shell Phase 0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不替换现有 WKWebView ThreadWindow 的前提下，引入可测试的 Electron shell、Swift 命令桥、agent-server 监督进程和隐藏 ThreadWindow 预热占位。

**Architecture:** Phase 0 使用 feature flag 接入 Electron，不改变默认生产路径。Swift 继续保留 PromptPanel、Settings、平台能力和当前 WKWebView ThreadWindow；当 `HANDAGENT_ELECTRON_SHELL=1` 时，Swift 启动 Electron，Electron main 监督 agent-server 并创建隐藏 `BrowserWindow`，Swift 只在收到 `agent_server.health available=true` 与 `thread_window.prepared` 后允许 PromptPanel 提交。React ThreadWindow 真正迁到 Electron、StatusBubble 迁到 activity stream、`utilityProcess` 固化分别进入后续独立计划。

**Tech Stack:** Swift 6, AppKit, XCTest, Electron, TypeScript, Vitest, Node child process supervision, newline-delimited JSON over stdio.

---

## Scope Check

迁移 spec 覆盖 Electron shell、Swift 生命周期、ThreadWindow 替换、StatusBubble、`/api/activity`、打包和进程监督。它不是一个适合单次执行的子系统。本计划只实现 Phase 0：

- 新增 `apps/electron-shell`。
- Swift 可以通过 feature flag 启动 Electron。
- Electron 是 feature flag 路径下唯一的 agent-server supervisor。
- Electron 启动后创建隐藏 ThreadWindow，占位预热现有 React bundle。
- Swift 可解析 Electron ready、server health、thread prepared、crash 和 command ack 事件。
- 默认路径仍走现有 `AppServer + WKWebView`，避免影响当前功能。

本计划不迁移真实 PromptPanel submit 到 Electron ThreadWindow，不新增 `/api/activity`，不删除 Swift `StatusBubble`，不改变 `/api/platform` 的 Swift 实现。

## File Map

| 操作 | 路径 | 职责 |
|------|------|------|
| Modify | `pnpm-workspace.yaml` | 将 `apps/electron-shell` 加入 pnpm workspace |
| Modify | `package.json` | 增加 Electron shell build/test 脚本 |
| Modify | `scripts/test.sh` | 纳入 Electron shell Vitest |
| Create | `apps/electron-shell/package.json` | Electron shell 包声明、依赖和脚本 |
| Create | `apps/electron-shell/tsconfig.json` | Electron main/preload TypeScript 构建配置 |
| Create | `apps/electron-shell/vitest.config.ts` | Electron shell 单元测试配置 |
| Create | `apps/electron-shell/tests/smoke.test.ts` | 新包创建后的最小测试入口 |
| Create | `apps/electron-shell/electron-shell.md` | Electron shell 模块文档 |
| Create | `apps/electron-shell/src/main/protocol/electronShellProtocol.ts` | Swift 与 Electron 的 command/event 类型、编码和守卫 |
| Create | `apps/electron-shell/tests/protocol/electronShellProtocol.test.ts` | bridge 协议单测 |
| Create | `apps/electron-shell/src/main/swiftBridge/jsonLineBridge.ts` | stdio JSON line bridge |
| Create | `apps/electron-shell/tests/swiftBridge/jsonLineBridge.test.ts` | JSON line bridge 单测 |
| Create | `apps/electron-shell/src/main/serverSupervisor/nodeAgentServerSupervisor.ts` | 受监督 Node child process 版 agent-server supervisor |
| Create | `apps/electron-shell/tests/serverSupervisor/nodeAgentServerSupervisor.test.ts` | supervisor 单测 |
| Create | `apps/electron-shell/src/main/windows/threadWindowPrewarmer.ts` | 隐藏 ThreadWindow `BrowserWindow` 预热与后续 command 入口 |
| Create | `apps/electron-shell/tests/windows/threadWindowPrewarmer.test.ts` | 隐藏预热窗口单测 |
| Create | `apps/electron-shell/src/preload/threadWindowPreload.ts` | Electron renderer 侧最小安全 preload |
| Create | `apps/electron-shell/src/main/main.ts` | Electron app 组合根 |
| Create | `apps/desktop/Sources/AppServices/ElectronShell/electron-shell.md` | Swift ElectronShell 模块文档 |
| Create | `apps/desktop/Sources/AppServices/ElectronShell/ElectronShellProtocol.swift` | Swift 侧 command/event DTO |
| Create | `apps/desktop/Sources/AppServices/ElectronShell/ElectronShellProcess.swift` | Swift 侧 Electron 子进程与 stdio bridge |
| Create | `apps/desktop/Sources/AppServices/ElectronShell/ElectronBackedAppServer.swift` | feature flag 路径下的 `AppServerManaging` 实现 |
| Create | `apps/desktop/TestsSwift/AppServices/ElectronShell/ElectronShellProtocolTests.swift` | Swift DTO 编解码测试 |
| Create | `apps/desktop/TestsSwift/AppServices/ElectronShell/ElectronShellProcessTests.swift` | Swift stdout 分片解码测试 |
| Create | `apps/desktop/TestsSwift/AppServices/ElectronShell/ElectronBackedAppServerTests.swift` | Swift Electron-backed health gate 测试 |
| Modify | `apps/desktop/Sources/AppServices/AppServices.swift` | 根据 `HANDAGENT_ELECTRON_SHELL` 选择默认 app server |
| Modify | `apps/desktop/Sources/AppServices/app-services.md` | 索引新增 ElectronShell 模块 |
| Modify | `apps/desktop/Sources/AppServices/AgentServer/agent-server.md` | 说明 feature flag 下 agent-server 由 Electron 监督 |
| Modify | `apps/desktop/desktop.md` | 记录 Phase 0 feature flag 与默认路径 |
| Modify | `apps/apps.md` | 索引 `electron-shell` |
| Modify | `handAgent.md` | 记录 Phase 0 的可选 Electron shell 边界 |
| Modify | `docs/manual-qa.md` | 增加 Electron shell Phase 0 手工验收项 |

## External Facts To Preserve

- Electron `BrowserWindow` 支持 `show: false` 创建隐藏窗口，隐藏预热不能调用 `show()` 或 `focus()`。
- Electron renderer 不能直接获得 Node/Electron 全量能力；preload 使用 `contextIsolation: true`，只暴露最小 API。
- Electron renderer 间、renderer 与 main 间仍需要明确 IPC 或受控 preload API；Phase 0 只把 Swift command 送到 Electron main，不让 renderer 直接处理 Swift stdio。
- `utilityProcess` 是后续优先选型；Phase 0 允许先使用受监督 Node child process，因为当前 agent-server 入口仍是 TypeScript 源码运行方式。

## Tasks

### Task 1: 建立 Electron shell workspace 骨架

**Files:**
- Modify: `pnpm-workspace.yaml`
- Modify: `package.json`
- Create: `apps/electron-shell/package.json`
- Create: `apps/electron-shell/tsconfig.json`
- Create: `apps/electron-shell/vitest.config.ts`
- Create: `apps/electron-shell/tests/smoke.test.ts`
- Create: `apps/electron-shell/electron-shell.md`

- [ ] **Step 1: 运行缺包验证**

运行：

```bash
pnpm --filter handagent-electron-shell test
```

预期：FAIL，输出包含 `No projects matched the filters`。

- [ ] **Step 2: 将 Electron shell 加入 workspace**

在 `pnpm-workspace.yaml` 中加入：

```yaml
packages:
  - apps/agent-server
  - apps/thread-window-web
  - apps/electron-shell
  - packages/core
```

在根 `package.json` 的 `scripts` 中加入：

```json
"build:electron-shell": "pnpm --filter handagent-electron-shell build",
"test:electron-shell": "pnpm --filter handagent-electron-shell test"
```

- [ ] **Step 3: 创建 Electron shell package**

创建 `apps/electron-shell/package.json`：

```json
{
  "name": "handagent-electron-shell",
  "private": true,
  "type": "module",
  "main": "dist/main/main.js",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "pnpm build && electron dist/main/main.js",
    "test": "vitest run"
  },
  "dependencies": {
    "@handagent/core": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^24.10.1",
    "electron": "^42.3.3",
    "typescript": "^5.9.3",
    "vitest": "^3.2.4"
  }
}
```

创建 `apps/electron-shell/tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "rootDir": "src",
    "outDir": "dist",
    "types": ["node"]
  },
  "include": ["src/**/*.ts"]
}
```

创建 `apps/electron-shell/vitest.config.ts`：

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
```

创建 `apps/electron-shell/tests/smoke.test.ts`：

```typescript
import { expect, it } from "vitest";

it("loads the electron shell test runtime", () => {
  expect(true).toBe(true);
});
```

创建 `apps/electron-shell/electron-shell.md`：

```markdown
# electron-shell

`apps/electron-shell` 是 Phase 0 新增的 Electron UI shell。当前只在 `HANDAGENT_ELECTRON_SHELL=1` 时由 Swift 启动。

## Phase 0 职责

- 通过 stdio newline-delimited JSON 接收 Swift command，回写 Electron event。
- 作为 feature flag 路径下唯一的 agent-server supervisor。
- 在 Electron `app.whenReady()` 后创建隐藏 ThreadWindow `BrowserWindow`，加载现有 `apps/thread-window-web` bundle。
- 向 Swift 回报 `electron.ready`、`agent_server.health`、`thread_window.prepared`、`renderer.crashed` 和 `command.ack`。

## Phase 0 边界

- 不替换默认 Swift `AppServer` 路径。
- 不迁移真实 PromptPanel submit。
- 不新增 `/api/activity`。
- 不实现 macOS 原生 platform 能力，平台能力仍走 Swift `/api/platform`。

## 验证命令

```bash
pnpm --filter handagent-electron-shell test
pnpm --filter handagent-electron-shell build
```
```

- [ ] **Step 4: 安装依赖并验证空包**

运行：

```bash
pnpm install
pnpm --filter handagent-electron-shell test
pnpm --filter handagent-electron-shell build
```

预期：`test` PASS，`build` PASS。

- [ ] **Step 5: 提交骨架**

运行：

```bash
git add pnpm-workspace.yaml package.json pnpm-lock.yaml apps/electron-shell
git commit -m "feat: add electron shell workspace package"
```

### Task 2: 定义 Swift 和 Electron 的 bridge 协议

**Files:**
- Create: `apps/electron-shell/src/main/protocol/electronShellProtocol.ts`
- Create: `apps/electron-shell/tests/protocol/electronShellProtocol.test.ts`
- Create: `apps/desktop/Sources/AppServices/ElectronShell/ElectronShellProtocol.swift`
- Create: `apps/desktop/TestsSwift/AppServices/ElectronShell/ElectronShellProtocolTests.swift`

- [ ] **Step 1: 写 TypeScript 协议失败测试**

创建 `apps/electron-shell/tests/protocol/electronShellProtocol.test.ts`：

```typescript
import { describe, expect, it } from "vitest";
import {
  encodeEvent,
  isSwiftToElectronCommand,
  parseCommand,
} from "../../src/main/protocol/electronShellProtocol.js";

describe("electronShellProtocol", () => {
  it("parses open initial prompt commands", () => {
    const command = parseCommand(JSON.stringify({
      channel: "electron_shell",
      type: "thread_window.open_initial_prompt",
      commandId: "cmd-1",
      payload: {
        clientRequestId: "prompt-1",
        text: "hello",
        attachments: [],
        actionBinding: null,
      },
    }));

    expect(isSwiftToElectronCommand(command)).toBe(true);
    expect(command.type).toBe("thread_window.open_initial_prompt");
    expect(command.payload.text).toBe("hello");
  });

  it("rejects commands without the electron shell channel", () => {
    expect(() => parseCommand(JSON.stringify({
      channel: "platform",
      type: "thread_window.focus",
      commandId: "cmd-2",
    }))).toThrow("unsupported electron shell command");
  });

  it("encodes command acknowledgements", () => {
    expect(encodeEvent({
      channel: "electron_shell",
      type: "command.ack",
      commandId: "cmd-3",
      ok: false,
      error: "renderer unavailable",
    })).toBe("{\"channel\":\"electron_shell\",\"type\":\"command.ack\",\"commandId\":\"cmd-3\",\"ok\":false,\"error\":\"renderer unavailable\"}");
  });
});
```

- [ ] **Step 2: 运行 TypeScript 失败测试**

运行：

```bash
pnpm --filter handagent-electron-shell test tests/protocol/electronShellProtocol.test.ts
```

预期：FAIL，因为 `electronShellProtocol.ts` 尚未存在。

- [ ] **Step 3: 实现 TypeScript 协议**

创建 `apps/electron-shell/src/main/protocol/electronShellProtocol.ts`：

```typescript
type InitialPromptPayload = {
  clientRequestId: string;
  text: string;
  attachments: unknown[];
  actionBinding: { pluginId: string; promptName: string } | null;
};

export type SwiftToElectronCommand =
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

export type ElectronToSwiftEvent =
  | { channel: "electron_shell"; type: "electron.ready"; timestamp: string }
  | { channel: "electron_shell"; type: "thread_window.prepared"; timestamp: string }
  | { channel: "electron_shell"; type: "command.ack"; commandId: string; ok: boolean; error?: string }
  | { channel: "electron_shell"; type: "thread_window.closed"; timestamp: string }
  | { channel: "electron_shell"; type: "renderer.crashed"; window: "thread" | "activity"; reason: string }
  | { channel: "electron_shell"; type: "agent_server.health"; available: boolean; message?: string };

export function parseCommand(raw: string): SwiftToElectronCommand {
  const value = JSON.parse(raw) as unknown;
  if (!isSwiftToElectronCommand(value)) {
    throw new Error("unsupported electron shell command");
  }
  return value;
}

export function encodeEvent(event: ElectronToSwiftEvent): string {
  return JSON.stringify(event);
}

export function isSwiftToElectronCommand(value: unknown): value is SwiftToElectronCommand {
  if (!isRecord(value) || value.channel !== "electron_shell" || typeof value.commandId !== "string") {
    return false;
  }
  switch (value.type) {
    case "thread_window.open_initial_prompt":
      return isRecord(value.payload)
        && typeof value.payload.clientRequestId === "string"
        && typeof value.payload.text === "string"
        && Array.isArray(value.payload.attachments)
        && (value.payload.actionBinding === null || isActionBinding(value.payload.actionBinding));
    case "thread_window.open_history":
    case "activity_window.show":
    case "shutdown":
      return true;
    case "thread_window.focus":
      return value.threadId === undefined || value.threadId === null || typeof value.threadId === "string";
    default:
      return false;
  }
}

function isActionBinding(value: unknown): value is { pluginId: string; promptName: string } {
  return isRecord(value)
    && typeof value.pluginId === "string"
    && typeof value.promptName === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
```

- [ ] **Step 4: 写 Swift 协议失败测试**

创建 `apps/desktop/TestsSwift/AppServices/ElectronShell/ElectronShellProtocolTests.swift`：

```swift
import XCTest
@testable import HandAgentDesktop

@MainActor
final class ElectronShellProtocolTests: XCTestCase {
    func testEncodesOpenInitialPromptCommand() throws {
        let payload = ElectronInitialPromptPayload(
            clientRequestId: "prompt-1",
            text: "hello",
            attachments: [],
            actionBinding: nil
        )
        let command = ElectronShellCommand.openInitialPrompt(commandId: "cmd-1", payload: payload)

        let data = try JSONEncoder().encode(command)
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])

        XCTAssertEqual(object["channel"] as? String, "electron_shell")
        XCTAssertEqual(object["type"] as? String, "thread_window.open_initial_prompt")
        XCTAssertEqual(object["commandId"] as? String, "cmd-1")
        XCTAssertEqual((object["payload"] as? [String: Any])?["text"] as? String, "hello")
    }

    func testDecodesAgentServerHealthEvent() throws {
        let data = """
        {"channel":"electron_shell","type":"agent_server.health","available":true}
        """.data(using: .utf8)!

        let event = try JSONDecoder().decode(ElectronShellEvent.self, from: data)

        guard case .agentServerHealth(let available, let message) = event else {
            return XCTFail("expected agent server health event")
        }
        XCTAssertTrue(available)
        XCTAssertNil(message)
    }
}
```

- [ ] **Step 5: 运行 Swift 失败测试**

运行：

```bash
bash ./scripts/swiftw test --filter ElectronShellProtocolTests
```

预期：FAIL，因为 Swift DTO 尚未存在。

- [ ] **Step 6: 实现 Swift DTO**

创建 `apps/desktop/Sources/AppServices/ElectronShell/ElectronShellProtocol.swift`：

```swift
import Foundation

struct ElectronInitialPromptPayload: Encodable, Equatable {
    let clientRequestId: String
    let text: String
    let attachments: [UserMessageAttachmentPayload]
    let actionBinding: ActionBindingPayload?
}

enum ElectronShellCommand: Encodable, Equatable {
    case openInitialPrompt(commandId: String, payload: ElectronInitialPromptPayload)
    case openHistory(commandId: String)
    case focus(commandId: String, threadId: String?)
    case showActivityWindow(commandId: String)
    case shutdown(commandId: String)

    private enum CodingKeys: String, CodingKey {
        case channel, type, commandId, payload, threadId
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode("electron_shell", forKey: .channel)
        switch self {
        case .openInitialPrompt(let commandId, let payload):
            try container.encode("thread_window.open_initial_prompt", forKey: .type)
            try container.encode(commandId, forKey: .commandId)
            try container.encode(payload, forKey: .payload)
        case .openHistory(let commandId):
            try container.encode("thread_window.open_history", forKey: .type)
            try container.encode(commandId, forKey: .commandId)
        case .focus(let commandId, let threadId):
            try container.encode("thread_window.focus", forKey: .type)
            try container.encode(commandId, forKey: .commandId)
            try container.encodeIfPresent(threadId, forKey: .threadId)
        case .showActivityWindow(let commandId):
            try container.encode("activity_window.show", forKey: .type)
            try container.encode(commandId, forKey: .commandId)
        case .shutdown(let commandId):
            try container.encode("shutdown", forKey: .type)
            try container.encode(commandId, forKey: .commandId)
        }
    }
}

enum ElectronShellEvent: Decodable, Equatable {
    case electronReady(timestamp: String)
    case threadWindowPrepared(timestamp: String)
    case commandAck(commandId: String, ok: Bool, error: String?)
    case threadWindowClosed(timestamp: String)
    case rendererCrashed(window: String, reason: String)
    case agentServerHealth(available: Bool, message: String?)

    private enum CodingKeys: String, CodingKey {
        case channel, type, timestamp, commandId, ok, error, window, reason, available, message
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let channel = try container.decode(String.self, forKey: .channel)
        guard channel == "electron_shell" else {
            throw DecodingError.dataCorruptedError(forKey: .channel, in: container, debugDescription: "unsupported channel")
        }
        switch try container.decode(String.self, forKey: .type) {
        case "electron.ready":
            self = .electronReady(timestamp: try container.decode(String.self, forKey: .timestamp))
        case "thread_window.prepared":
            self = .threadWindowPrepared(timestamp: try container.decode(String.self, forKey: .timestamp))
        case "command.ack":
            self = .commandAck(
                commandId: try container.decode(String.self, forKey: .commandId),
                ok: try container.decode(Bool.self, forKey: .ok),
                error: try container.decodeIfPresent(String.self, forKey: .error)
            )
        case "thread_window.closed":
            self = .threadWindowClosed(timestamp: try container.decode(String.self, forKey: .timestamp))
        case "renderer.crashed":
            self = .rendererCrashed(
                window: try container.decode(String.self, forKey: .window),
                reason: try container.decode(String.self, forKey: .reason)
            )
        case "agent_server.health":
            self = .agentServerHealth(
                available: try container.decode(Bool.self, forKey: .available),
                message: try container.decodeIfPresent(String.self, forKey: .message)
            )
        default:
            throw DecodingError.dataCorruptedError(forKey: .type, in: container, debugDescription: "unsupported event")
        }
    }
}
```

- [ ] **Step 7: 验证并提交**

运行：

```bash
pnpm --filter handagent-electron-shell test tests/protocol/electronShellProtocol.test.ts
bash ./scripts/swiftw test --filter ElectronShellProtocolTests
```

预期：两条命令 PASS。

提交：

```bash
git add apps/electron-shell/src/main/protocol apps/electron-shell/tests/protocol apps/desktop/Sources/AppServices/ElectronShell apps/desktop/TestsSwift/AppServices/ElectronShell
git commit -m "feat: define electron shell bridge protocol"
```

### Task 3: 实现 Electron main 的 JSON line stdio bridge

**Files:**
- Create: `apps/electron-shell/src/main/swiftBridge/jsonLineBridge.ts`
- Create: `apps/electron-shell/tests/swiftBridge/jsonLineBridge.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `apps/electron-shell/tests/swiftBridge/jsonLineBridge.test.ts`：

```typescript
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { JsonLineBridge } from "../../src/main/swiftBridge/jsonLineBridge.js";

describe("JsonLineBridge", () => {
  it("parses newline-delimited commands split across chunks", () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const received: string[] = [];
    const bridge = new JsonLineBridge({ input, output });
    bridge.onLine((line) => received.push(line));

    input.write("{\"a\"");
    input.write(":1}\n{\"b\":2}\n");

    expect(received).toEqual(["{\"a\":1}", "{\"b\":2}"]);
  });

  it("writes one JSON line per event", () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const written: string[] = [];
    output.on("data", (chunk) => written.push(chunk.toString("utf8")));
    const bridge = new JsonLineBridge({ input, output });

    bridge.send({ channel: "electron_shell", type: "electron.ready", timestamp: "2026-06-08T00:00:00.000Z" });

    expect(written.join("")).toBe("{\"channel\":\"electron_shell\",\"type\":\"electron.ready\",\"timestamp\":\"2026-06-08T00:00:00.000Z\"}\n");
  });
});
```

- [ ] **Step 2: 运行失败测试**

运行：

```bash
pnpm --filter handagent-electron-shell test tests/swiftBridge/jsonLineBridge.test.ts
```

预期：FAIL，因为 `jsonLineBridge.ts` 尚未存在。

- [ ] **Step 3: 实现 JSON line bridge**

创建 `apps/electron-shell/src/main/swiftBridge/jsonLineBridge.ts`：

```typescript
import type { Readable, Writable } from "node:stream";

export class JsonLineBridge {
  private buffer = "";
  private listeners = new Set<(line: string) => void>();

  constructor(private readonly streams: { input: Readable; output: Writable }) {
    streams.input.setEncoding("utf8");
    streams.input.on("data", (chunk: string) => this.receive(chunk));
  }

  onLine(listener: (line: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  send(value: unknown): void {
    this.streams.output.write(`${JSON.stringify(value)}\n`);
  }

  private receive(chunk: string): void {
    this.buffer += chunk;
    while (true) {
      const newlineIndex = this.buffer.indexOf("\n");
      if (newlineIndex === -1) { return; }
      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (!line) { continue; }
      for (const listener of this.listeners) {
        listener(line);
      }
    }
  }
}
```

- [ ] **Step 4: 验证并提交**

运行：

```bash
pnpm --filter handagent-electron-shell test tests/swiftBridge/jsonLineBridge.test.ts
pnpm --filter handagent-electron-shell build
```

预期：两条命令 PASS。

提交：

```bash
git add apps/electron-shell/src/main/swiftBridge apps/electron-shell/tests/swiftBridge
git commit -m "feat: add electron swift json bridge"
```

### Task 4: 实现 Electron agent-server supervisor 的 child process 版本

**Files:**
- Create: `apps/electron-shell/src/main/serverSupervisor/nodeAgentServerSupervisor.ts`
- Create: `apps/electron-shell/tests/serverSupervisor/nodeAgentServerSupervisor.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `apps/electron-shell/tests/serverSupervisor/nodeAgentServerSupervisor.test.ts`：

```typescript
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import {
  NodeAgentServerSupervisor,
  type AgentServerChildProcess,
} from "../../src/main/serverSupervisor/nodeAgentServerSupervisor.js";

describe("NodeAgentServerSupervisor", () => {
  it("spawns the current TypeScript agent-server entry once", () => {
    const spawned: Array<{ command: string; args: string[]; cwd: string }> = [];
    const process = new FakeChildProcess();
    const supervisor = new NodeAgentServerSupervisor({
      repoRoot: "/repo",
      nodePath: "/usr/bin/node",
      env: { HANDAGENT_LLM_MODE: "mock" },
      spawnProcess: (command, args, options) => {
        spawned.push({ command, args, cwd: options.cwd });
        return process;
      },
    });

    supervisor.start();
    supervisor.start();

    expect(spawned).toEqual([{
      command: "/usr/bin/node",
      args: [
        "--experimental-transform-types",
        "--experimental-specifier-resolution=node",
        "apps/agent-server/src/server/server.ts",
      ],
      cwd: "/repo",
    }]);
  });

  it("emits unavailable health on non-zero exit", () => {
    const process = new FakeChildProcess();
    const health: Array<{ available: boolean; message?: string }> = [];
    const supervisor = new NodeAgentServerSupervisor({
      repoRoot: "/repo",
      nodePath: "/usr/bin/node",
      env: {},
      spawnProcess: () => process,
      scheduleRestart: vi.fn(),
    });
    supervisor.onHealth((event) => health.push(event));

    supervisor.start();
    process.emit("exit", 9, null);

    expect(health.at(-1)).toEqual({ available: false, message: "agent-server exited with code 9" });
  });

  it("kills the child process on stop without scheduling restart", () => {
    const process = new FakeChildProcess();
    const scheduleRestart = vi.fn();
    const supervisor = new NodeAgentServerSupervisor({
      repoRoot: "/repo",
      nodePath: "/usr/bin/node",
      env: {},
      spawnProcess: () => process,
      scheduleRestart,
    });

    supervisor.start();
    supervisor.stop();
    process.emit("exit", 0, null);

    expect(process.killed).toBe(true);
    expect(scheduleRestart).not.toHaveBeenCalled();
  });
});

class FakeChildProcess extends EventEmitter implements AgentServerChildProcess {
  killed = false;
  stdout = new EventEmitter();
  stderr = new EventEmitter();

  kill(): void {
    this.killed = true;
  }
}
```

- [ ] **Step 2: 运行失败测试**

运行：

```bash
pnpm --filter handagent-electron-shell test tests/serverSupervisor/nodeAgentServerSupervisor.test.ts
```

预期：FAIL，因为 supervisor 尚未存在。

- [ ] **Step 3: 实现 child process supervisor**

创建 `apps/electron-shell/src/main/serverSupervisor/nodeAgentServerSupervisor.ts`：

```typescript
import { spawn, type ChildProcess } from "node:child_process";
import type { EventEmitter } from "node:events";

export type AgentServerHealthEvent = {
  available: boolean;
  message?: string;
};

export type AgentServerChildProcess = EventEmitter & {
  stdout?: EventEmitter | null;
  stderr?: EventEmitter | null;
  killed?: boolean;
  kill(signal?: NodeJS.Signals | number): void;
};

type SpawnOptions = {
  cwd: string;
  env: NodeJS.ProcessEnv;
};

type SupervisorOptions = {
  repoRoot: string;
  nodePath: string;
  env: NodeJS.ProcessEnv;
  spawnProcess?: (command: string, args: string[], options: SpawnOptions) => AgentServerChildProcess;
  scheduleRestart?: (callback: () => void, delayMs: number) => void;
  maxRestartAttempts?: number;
};

export class NodeAgentServerSupervisor {
  private child: AgentServerChildProcess | null = null;
  private userRequestedStop = false;
  private restartAttempts = 0;
  private listeners = new Set<(event: AgentServerHealthEvent) => void>();
  private readonly spawnProcess: (command: string, args: string[], options: SpawnOptions) => AgentServerChildProcess;
  private readonly scheduleRestart: (callback: () => void, delayMs: number) => void;
  private readonly maxRestartAttempts: number;

  constructor(private readonly options: SupervisorOptions) {
    this.spawnProcess = options.spawnProcess ?? ((command, args, spawnOptions) => spawn(command, args, spawnOptions) as ChildProcess);
    this.scheduleRestart = options.scheduleRestart ?? ((callback, delayMs) => setTimeout(callback, delayMs));
    this.maxRestartAttempts = options.maxRestartAttempts ?? 5;
  }

  onHealth(listener: (event: AgentServerHealthEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    if (this.child) { return; }
    this.userRequestedStop = false;
    const args = [
      "--experimental-transform-types",
      "--experimental-specifier-resolution=node",
      "apps/agent-server/src/server/server.ts",
    ];
    const child = this.spawnProcess(this.options.nodePath, args, {
      cwd: this.options.repoRoot,
      env: { ...process.env, ...this.options.env },
    });
    this.child = child;
    child.on("exit", (code: number | null, signal: NodeJS.Signals | null) => this.handleExit(code, signal));
    this.emitHealth({ available: true });
  }

  stop(): void {
    this.userRequestedStop = true;
    const child = this.child;
    this.child = null;
    child?.kill();
    this.emitHealth({ available: false, message: "agent-server stopped" });
  }

  private handleExit(code: number | null, signal: NodeJS.Signals | null): void {
    this.child = null;
    if (this.userRequestedStop || code === 0) { return; }
    const message = code === null
      ? `agent-server exited from signal ${signal ?? "unknown"}`
      : `agent-server exited with code ${code}`;
    this.emitHealth({ available: false, message });
    if (this.restartAttempts >= this.maxRestartAttempts) { return; }
    const delayMs = Math.min(30_000, 2 ** this.restartAttempts * 1_000);
    this.restartAttempts += 1;
    this.scheduleRestart(() => this.start(), delayMs);
  }

  private emitHealth(event: AgentServerHealthEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
```

- [ ] **Step 4: 验证并提交**

运行：

```bash
pnpm --filter handagent-electron-shell test tests/serverSupervisor/nodeAgentServerSupervisor.test.ts
pnpm --filter handagent-electron-shell build
```

预期：两条命令 PASS。

提交：

```bash
git add apps/electron-shell/src/main/serverSupervisor apps/electron-shell/tests/serverSupervisor
git commit -m "feat: supervise agent server from electron shell"
```

### Task 5: 实现隐藏 ThreadWindow prewarmer

**Files:**
- Create: `apps/electron-shell/src/main/windows/threadWindowPrewarmer.ts`
- Create: `apps/electron-shell/tests/windows/threadWindowPrewarmer.test.ts`
- Create: `apps/electron-shell/src/preload/threadWindowPreload.ts`

- [ ] **Step 1: 写失败测试**

创建 `apps/electron-shell/tests/windows/threadWindowPrewarmer.test.ts`：

```typescript
import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { ThreadWindowPrewarmer } from "../../src/main/windows/threadWindowPrewarmer.js";

describe("ThreadWindowPrewarmer", () => {
  it("creates a hidden browser window and waits for load", async () => {
    const window = new FakeBrowserWindow();
    const prewarmer = new ThreadWindowPrewarmer({
      threadWindowURL: "http://127.0.0.1:4317/thread-window/index.html",
      preloadPath: "/repo/apps/electron-shell/dist/preload/threadWindowPreload.js",
      createWindow: (options) => {
        expect(options.show).toBe(false);
        expect(options.webPreferences?.contextIsolation).toBe(true);
        expect(options.webPreferences?.nodeIntegration).toBe(false);
        return window;
      },
    });

    const prepared = prewarmer.prepare();
    window.webContents.emit("did-finish-load");
    await prepared;

    expect(window.loadedURL).toBe("http://127.0.0.1:4317/thread-window/index.html");
    expect(window.showCount).toBe(0);
    expect(window.focusCount).toBe(0);
  });

  it("delivers initial prompt before showing the prepared window", async () => {
    const window = new FakeBrowserWindow();
    const prewarmer = new ThreadWindowPrewarmer({
      threadWindowURL: "http://127.0.0.1:4317/thread-window/index.html",
      preloadPath: "/preload.js",
      createWindow: () => window,
    });
    const prepared = prewarmer.prepare();
    window.webContents.emit("did-finish-load");
    await prepared;

    await prewarmer.openInitialPrompt({
      clientRequestId: "prompt-1",
      text: "hello",
      attachments: [],
      actionBinding: null,
    });

    expect(window.executedJavaScript[0]).toContain("window.handAgentReceiveInitialPrompt");
    expect(window.showCount).toBe(1);
    expect(window.focusCount).toBe(1);
  });
});

class FakeBrowserWindow {
  webContents = new EventEmitter() as EventEmitter & {
    executeJavaScript: (source: string) => Promise<void>;
  };
  loadedURL: string | null = null;
  showCount = 0;
  focusCount = 0;
  executedJavaScript: string[] = [];

  constructor() {
    this.webContents.executeJavaScript = async (source: string) => {
      this.executedJavaScript.push(source);
    };
  }

  loadURL(url: string): void {
    this.loadedURL = url;
  }

  show(): void {
    this.showCount += 1;
  }

  focus(): void {
    this.focusCount += 1;
  }

  on(): void {}
}
```

- [ ] **Step 2: 运行失败测试**

运行：

```bash
pnpm --filter handagent-electron-shell test tests/windows/threadWindowPrewarmer.test.ts
```

预期：FAIL，因为 prewarmer 尚未存在。

- [ ] **Step 3: 实现 prewarmer**

创建 `apps/electron-shell/src/main/windows/threadWindowPrewarmer.ts`：

```typescript
import type { BrowserWindowConstructorOptions } from "electron";

type InitialPromptPayload = {
  clientRequestId: string;
  text: string;
  attachments: unknown[];
  actionBinding: { pluginId: string; promptName: string } | null;
};

type BrowserWindowLike = {
  webContents: {
    once(event: "did-finish-load", listener: () => void): unknown;
    executeJavaScript(source: string): Promise<unknown>;
  };
  loadURL(url: string): unknown;
  show(): void;
  focus(): void;
};

type Options = {
  threadWindowURL: string;
  preloadPath: string;
  createWindow: (options: BrowserWindowConstructorOptions) => BrowserWindowLike;
};

export class ThreadWindowPrewarmer {
  private window: BrowserWindowLike | null = null;
  private prepared = false;

  constructor(private readonly options: Options) {}

  async prepare(): Promise<void> {
    if (this.prepared) { return; }
    if (!this.window) {
      this.window = this.options.createWindow({
        width: 920,
        height: 640,
        show: false,
        webPreferences: {
          preload: this.options.preloadPath,
          contextIsolation: true,
          nodeIntegration: false,
        },
      });
    }
    await new Promise<void>((resolve) => {
      this.window?.webContents.once("did-finish-load", resolve);
      this.window?.loadURL(this.options.threadWindowURL);
    });
    this.prepared = true;
  }

  async openInitialPrompt(payload: InitialPromptPayload): Promise<void> {
    if (!this.window || !this.prepared) {
      throw new Error("thread window is not prepared");
    }
    const serialized = JSON.stringify(payload).replace(/</g, "\\u003c");
    await this.window.webContents.executeJavaScript(`window.handAgentReceiveInitialPrompt(${serialized});`);
    this.window.show();
    this.window.focus();
  }
}
```

创建 `apps/electron-shell/src/preload/threadWindowPreload.ts`：

```typescript
import { contextBridge } from "electron";

declare global {
  interface Window {
    handAgentThreadWindowConfig?: { threadWebSocketURL?: string };
    handAgentPendingInitialPrompts?: unknown[];
    handAgentReceiveInitialPrompt?: (payload: unknown) => void;
  }
}

window.handAgentThreadWindowConfig = {
  threadWebSocketURL: "ws://127.0.0.1:4317/api/thread",
};
window.handAgentPendingInitialPrompts = Array.isArray(window.handAgentPendingInitialPrompts)
  ? window.handAgentPendingInitialPrompts
  : [];
window.handAgentReceiveInitialPrompt = typeof window.handAgentReceiveInitialPrompt === "function"
  ? window.handAgentReceiveInitialPrompt
  : (payload: unknown) => {
      window.handAgentPendingInitialPrompts?.push(payload);
    };

contextBridge.exposeInMainWorld("handAgentElectron", {
  phase: "phase-0",
});
```

- [ ] **Step 4: 验证并提交**

运行：

```bash
pnpm --filter handagent-electron-shell test tests/windows/threadWindowPrewarmer.test.ts
pnpm --filter handagent-electron-shell build
```

预期：两条命令 PASS。

提交：

```bash
git add apps/electron-shell/src/main/windows apps/electron-shell/src/preload apps/electron-shell/tests/windows
git commit -m "feat: prewarm hidden electron thread window"
```

### Task 6: 组合 Electron main 入口

**Files:**
- Create: `apps/electron-shell/src/main/main.ts`

- [ ] **Step 1: 写入口实现**

创建 `apps/electron-shell/src/main/main.ts`：

```typescript
import { BrowserWindow, app } from "electron";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { JsonLineBridge } from "./swiftBridge/jsonLineBridge.js";
import { parseCommand, type ElectronToSwiftEvent } from "./protocol/electronShellProtocol.js";
import { NodeAgentServerSupervisor } from "./serverSupervisor/nodeAgentServerSupervisor.js";
import { ThreadWindowPrewarmer } from "./windows/threadWindowPrewarmer.js";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.HANDAGENT_REPO_ROOT ?? resolve(currentDir, "../../../..");
const nodePath = process.env.HANDAGENT_NODE_PATH ?? "node";
const threadWindowURL = process.env.HANDAGENT_THREAD_WINDOW_WEB_URL ?? "http://127.0.0.1:4317/thread-window/index.html";

const bridge = new JsonLineBridge({ input: process.stdin, output: process.stdout });
const supervisor = new NodeAgentServerSupervisor({
  repoRoot,
  nodePath,
  env: process.env.HANDAGENT_LLM_MODE ? { HANDAGENT_LLM_MODE: process.env.HANDAGENT_LLM_MODE } : {},
});
const prewarmer = new ThreadWindowPrewarmer({
  threadWindowURL,
  preloadPath: join(currentDir, "../preload/threadWindowPreload.js"),
  createWindow: (options) => new BrowserWindow(options),
});

function send(event: ElectronToSwiftEvent): void {
  bridge.send(event);
}

function now(): string {
  return new Date().toISOString();
}

supervisor.onHealth((event) => {
  send({
    channel: "electron_shell",
    type: "agent_server.health",
    available: event.available,
    ...(event.message ? { message: event.message } : {}),
  });
});

bridge.onLine(async (line) => {
  try {
    const command = parseCommand(line);
    if (command.type === "shutdown") {
      supervisor.stop();
      send({ channel: "electron_shell", type: "command.ack", commandId: command.commandId, ok: true });
      app.quit();
      return;
    }
    if (command.type === "thread_window.open_initial_prompt") {
      await prewarmer.openInitialPrompt(command.payload);
      send({ channel: "electron_shell", type: "command.ack", commandId: command.commandId, ok: true });
      return;
    }
    send({ channel: "electron_shell", type: "command.ack", commandId: command.commandId, ok: false, error: "command is not active in phase 0" });
  } catch (error) {
    send({ channel: "electron_shell", type: "renderer.crashed", window: "thread", reason: error instanceof Error ? error.message : "unknown error" });
  }
});

await app.whenReady();
send({ channel: "electron_shell", type: "electron.ready", timestamp: now() });
supervisor.start();
await prewarmer.prepare();
send({ channel: "electron_shell", type: "thread_window.prepared", timestamp: now() });
```

- [ ] **Step 2: 验证入口构建**

运行：

```bash
pnpm --filter handagent-electron-shell build
```

预期：PASS，生成 `apps/electron-shell/dist/main/main.js` 与 `apps/electron-shell/dist/preload/threadWindowPreload.js`。

- [ ] **Step 3: 提交入口**

运行：

```bash
git add apps/electron-shell/src/main/main.ts
git commit -m "feat: wire electron shell main lifecycle"
```

### Task 7: 实现 Swift 侧 Electron process 和 health gate

**Files:**
- Create: `apps/desktop/Sources/AppServices/ElectronShell/ElectronShellProcess.swift`
- Create: `apps/desktop/Sources/AppServices/ElectronShell/ElectronBackedAppServer.swift`
- Create: `apps/desktop/TestsSwift/AppServices/ElectronShell/ElectronShellProcessTests.swift`
- Create: `apps/desktop/TestsSwift/AppServices/ElectronShell/ElectronBackedAppServerTests.swift`

- [ ] **Step 1: 写 Swift health gate 失败测试**

创建 `apps/desktop/TestsSwift/AppServices/ElectronShell/ElectronBackedAppServerTests.swift`：

```swift
import XCTest
@testable import HandAgentDesktop

@MainActor
final class ElectronBackedAppServerTests: XCTestCase {
    func testAvailableOnlyAfterServerHealthAndThreadPrepared() {
        let shell = RecordingElectronShellProcess()
        let appServer = ElectronBackedAppServer(shell: shell, platformClient: nil)
        var availability: [Bool] = []
        appServer.onAvailabilityChange = { availability.append($0) }

        appServer.start()
        shell.emit(.electronReady(timestamp: "2026-06-08T00:00:00.000Z"))
        shell.emit(.agentServerHealth(available: true, message: nil))

        XCTAssertFalse(appServer.isAvailable)

        shell.emit(.threadWindowPrepared(timestamp: "2026-06-08T00:00:01.000Z"))

        XCTAssertTrue(appServer.isAvailable)
        XCTAssertEqual(availability, [true])
    }

    func testUnavailableWhenAgentServerReportsFailure() {
        let shell = RecordingElectronShellProcess()
        let appServer = ElectronBackedAppServer(shell: shell, platformClient: nil)
        var availability: [Bool] = []
        appServer.onAvailabilityChange = { availability.append($0) }

        appServer.start()
        shell.emit(.threadWindowPrepared(timestamp: "2026-06-08T00:00:00.000Z"))
        shell.emit(.agentServerHealth(available: false, message: "port 4317 unavailable"))

        XCTAssertFalse(appServer.isAvailable)
        XCTAssertEqual(appServer.startupErrorMessage, "port 4317 unavailable")
        XCTAssertEqual(availability, [false])
    }

    func testStopSendsShutdownAndStopsShell() {
        let shell = RecordingElectronShellProcess()
        let appServer = ElectronBackedAppServer(shell: shell, platformClient: nil)

        appServer.start()
        appServer.stop()

        XCTAssertEqual(shell.sentCommands.count, 1)
        guard case .shutdown = shell.sentCommands[0] else {
            return XCTFail("expected shutdown command")
        }
        XCTAssertEqual(shell.stopCount, 1)
    }
}

@MainActor
private final class RecordingElectronShellProcess: ElectronShellProcessing {
    var onEvent: ((ElectronShellEvent) -> Void)?
    private(set) var startCount = 0
    private(set) var stopCount = 0
    private(set) var sentCommands: [ElectronShellCommand] = []

    func start() throws {
        startCount += 1
    }

    func send(_ command: ElectronShellCommand) throws {
        sentCommands.append(command)
    }

    func stop() {
        stopCount += 1
    }

    func emit(_ event: ElectronShellEvent) {
        onEvent?(event)
    }
}
```

创建 `apps/desktop/TestsSwift/AppServices/ElectronShell/ElectronShellProcessTests.swift`：

```swift
import XCTest
@testable import HandAgentDesktop

@MainActor
final class ElectronShellProcessTests: XCTestCase {
    func testDecodesSplitElectronOutputLines() throws {
        let decoder = ElectronShellOutputDecoder()
        var events: [ElectronShellEvent] = []
        decoder.onEvent = { events.append($0) }

        decoder.receive(#"{"channel":"electron_shell","type":"electron.ready""#.data(using: .utf8)!)
        decoder.receive(#","timestamp":"2026-06-08T00:00:00.000Z"}"#.data(using: .utf8)!)
        XCTAssertEqual(events, [])

        decoder.receive("\n".data(using: .utf8)!)
        XCTAssertEqual(events, [.electronReady(timestamp: "2026-06-08T00:00:00.000Z")])
    }
}
```

- [ ] **Step 2: 运行失败测试**

运行：

```bash
bash ./scripts/swiftw test --filter ElectronBackedAppServerTests
```

预期：FAIL，因为 process 和 app server 类尚未存在。

- [ ] **Step 3: 实现 ElectronShellProcess**

创建 `apps/desktop/Sources/AppServices/ElectronShell/ElectronShellProcess.swift`：

```swift
import Foundation

@MainActor
protocol ElectronShellProcessing: AnyObject {
    var onEvent: ((ElectronShellEvent) -> Void)? { get set }
    func start() throws
    func send(_ command: ElectronShellCommand) throws
    func stop()
}

@MainActor
final class ElectronShellProcess: ElectronShellProcessing {
    var onEvent: ((ElectronShellEvent) -> Void)?

    private let launchPath: String
    private let arguments: [String]
    private let environment: [String: String]
    private let encoder = JSONEncoder()
    private let outputDecoder = ElectronShellOutputDecoder()
    private var process: Process?
    private var stdinPipe: Pipe?
    private var stdoutPipe: Pipe?

    init(
        launchPath: String,
        arguments: [String],
        environment: [String: String]
    ) {
        self.launchPath = launchPath
        self.arguments = arguments
        self.environment = environment
    }

    func start() throws {
        guard process == nil else { return }
        let process = Process()
        let input = Pipe()
        let output = Pipe()
        process.executableURL = URL(fileURLWithPath: launchPath)
        process.arguments = arguments
        process.environment = environment
        process.standardInput = input
        process.standardOutput = output
        output.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty else { return }
            Task { @MainActor in self?.handleOutput(data) }
        }
        try process.run()
        self.process = process
        self.stdinPipe = input
        self.stdoutPipe = output
    }

    func send(_ command: ElectronShellCommand) throws {
        guard let input = stdinPipe else { return }
        var data = try encoder.encode(command)
        data.append(0x0A)
        input.fileHandleForWriting.write(data)
    }

    func stop() {
        stdoutPipe?.fileHandleForReading.readabilityHandler = nil
        process?.terminate()
        process = nil
        stdinPipe = nil
        stdoutPipe = nil
    }

    private func handleOutput(_ data: Data) {
        outputDecoder.onEvent = onEvent
        outputDecoder.receive(data)
    }
}

@MainActor
final class ElectronShellOutputDecoder {
    var onEvent: ((ElectronShellEvent) -> Void)?
    private let decoder = JSONDecoder()
    private var buffer = ""

    func receive(_ data: Data) {
        guard let chunk = String(data: data, encoding: .utf8) else { return }
        buffer += chunk
        while let newlineIndex = buffer.firstIndex(of: "\n") {
            let line = String(buffer[..<newlineIndex]).trimmingCharacters(in: .whitespacesAndNewlines)
            buffer = String(buffer[buffer.index(after: newlineIndex)...])
            if
                !line.isEmpty,
                let lineData = line.data(using: .utf8),
                let event = try? decoder.decode(ElectronShellEvent.self, from: lineData)
            {
                onEvent?(event)
            }
        }
    }
}
```

- [ ] **Step 4: 实现 ElectronBackedAppServer**

创建 `apps/desktop/Sources/AppServices/ElectronShell/ElectronBackedAppServer.swift`：

```swift
import Foundation

@MainActor
final class ElectronBackedAppServer: AppServerManaging {
    private let shell: any ElectronShellProcessing
    private let platformClient: PlatformBridgeConnectionClient?
    private var hasServerHealth = false
    private var hasPreparedThreadWindow = false
    private(set) var startupErrorMessage: String?

    var onAvailabilityChange: ((Bool) -> Void)?
    var onFatalError: ((String) -> Void)?

    var isAvailable: Bool {
        hasServerHealth && hasPreparedThreadWindow && startupErrorMessage == nil
    }

    init(
        shell: any ElectronShellProcessing,
        platformClient: PlatformBridgeConnectionClient?
    ) {
        self.shell = shell
        self.platformClient = platformClient
    }

    func start() {
        shell.onEvent = { [weak self] event in self?.handle(event) }
        do {
            try shell.start()
        } catch {
            startupErrorMessage = error.localizedDescription
            onAvailabilityChange?(false)
        }
    }

    func stop() {
        try? shell.send(.shutdown(commandId: UUID().uuidString))
        platformClient?.disconnect()
        shell.stop()
        hasServerHealth = false
        hasPreparedThreadWindow = false
    }

    private func handle(_ event: ElectronShellEvent) {
        switch event {
        case .agentServerHealth(let available, let message):
            hasServerHealth = available
            startupErrorMessage = available ? nil : (message ?? "Electron agent-server 不可用")
            if available {
                platformClient?.connect()
            }
            publishAvailability()
        case .threadWindowPrepared:
            hasPreparedThreadWindow = true
            publishAvailability()
        case .rendererCrashed(_, let reason):
            startupErrorMessage = reason
            onFatalError?(reason)
            publishAvailability()
        case .electronReady, .commandAck, .threadWindowClosed:
            break
        }
    }

    private func publishAvailability() {
        onAvailabilityChange?(isAvailable)
    }
}
```

- [ ] **Step 5: 验证并提交**

运行：

```bash
bash ./scripts/swiftw test --filter ElectronBackedAppServerTests
bash ./scripts/swiftw build
```

预期：两条命令 PASS。

提交：

```bash
git add apps/desktop/Sources/AppServices/ElectronShell apps/desktop/TestsSwift/AppServices/ElectronShell
git commit -m "feat: add swift electron shell runtime bridge"
```

### Task 8: 用 feature flag 接入 Swift AppServices

**Files:**
- Modify: `apps/desktop/Sources/AppServices/AppServices.swift`
- Modify: `apps/desktop/TestsSwift/AppServices/AppServicesTests.swift`

- [ ] **Step 1: 写 feature flag 失败测试**

在 `apps/desktop/TestsSwift/AppServices/AppServicesTests.swift` 追加：

```swift
@MainActor
func testElectronShellFlagSelectsElectronBackedAppServer() throws {
    let appServer = AppServices.defaultAppServer(
        environment: ["HANDAGENT_ELECTRON_SHELL": "1"],
        platformServerURL: URL(string: "ws://127.0.0.1:4317/api/platform")!
    )

    XCTAssertTrue(appServer is ElectronBackedAppServer)
}
```

- [ ] **Step 2: 运行失败测试**

运行：

```bash
bash ./scripts/swiftw test --filter AppServicesTests
```

预期：FAIL，因为 `defaultAppServer` 尚未存在。

- [ ] **Step 3: 修改 AppServices 默认 app server 选择**

在 `apps/desktop/Sources/AppServices/AppServices.swift` 中给 `AppServices` 添加静态方法：

```swift
static func defaultAppServer(
    environment: [String: String] = ProcessInfo.processInfo.environment,
    platformServerURL: URL
) -> any AppServerManaging {
    if environment["HANDAGENT_ELECTRON_SHELL"] == "1" {
        let electronBinary = environment["HANDAGENT_ELECTRON_BINARY"] ?? "/usr/bin/env"
        let electronMain = environment["HANDAGENT_ELECTRON_MAIN"] ?? "apps/electron-shell/dist/main/main.js"
        let shell = ElectronShellProcess(
            launchPath: electronBinary,
            arguments: electronBinary == "/usr/bin/env" ? ["electron", electronMain] : [electronMain],
            environment: environment
        )
        return ElectronBackedAppServer(
            shell: shell,
            platformClient: PlatformBridgeConnectionClient(
                connection: AppServerConnection(serverURL: platformServerURL),
                platformBridge: PlatformBridgeService()
            )
        )
    }

    return AppServer(
        agentServer: AgentServerService(),
        platformClient: PlatformBridgeConnectionClient(
            connection: AppServerConnection(serverURL: platformServerURL),
            platformBridge: PlatformBridgeService()
        )
    )
}
```

把 `init` 中原本的 `self.appServer = appServer ?? AppServer(...)` 替换为：

```swift
self.appServer = appServer ?? AppServices.defaultAppServer(platformServerURL: platformServerURL)
```

- [ ] **Step 4: 验证并提交**

运行：

```bash
bash ./scripts/swiftw test --filter AppServicesTests
bash ./scripts/swiftw build
```

预期：两条命令 PASS。

提交：

```bash
git add apps/desktop/Sources/AppServices/AppServices.swift apps/desktop/TestsSwift/AppServices/AppServicesTests.swift
git commit -m "feat: gate electron shell runtime behind env flag"
```

### Task 9: 将 Electron shell 纳入仓库验证

**Files:**
- Modify: `scripts/test.sh`

- [ ] **Step 1: 修改验证脚本**

在 `scripts/test.sh` 的 `pnpm exec vitest run` 调用前加入：

```bash
pnpm --filter handagent-electron-shell test
```

- [ ] **Step 2: 运行仓库验证**

运行：

```bash
bash ./scripts/test.sh
bash ./scripts/swiftw test
bash ./scripts/swiftw build
pnpm --filter handagent-electron-shell build
```

预期：四条命令 PASS。

- [ ] **Step 3: 提交脚本更新**

运行：

```bash
git add scripts/test.sh
git commit -m "test: include electron shell tests"
```

### Task 10: 更新架构文档与手工 QA

**Files:**
- Modify: `handAgent.md`
- Modify: `apps/apps.md`
- Modify: `apps/desktop/desktop.md`
- Modify: `apps/desktop/Sources/AppServices/app-services.md`
- Create: `apps/desktop/Sources/AppServices/ElectronShell/electron-shell.md`
- Modify: `apps/desktop/Sources/AppServices/AgentServer/agent-server.md`
- Modify: `docs/manual-qa.md`

- [ ] **Step 1: 更新目录索引**

在 `apps/apps.md` 当前应用列表中新增：

```markdown
- [electron-shell/electron-shell.md](/Users/mu9/proj/handAgent/apps/electron-shell/electron-shell.md) —— Phase 0 Electron UI shell，feature flag 路径下监督 agent-server 并预热隐藏 ThreadWindow。
```

在 `apps/desktop/Sources/AppServices/app-services.md` 的子模块表中新增：

```markdown
| `ElectronShell/` | [ElectronShell](ElectronShell/electron-shell.md) | feature flag 路径下的 Swift 到 Electron 进程桥、event 解码和 app-server 可用性门控 |
```

- [ ] **Step 2: 创建 Swift ElectronShell 模块文档**

创建 `apps/desktop/Sources/AppServices/ElectronShell/electron-shell.md`：

```markdown
# ElectronShell 模块

`ElectronShell` 是 Phase 0 的可选运行时桥。只有 `HANDAGENT_ELECTRON_SHELL=1` 时，`AppServices.defaultAppServer` 才会使用 `ElectronBackedAppServer`。

## 职责

- 启动 Electron 子进程。
- 通过 stdio newline-delimited JSON 发送 `ElectronShellCommand`，接收 `ElectronShellEvent`。
- 在 `agent_server.health available=true` 与 `thread_window.prepared` 同时成立后，向 `AgentServerHealth` 暴露可提交状态。
- 在 Electron feature flag 路径下连接 `/api/platform`，继续由 Swift `PlatformBridgeService` 执行 macOS 原生能力。

## 边界

- 不持有 ThreadWindow tabs/messages/history 状态。
- 不解析 `/api/thread` 的 `ThreadNotification`。
- 不执行 ScreenCaptureKit、Accessibility、NSWorkspace、NSPasteboard 以外的新平台能力迁移。
- 不替换默认 `AppServer` 路径；默认路径仍由 Swift 直接启动 agent-server。
```

- [ ] **Step 3: 更新仓库总览**

在 `handAgent.md` 的分层架构段落后追加 Phase 0 说明：

```markdown
Phase 0 Electron UI shell 只在 `HANDAGENT_ELECTRON_SHELL=1` 时启用。该路径由 Swift 启动 Electron，Electron 监督 agent-server 并预热隐藏 ThreadWindow；默认路径仍保持 Swift `AppServer` 启动 agent-server、Swift `WKWebView` 承载 ThreadWindow。平台能力仍只通过 Swift `/api/platform` 执行。
```

- [ ] **Step 4: 更新 desktop 与 AgentServer 文档**

在 `apps/desktop/desktop.md` 的入口与启动流程后追加：

```markdown
当 `HANDAGENT_ELECTRON_SHELL=1` 时，`AppServices.defaultAppServer` 改用 `ElectronBackedAppServer`。此路径下 Swift 不直接启动 `AgentServerService`，而是启动 Electron shell；Electron shell 再作为唯一 supervisor 启动 agent-server，并在隐藏 ThreadWindow 预热完成后向 Swift 回报 `thread_window.prepared`。PromptPanel 的可提交状态仍由 `AgentServerHealth` 控制。
```

在 `apps/desktop/Sources/AppServices/AgentServer/agent-server.md` 的职责段落后追加：

```markdown
Phase 0 引入 Electron feature flag 后，默认路径仍使用本模块的 `AppServer + AgentServerService`。当 `HANDAGENT_ELECTRON_SHELL=1` 时，agent-server 进程由 `ElectronBackedAppServer` 间接交给 Electron shell 监督，本模块仍保留 `/api/platform` 的连接能力与默认路径。
```

- [ ] **Step 5: 更新手工 QA**

在 `docs/manual-qa.md` 增加一节：

```markdown
## Electron UI Shell Phase 0

- 默认不设置 `HANDAGENT_ELECTRON_SHELL`，运行 `bash ./scripts/swiftw run HandAgentDesktop`，确认 PromptPanel 提交仍打开 WKWebView ThreadWindow。
- 先运行 `pnpm --filter handagent-electron-shell build`。
- 设置 `HANDAGENT_ELECTRON_SHELL=1`、`HANDAGENT_ELECTRON_BINARY=/usr/bin/env`、`HANDAGENT_ELECTRON_MAIN=apps/electron-shell/dist/main/main.js` 后运行桌面 App。
- 启动后确认 Electron shell 和 agent-server 只有各一份进程，且 `127.0.0.1:4317` 没有第二份 server 冲突。
- 启动完成前 PromptPanel 不允许提交；收到 Electron `agent_server.health` 与 `thread_window.prepared` 后 PromptPanel 恢复可提交。
- 提交 prompt 后默认路径仍打开 WKWebView ThreadWindow；这说明 Phase 0 未提前切换真实 ThreadWindow。
- 退出 HandAgent 后确认 Electron 和 Node agent-server 进程不残留。
```

- [ ] **Step 6: 文档验证并提交**

运行：

```bash
rg "TB[D]|TO[D]O|FIXM[E]|implement[ ]later|fill[ ]in[ ]details" handAgent.md apps docs/manual-qa.md
git diff --check
```

预期：`rg` 不输出本次新增占位内容，`git diff --check` PASS。

提交：

```bash
git add handAgent.md apps/apps.md apps/desktop/desktop.md apps/desktop/Sources/AppServices/app-services.md apps/desktop/Sources/AppServices/ElectronShell/electron-shell.md apps/desktop/Sources/AppServices/AgentServer/agent-server.md docs/manual-qa.md
git commit -m "docs: document electron shell phase 0"
```

## Final Verification

完成所有任务后运行：

```bash
bash ./scripts/test.sh
bash ./scripts/swiftw test
bash ./scripts/swiftw build
pnpm --filter handagent-electron-shell build
git diff --check
```

预期：

- TypeScript/Vitest 全部 PASS。
- Swift test/build 全部 PASS。
- Electron shell TypeScript 构建 PASS。
- `git diff --check` PASS。
- `git log --oneline --max-count=10` 能看到每个任务的阶段性提交。

## Execution Notes

- 本计划必须在独立 worktree 执行，例如 `.worktrees/electron-ui-shell-phase-0`。
- 执行前先跑基线：`pnpm install`、`bash ./scripts/test.sh`、`bash ./scripts/swiftw build`。
- 若 `electron` 依赖安装失败，先修复 package/workspace 初始化，不改 Swift 代码。
- 若 feature flag 路径启动后出现 4317 端口冲突，说明 Swift 默认 `AgentServerService` 与 Electron supervisor 同时启动；修复 `AppServices.defaultAppServer` 选择逻辑后再继续。
- 若隐藏窗口预热导致 App 激活，检查 `ThreadWindowPrewarmer` 是否在 `prepare()` 中调用了 `show()`、`focus()` 或 `BrowserWindow.showInactive()`。

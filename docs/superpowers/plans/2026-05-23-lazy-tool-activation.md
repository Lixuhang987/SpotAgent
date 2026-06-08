# 懒加载工具激活（Lazy Tool Activation）实施计划

> **当前注意：** 本文是历史实施计划。当前懒加载工具激活仍有真实 provider 收尾 bug，尤其不要把“激活后继续暴露 `use_tools`”当作不可改变约束；修复依据见 [docs/bugs.md](/Users/mu9/proj/handAgent/docs/bugs.md)。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 HandAgent 的 session 在用户进入纯聊天时不再为 builtin/MCP tool definitions 付费，模型判断需要工具时通过调用 meta-tool `use_tools` 激活完整工具集，且整个 session 内激活状态持久。

**Architecture:** 在 `packages/core` 引入 meta-tool `use_tools`；`AgentRuntime` 识别其调用并触发激活回调；`SessionScopedToolRegistry` 按 sessionId 维护激活集合，未激活时 registry 只暴露 meta-tool，激活后扩展为 `[meta, ...builtin, ...mcp]`。`SessionRuntimeOrchestrator` 处理 plugin-binding 快路径与 agent-server 重启后的激活恢复。

**Tech Stack:** TypeScript（Node 22 + experimental-transform-types），vitest，`@handagent/core` workspace 包，`zod` schema。

**Spec 索引：** `docs/superpowers/specs/2026-05-23-lazy-tool-activation-design.md`

---

## File Structure

| 路径 | 责任 | 操作 |
|------|------|------|
| `packages/core/src/tools/MetaToolUseTool.ts` | 定义 `use_tools` meta-tool 与 `META_TOOL_NAME` 常量 | Create |
| `packages/core/src/tools/index.ts`（如存在）| 导出 meta-tool（若没有 index 则跳过）| Conditional |
| `packages/core/src/runtime/SystemPrompt.ts` | tool-use-policy section 改为忽略 meta-tool | Modify |
| `packages/core/src/runtime/AgentRuntime.ts` | 在 `handleToolCall` 加 meta-tool 分支 + 注入 `onMetaToolActivate` / `isSessionActivated` | Modify |
| `apps/agent-server/src/SessionScopedToolRegistry.ts` | 增加 `Set<sessionId>` 激活集合、`activate / isActivated / forgetSession` 方法、`refreshForSession` 双模式 | Modify |
| `apps/agent-server/src/SessionRuntimeOrchestrator.ts` | `beforeRun` 之外补一个激活恢复钩子（plugin-binding + 历史推断）| Modify |
| `apps/agent-server/src/SessionRouter.ts` | 删除会话路径调用 `forgetSession` | Modify |
| `apps/agent-server/src/server.ts` | 构造 `AgentRuntime` 时注入新回调；构造 orchestrator 时把 plugin-binding / 历史推断接进 beforeRun 闭包 | Modify |
| `packages/core/tests/tools/meta-tool-use.test.ts` | meta-tool schema / call 单测 | Create |
| `packages/core/tests/runtime/system-prompt.test.ts` | 增 case：仅 meta-tool 时 tool-use-policy 返回 null | Modify |
| `packages/core/tests/runtime/agent-runtime.test.ts` | 增 case：meta-tool 调用触发激活回调；二次调用走幂等路径 | Modify |
| `apps/agent-server/tests/session/SessionScopedToolRegistry.test.ts` | 全新测试文件覆盖 4 个核心场景 | Create |
| `apps/agent-server/tests/session/SessionRuntimeOrchestrator.test.ts` | 增 case：plugin-binding session 直接激活；从历史恢复激活状态 | Modify |
| `apps/agent-server/tests/session/SessionRouter.test.ts` | 增 case：删除 session 调用 forgetSession | Modify |
| 文档：`packages/core/src/tools/tools.md`、`packages/core/src/runtime/runtime.md`、`apps/agent-server/agent-server.md`、`docs/manual-qa.md` | 同步描述 | Modify |

---

## Task 1: 基线验证（确认 worktree 可用）

**Files:** 无修改

- [ ] **Step 1: 安装依赖**

```bash
cd /Users/mu9/proj/handAgent/.worktrees/lazy-tool-activation
pnpm install
```

Expected: `Done in N`，无错误。

- [ ] **Step 2: TypeScript 测试基线**

```bash
bash ./scripts/test.sh
```

Expected: 全绿。若有失败先停下来报告，不进入 Task 2。

- [ ] **Step 3: Swift 构建基线（仅确认链路打包）**

```bash
bash ./scripts/swiftw build
```

Expected: 构建成功。失败也先报告。

---

## Task 2: 定义 meta-tool `use_tools`

**Files:**
- Create: `packages/core/src/tools/MetaToolUseTool.ts`
- Test: `packages/core/tests/tools/meta-tool-use.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// packages/core/tests/tools/meta-tool-use.test.ts
import { describe, expect, it } from "vitest";
import {
  META_TOOL_NAME,
  META_TOOL_FIRST_ACTIVATION_RESULT,
  META_TOOL_ALREADY_ACTIVE_RESULT,
  MetaToolUseTool,
} from "../../src/tools/MetaToolUseTool";

describe("MetaToolUseTool", () => {
  it("exposes the constant tool name", () => {
    expect(META_TOOL_NAME).toBe("use_tools");
  });

  it("creates a tool whose name matches META_TOOL_NAME", () => {
    const tool = MetaToolUseTool.create();
    expect(tool.name).toBe(META_TOOL_NAME);
    expect(tool.description.length).toBeGreaterThan(0);
  });

  it("returns the first-activation message when called with no reason", async () => {
    const tool = MetaToolUseTool.create();
    await expect(tool.call({})).resolves.toBe(META_TOOL_FIRST_ACTIVATION_RESULT);
  });

  it("accepts an optional reason argument", async () => {
    const tool = MetaToolUseTool.create();
    await expect(tool.call({ reason: "need to read a file" })).resolves.toBe(
      META_TOOL_FIRST_ACTIVATION_RESULT,
    );
  });

  it("rejects unknown additional properties via zod schema", async () => {
    const tool = MetaToolUseTool.create();
    await expect(tool.call({ unexpected: 1 } as unknown as never)).rejects.toThrow(
      /Invalid input for tool "use_tools"/,
    );
  });

  it("exports the already-active result string", () => {
    expect(META_TOOL_ALREADY_ACTIVE_RESULT).toContain("already active");
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

```bash
pnpm exec vitest run packages/core/tests/tools/meta-tool-use.test.ts
```

Expected: FAIL，无法 import `MetaToolUseTool`。

- [ ] **Step 3: 实现 meta-tool**

```ts
// packages/core/src/tools/MetaToolUseTool.ts
import { z } from "zod";
import { defineTool } from "./defineTool.ts";

export const META_TOOL_NAME = "use_tools";

export const META_TOOL_FIRST_ACTIVATION_RESULT =
  "Tools activated. The full tool catalog is now available.";

export const META_TOOL_ALREADY_ACTIVE_RESULT = "Tools are already active.";

const META_TOOL_DESCRIPTION =
  "Activate the full set of tools (file access, screen capture, app control, MCP integrations, etc.). " +
  "Call this whenever you need to perform any action beyond plain conversation. " +
  "Once activated, the tools become available immediately in the same turn. " +
  "Optional `reason` argument: a one-line note for audit logs.";

const inputSchema = z
  .object({
    reason: z.string().optional(),
  })
  .strict();

export const MetaToolUseTool = defineTool<
  z.infer<typeof inputSchema>,
  string,
  void
>({
  name: META_TOOL_NAME,
  description: META_TOOL_DESCRIPTION,
  inputSchema,
  run: async () => META_TOOL_FIRST_ACTIVATION_RESULT,
});
```

- [ ] **Step 4: 运行测试验证通过**

```bash
pnpm exec vitest run packages/core/tests/tools/meta-tool-use.test.ts
```

Expected: PASS（6 个用例全过）。

- [ ] **Step 5: 提交**

```bash
git add packages/core/src/tools/MetaToolUseTool.ts \
        packages/core/tests/tools/meta-tool-use.test.ts
git commit -m "feat(core/tools): 新增 use_tools meta-tool 与激活常量"
```

---

## Task 3: 让 SystemPrompt 忽略 meta-tool

**Files:**
- Modify: `packages/core/src/runtime/SystemPrompt.ts`
- Modify: `packages/core/tests/runtime/system-prompt.test.ts`

- [ ] **Step 1: 增加失败测试**

在 `packages/core/tests/runtime/system-prompt.test.ts` 末尾的 `describe("SystemPrompt", ...)` 内追加：

```ts
  it("treats use_tools as non-real and skips tool-use-policy when only meta-tool is registered", async () => {
    const sections = buildDefaultSystemPromptSections();
    const metaToolOnly: RegisteredTool = {
      name: "use_tools",
      description: "Activate tools.",
      inputSchema: { type: "object", additionalProperties: false },
    };

    await expect(
      resolveSystemPromptSections(sections, { tools: [metaToolOnly] }),
    ).resolves.toEqual([]);
  });

  it("emits tool-use-policy when meta-tool is mixed with real tools", async () => {
    const sections = buildDefaultSystemPromptSections();
    const metaToolOnly: RegisteredTool = {
      name: "use_tools",
      description: "Activate tools.",
      inputSchema: { type: "object", additionalProperties: false },
    };

    await expect(
      resolveSystemPromptSections(sections, {
        tools: [metaToolOnly, fakeRegisteredTool],
      }),
    ).resolves.toEqual([expect.stringContaining("structured tool calls")]);
  });
```

- [ ] **Step 2: 运行测试验证失败**

```bash
pnpm exec vitest run packages/core/tests/runtime/system-prompt.test.ts
```

Expected: 第一个新增 case FAIL（当前 `tools.length === 0` 检查会让单元素 `[meta]` 通过返回 policy）。

- [ ] **Step 3: 修改 SystemPrompt 判定**

打开 `packages/core/src/runtime/SystemPrompt.ts`，在文件顶部 import 区追加：

```ts
import { META_TOOL_NAME } from "../tools/MetaToolUseTool.ts";
```

然后把 `buildToolUsePolicySection` 改为：

```ts
export function buildToolUsePolicySection(): SystemPromptSection {
  return systemPromptSection("tool-use-policy", ({ tools }) => {
    if (!hasRealTools(tools)) return null;
    return TOOL_USE_POLICY_PROMPT;
  });
}

function hasRealTools(tools: RegisteredTool[]): boolean {
  return tools.some((t) => t.name !== META_TOOL_NAME);
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
pnpm exec vitest run packages/core/tests/runtime/system-prompt.test.ts
```

Expected: PASS（新增 2 个 + 原有 3 个）。

- [ ] **Step 5: 提交**

```bash
git add packages/core/src/runtime/SystemPrompt.ts \
        packages/core/tests/runtime/system-prompt.test.ts
git commit -m "feat(core/runtime): tool-use-policy 跳过仅含 meta-tool 的纯聊天 session"
```

---

## Task 4: 在 AgentRuntime 中处理 meta-tool 调用

**Files:**
- Modify: `packages/core/src/runtime/AgentRuntime.ts`
- Modify: `packages/core/tests/runtime/agent-runtime.test.ts`

### 4.1 设计回顾

- 新增构造选项 `onMetaToolActivate?: (sessionId: string) => Promise<void>` 与 `isSessionActivated?: (sessionId: string) => boolean`，两个都可选。
- `handleToolCall` 入口若 tool name === `META_TOOL_NAME`：
  - 跳过权限检查；
  - 若已激活（`isSessionActivated?.(sessionId) === true`）：直接 push 一条 tool message（content = `META_TOOL_ALREADY_ACTIVE_RESULT`），发出 tool_call / tool_result 事件，**不**调用工具 `call`，**不**触发激活回调；
  - 否则：先 `await onMetaToolActivate?.(sessionId)`，再走"普通工具执行"流程（执行 meta-tool.call 得到 first-activation 字符串、入消息历史、发事件）。
- 工具结果不走 stub 路径（meta-tool 不会被标记 stubByDefault）。

### 4.2 测试

- [ ] **Step 1: 增加失败测试**

在 `packages/core/tests/runtime/agent-runtime.test.ts` 末尾追加（如果文件已有 `describe("AgentRuntime", ...)`，把以下 case 加进去）：

```ts
  it("invokes onMetaToolActivate the first time use_tools is called and returns the activation result", async () => {
    const events: AgentRuntimeEvent[] = [];
    const activations: string[] = [];
    let activated = false;

    const tools = [MetaToolUseTool.create()];
    const registry = new ToolRegistry(tools);

    const llmClient = scriptedLLMClient([
      {
        kind: "tool_calls",
        toolCalls: [
          { id: "call-1", name: "use_tools", arguments: { reason: "need it" } },
        ],
      },
      { kind: "text", text: "ok, working with tools now." },
    ]);

    const runtime = new AgentRuntime(llmClient, registry, {
      onMetaToolActivate: async (sessionId) => {
        activations.push(sessionId);
        activated = true;
      },
      isSessionActivated: () => activated,
    });

    await runtime.runWithMessages(
      [{ role: "user", content: "look at my screen" }],
      (event) => events.push(event),
      { sessionId: "session-A" },
    );

    expect(activations).toEqual(["session-A"]);
    const toolResult = events.find((e) => e.type === "tool_result");
    expect(toolResult).toBeDefined();
    expect(toolResult?.toolName).toBe("use_tools");
    expect(toolResult?.output).toContain("Tools activated");
  });

  it("skips activation callback and returns the already-active result on repeat calls", async () => {
    const events: AgentRuntimeEvent[] = [];
    const activations: string[] = [];

    const registry = new ToolRegistry([MetaToolUseTool.create()]);
    const llmClient = scriptedLLMClient([
      {
        kind: "tool_calls",
        toolCalls: [{ id: "call-2", name: "use_tools", arguments: {} }],
      },
      { kind: "text", text: "noop." },
    ]);

    const runtime = new AgentRuntime(llmClient, registry, {
      onMetaToolActivate: async (sessionId) => {
        activations.push(sessionId);
      },
      isSessionActivated: () => true, // 已激活
    });

    await runtime.runWithMessages(
      [{ role: "user", content: "trigger it again" }],
      (event) => events.push(event),
      { sessionId: "session-B" },
    );

    expect(activations).toEqual([]);
    const toolResult = events.find((e) => e.type === "tool_result");
    expect(toolResult?.output).toBe("Tools are already active.");
  });

  it("skips permission policy entirely for meta-tool calls", async () => {
    let permissionChecks = 0;
    const policy: PermissionPolicy = {
      check: async () => {
        permissionChecks += 1;
        return "ask";
      },
      resolveAsk: async () => ({ decision: "deny", remember: "once", reason: "x" }),
      remember: async () => {},
      clearSessionRules: () => {},
    };

    const registry = new ToolRegistry([MetaToolUseTool.create()]);
    const llmClient = scriptedLLMClient([
      {
        kind: "tool_calls",
        toolCalls: [{ id: "call-3", name: "use_tools", arguments: {} }],
      },
      { kind: "text", text: "ok." },
    ]);

    const runtime = new AgentRuntime(llmClient, registry, {
      permissionPolicy: policy,
      onMetaToolActivate: async () => {},
      isSessionActivated: () => false,
    });

    await runtime.runWithMessages(
      [{ role: "user", content: "go" }],
      () => {},
      { sessionId: "session-C" },
    );

    expect(permissionChecks).toBe(0);
  });
```

> **测试支撑：** 如果 `agent-runtime.test.ts` 还没有 `scriptedLLMClient` 工具函数，先在文件顶部新增一个简易脚本式 mock：

```ts
type ScriptedStep =
  | { kind: "text"; text: string }
  | {
      kind: "tool_calls";
      toolCalls: { id: string; name: string; arguments: Record<string, unknown> }[];
    };

function scriptedLLMClient(steps: ScriptedStep[]): LLMClientLike {
  let i = 0;
  return {
    async *stream() {
      const step = steps[i++];
      if (!step) return;
      if (step.kind === "text") {
        yield { type: "text_delta", text: step.text } as const;
        yield {
          type: "message_end",
          message: { role: "assistant", content: step.text },
        } as const;
      } else {
        for (const call of step.toolCalls) {
          yield { type: "tool_call", toolCall: call } as const;
        }
        yield {
          type: "message_end",
          message: { role: "assistant", content: "" },
          toolCalls: step.toolCalls,
        } as const;
      }
    },
  } as unknown as LLMClientLike;
}
```

> 实际接口请查 `packages/core/src/llm/LLMClient.ts`，按现有 `streamLLM` 期望的 yield 形态对齐。如果项目已经有 mock helper（grep `scripted` / `MockLLMClient` 在 tests），优先复用，避免重复造轮。

- [ ] **Step 2: 运行测试验证失败**

```bash
pnpm exec vitest run packages/core/tests/runtime/agent-runtime.test.ts
```

Expected: 3 个新 case 全 FAIL（`onMetaToolActivate` 还不是合法构造选项，且 runtime 还会对 meta-tool 走权限链）。

- [ ] **Step 3: 修改 AgentRuntime 构造与 handleToolCall**

在 `packages/core/src/runtime/AgentRuntime.ts` 顶部 import 区追加：

```ts
import {
  META_TOOL_NAME,
  META_TOOL_ALREADY_ACTIVE_RESULT,
} from "../tools/MetaToolUseTool.ts";
```

新增字段（在 `pendingTurnSummary` 附近声明）：

```ts
  private readonly onMetaToolActivate?: (sessionId: string) => Promise<void>;
  private readonly isSessionActivated?: (sessionId: string) => boolean;
```

构造函数 options 类型扩展：

```ts
    options?: {
      maxTimes?: number;
      permissionPolicy?: PermissionPolicy;
      blobStore?: BlobStore;
      turnSummarizer?: TurnSummarizerLike;
      systemPromptSections?: SystemPromptSection[];
      onMetaToolActivate?: (sessionId: string) => Promise<void>;
      isSessionActivated?: (sessionId: string) => boolean;
    }
```

构造函数体追加：

```ts
    this.onMetaToolActivate = options?.onMetaToolActivate;
    this.isSessionActivated = options?.isSessionActivated;
```

修改 `handleToolCall`，在 `const tool = this.toolRegistry.get(toolCall.name);` 之后立刻插入 meta-tool 分支：

```ts
    if (toolCall.name === META_TOOL_NAME) {
      await this.handleMetaToolCall({ toolCall, messages, onEvent, runOptions });
      return;
    }
```

新增私有方法：

```ts
  private async handleMetaToolCall(input: {
    toolCall: ToolCallEnvelope;
    messages: AgentMessage[];
    onEvent: AgentRuntimeEventSink;
    runOptions: AgentRuntimeRunOptions;
  }): Promise<void> {
    const { toolCall, messages, onEvent, runOptions } = input;
    throwIfAborted(runOptions.signal);

    onEvent({
      type: "tool_call",
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      input: toolCall.arguments,
    });

    const sessionId = runOptions.sessionId;
    const alreadyActive =
      sessionId !== undefined && this.isSessionActivated?.(sessionId) === true;

    const startedAt = Date.now();
    let content: string;
    if (alreadyActive) {
      content = META_TOOL_ALREADY_ACTIVE_RESULT;
    } else {
      if (sessionId !== undefined) {
        await this.onMetaToolActivate?.(sessionId);
        throwIfAborted(runOptions.signal);
      }
      const tool = this.toolRegistry.get(toolCall.name);
      if (!tool) {
        throw new Error(`Unknown tool: ${toolCall.name}`);
      }
      const raw = await tool.call(toolCall.arguments, {
        sessionId,
        toolCallId: toolCall.id,
      });
      throwIfAborted(runOptions.signal);
      content = typeof raw === "string" ? raw : JSON.stringify(raw);
    }

    messages.push({
      role: "tool",
      toolCallId: toolCall.id,
      name: toolCall.name,
      content,
    });
    onEvent({
      type: "tool_result",
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      status: "success",
      output: content,
      durationMs: Date.now() - startedAt,
    });
  }
```

- [ ] **Step 4: 运行测试验证通过**

```bash
pnpm exec vitest run packages/core/tests/runtime/agent-runtime.test.ts
```

Expected: PASS（新增 3 + 原有全部）。

- [ ] **Step 5: 提交**

```bash
git add packages/core/src/runtime/AgentRuntime.ts \
        packages/core/tests/runtime/agent-runtime.test.ts
git commit -m "feat(core/runtime): AgentRuntime 处理 use_tools 激活分支"
```

---

## Task 5: SessionScopedToolRegistry 支持懒激活

**Files:**
- Modify: `apps/agent-server/src/SessionScopedToolRegistry.ts`
- Create: `apps/agent-server/tests/session/SessionScopedToolRegistry.test.ts`

### 5.1 行为定义

- `refreshForSession(sessionId, binding)`：
  - 若 `binding != null`：等同已激活（plugin binding 表示用户主动选择带工具的 action）。把 sessionId 加进激活集合，再走"已激活"路径。
  - 否则查激活集合：未激活 → `registry.replaceAll([metaTool])`；已激活 → `registry.replaceAll([metaTool, ...builtin, ...mcp])`。
- `activate(sessionId)`：把 sessionId 加进集合并立即 `refreshForSession(sessionId, undefined)`，得到完整工具集。
- `isActivated(sessionId)`：纯查 set。
- `forgetSession(sessionId)`：从 set 中删除（删除会话或长时间未触达时调用）。
- meta-tool 的实例由 registry 内部缓存，避免每次 refresh 重新构造。

### 5.2 测试

- [ ] **Step 1: 写测试**

```ts
// apps/agent-server/tests/session/SessionScopedToolRegistry.test.ts
import { describe, expect, it } from "vitest";
import type { AgentTool } from "@handagent/core/tools/AgentTool.ts";
import { ToolRegistry } from "@handagent/core/tools/ToolRegistry.ts";
import { SessionScopedToolRegistry } from "../../src/SessionScopedToolRegistry";

function fakeTool(name: string): AgentTool {
  return {
    name,
    description: name,
    inputSchema: { type: "object", additionalProperties: false },
    call: async () => "ok",
  };
}

function buildScoped(options?: {
  builtin?: AgentTool[];
  mcp?: Record<string, AgentTool[]>;
  globalMcpServerIds?: string[];
}): SessionScopedToolRegistry {
  const builtin = new ToolRegistry(options?.builtin ?? [fakeTool("frontmost.app")]);
  return new SessionScopedToolRegistry({
    builtinRegistry: builtin,
    globalMcpServerIds: options?.globalMcpServerIds ?? [],
    listMcpTools: async (id) => options?.mcp?.[id] ?? [],
  });
}

describe("SessionScopedToolRegistry lazy activation", () => {
  it("only exposes the meta-tool before activation", async () => {
    const scoped = buildScoped();
    await scoped.refreshForSession("s1", undefined);

    expect(scoped.registry.list().map((t) => t.name)).toEqual(["use_tools"]);
    expect(scoped.isActivated("s1")).toBe(false);
  });

  it("activate switches the registry to meta + builtin + mcp tools", async () => {
    const scoped = buildScoped({
      builtin: [fakeTool("frontmost.app"), fakeTool("clipboard.read")],
      mcp: { srv: [fakeTool("mcp.srv.echo")] },
      globalMcpServerIds: ["srv"],
    });

    await scoped.activate("s1");

    expect(scoped.registry.list().map((t) => t.name)).toEqual([
      "use_tools",
      "frontmost.app",
      "clipboard.read",
      "mcp.srv.echo",
    ]);
    expect(scoped.isActivated("s1")).toBe(true);
  });

  it("isolates activation state per session", async () => {
    const scoped = buildScoped();
    await scoped.activate("s1");
    await scoped.refreshForSession("s2", undefined);

    expect(scoped.isActivated("s1")).toBe(true);
    expect(scoped.isActivated("s2")).toBe(false);
    expect(scoped.registry.list().map((t) => t.name)).toEqual(["use_tools"]);
  });

  it("plugin binding session skips meta-only and goes straight to full tools", async () => {
    const scoped = buildScoped({
      builtin: [fakeTool("frontmost.app")],
      mcp: { srv: [fakeTool("mcp.srv.echo")] },
      globalMcpServerIds: [],
    });

    await scoped.refreshForSession("s1", { mcpServerIds: ["srv"] });

    expect(scoped.registry.list().map((t) => t.name)).toEqual([
      "use_tools",
      "frontmost.app",
      "mcp.srv.echo",
    ]);
    expect(scoped.isActivated("s1")).toBe(true);
  });

  it("forgetSession drops activation state", async () => {
    const scoped = buildScoped();
    await scoped.activate("s1");
    expect(scoped.isActivated("s1")).toBe(true);

    scoped.forgetSession("s1");
    expect(scoped.isActivated("s1")).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

```bash
pnpm exec vitest run apps/agent-server/tests/session/SessionScopedToolRegistry.test.ts
```

Expected: FAIL — 缺少 `activate` / `isActivated` / `forgetSession`，且 `refreshForSession` 现在直接组装完整工具集。

- [ ] **Step 3: 修改 SessionScopedToolRegistry**

把 `apps/agent-server/src/SessionScopedToolRegistry.ts` 替换为：

```ts
import type { AgentTool } from "@handagent/core/tools/AgentTool.ts";
import { ToolRegistry } from "@handagent/core/tools/ToolRegistry.ts";
import type { SessionActionBinding } from "@handagent/core/storage/index.ts";
import { MetaToolUseTool } from "@handagent/core/tools/MetaToolUseTool.ts";

export class SessionScopedToolRegistry {
  readonly registry = new ToolRegistry();
  private readonly metaTool: AgentTool = MetaToolUseTool.create();
  private readonly activated = new Set<string>();

  constructor(
    private readonly options: {
      builtinRegistry: ToolRegistry;
      globalMcpServerIds: string[];
      listMcpTools: (serverId: string) => Promise<AgentTool[]>;
    },
    private readonly dependencies: {
      log?: (message: string) => void;
    } = {},
  ) {}

  async refreshForSession(
    sessionId: string,
    binding: SessionActionBinding | undefined,
  ): Promise<void> {
    if (binding) {
      this.activated.add(sessionId);
    }
    if (this.activated.has(sessionId)) {
      await this.refreshActivated(sessionId, binding);
      return;
    }
    this.registry.replaceAll([this.metaTool]);
  }

  async activate(sessionId: string): Promise<void> {
    this.activated.add(sessionId);
    await this.refreshActivated(sessionId, undefined);
  }

  isActivated(sessionId: string): boolean {
    return this.activated.has(sessionId);
  }

  forgetSession(sessionId: string): void {
    this.activated.delete(sessionId);
  }

  private async refreshActivated(
    sessionId: string,
    binding: SessionActionBinding | undefined,
  ): Promise<void> {
    void sessionId;
    const tools: AgentTool[] = [this.metaTool, ...this.options.builtinRegistry.all()];

    const serverIds = new Set([
      ...this.options.globalMcpServerIds,
      ...(binding?.mcpServerIds ?? []),
    ]);

    for (const serverId of serverIds) {
      try {
        tools.push(...(await this.options.listMcpTools(serverId)));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.dependencies.log?.(
          `[agent-server] skipped MCP server ${serverId}: ${message}`,
        );
      }
    }

    const byName = new Map<string, AgentTool>();
    for (const tool of tools) {
      if (!byName.has(tool.name)) {
        byName.set(tool.name, tool);
      }
    }
    this.registry.replaceAll([...byName.values()]);
  }
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
pnpm exec vitest run apps/agent-server/tests/session/SessionScopedToolRegistry.test.ts
```

Expected: PASS（5 个用例全过）。

- [ ] **Step 5: 提交**

```bash
git add apps/agent-server/src/SessionScopedToolRegistry.ts \
        apps/agent-server/tests/session/SessionScopedToolRegistry.test.ts
git commit -m "feat(agent-server): SessionScopedToolRegistry 支持懒激活与 sessionId 隔离"
```

---

## Task 6: Orchestrator 接入 plugin-binding 与重启恢复推断

**Files:**
- Modify: `apps/agent-server/src/SessionRuntimeOrchestrator.ts`（**仅当需要扩展 beforeRun 接口时**；当前实现 beforeRun 是单参数闭包，不需要改 orchestrator 内部，只需在 server.ts 闭包里加逻辑）
- Modify: `apps/agent-server/src/server.ts`
- Modify: `apps/agent-server/tests/session/SessionRuntimeOrchestrator.test.ts`

### 6.1 设计回顾

- `beforeRun(sessionId)` 当前已经持有 `persistence` 与 `sessionScopedTools` 闭包变量。在那里：
  1. 取出 `session = await persistence.getSession(sessionId)`；
  2. 若 `session.metadata.actionBinding` 存在：直接 `await sessionScopedTools.activate(sessionId)`；
  3. 否则若 `!sessionScopedTools.isActivated(sessionId)` 且持久化历史里存在 `name === "use_tools"` 的成功 tool message：调用 `sessionScopedTools.activate(sessionId)`；
  4. 最后再调用 `sessionScopedTools.refreshForSession(sessionId, session?.metadata.actionBinding)` 刷新 registry。
- 这把"plugin binding 快路径"与"agent-server 重启恢复"统一在 server 层胶合，orchestrator 自身不需要新参数。

### 6.2 测试

- [ ] **Step 1: 写失败测试**

在 `apps/agent-server/tests/session/SessionRuntimeOrchestrator.test.ts` 末尾新增一个 describe（如已存在 fake fixtures，优先复用）：

```ts
describe("SessionRuntimeOrchestrator activation hook", () => {
  it("invokes beforeRun before runtime.runWithMessages with the session id", async () => {
    const calls: string[] = [];
    const persistence = makeFakePersistence(); // 复用现有测试中的 helper
    const runtime = makeFakeRuntime();
    const orchestrator = new SessionRuntimeOrchestrator(
      runtime,
      persistence,
      undefined,
      async (sessionId) => {
        calls.push(`before:${sessionId}`);
      },
    );

    await orchestrator.handleUserMessage(
      makeUserMessage("s1", "hi"),
      () => {},
    );

    expect(calls).toEqual(["before:s1"]);
  });
});
```

> 该测试只验证 `beforeRun` 接收到 sessionId。具体 plugin-binding / 历史恢复逻辑放到 server.ts 集成测试里覆盖（Task 7）。

- [ ] **Step 2: 运行测试验证通过（应当一开始就通过）**

```bash
pnpm exec vitest run apps/agent-server/tests/session/SessionRuntimeOrchestrator.test.ts
```

Expected: PASS。如果失败说明 `beforeRun` 未被调用，先检查 orchestrator 是否漏接，再决定是否需要打补丁。

- [ ] **Step 3: 提交（仅测试增强）**

```bash
git add apps/agent-server/tests/session/SessionRuntimeOrchestrator.test.ts
git commit -m "test(agent-server): 锁定 SessionRuntimeOrchestrator beforeRun 调用"
```

---

## Task 7: server.ts 把激活回调与恢复逻辑接入 runtime 与 orchestrator

**Files:**
- Modify: `apps/agent-server/src/server.ts`
- Modify: `apps/agent-server/tests/server/`（如果有 server 集成测试，否则在 session 目录加新文件）

### 7.1 改动

打开 `apps/agent-server/src/server.ts`，找到构造 `runtime` 与 `orchestrator` 的位置（第 281、287 行附近）。

替换 runtime 构造：

```ts
  const runtime = new AgentRuntime(llmClient, sessionScopedTools.registry, {
    permissionPolicy,
    blobStore,
    turnSummarizer: summarizer,
    onMetaToolActivate: async (sessionId) => {
      await sessionScopedTools.activate(sessionId);
    },
    isSessionActivated: (sessionId) => sessionScopedTools.isActivated(sessionId),
  });
```

替换 orchestrator 构造里的 beforeRun：

```ts
  const orchestrator = new SessionRuntimeOrchestrator(
    runtime,
    persistence,
    undefined,
    async (sessionId) => {
      await toolRegistry.refresh();
      const session = await persistence.getSession(sessionId);
      const binding = session?.metadata.actionBinding;

      if (!sessionScopedTools.isActivated(sessionId)) {
        if (binding) {
          await sessionScopedTools.activate(sessionId);
        } else {
          const history = await persistence.getMessages(sessionId);
          if (historyShowsToolsActivated(history)) {
            await sessionScopedTools.activate(sessionId);
          }
        }
      }

      await sessionScopedTools.refreshForSession(sessionId, binding);
    },
  );
```

在 `server.ts` 文件底部追加辅助函数：

```ts
import { META_TOOL_NAME } from "@handagent/core/tools/MetaToolUseTool.ts";

function historyShowsToolsActivated(messages: readonly AgentMessage[]): boolean {
  return messages.some(
    (m) => m.role === "tool" && m.name === META_TOOL_NAME,
  );
}
```

> 如果 `AgentMessage` 在 server.ts 还未 import，需要补 `import type { AgentMessage } from "@handagent/core/runtime/AgentMessage.ts";`。

### 7.2 删除 SessionRouter 路径补 forgetSession

打开 `apps/agent-server/src/SessionRouter.ts`：

- 构造函数新增可选依赖（不破坏现有调用）：

```ts
  constructor(
    private readonly orchestrator: SessionRuntimeOrchestratorLike,
    private readonly persistence: SessionPersistence,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly actionBindingResolver?: ActionBindingResolver,
    private readonly onSessionDeleted?: (sessionId: string) => void,
  ) {}
```

在删除路径里调用：

```ts
    await this.persistence.deleteSession(targetSessionId);
    this.onSessionDeleted?.(targetSessionId);
```

回到 `server.ts`，构造 SessionRouter 时传入：

```ts
  const router = new SessionRouter(
    orchestrator,
    persistence,
    undefined,
    new ActionBindingResolver({ pluginsDir: paths.pluginsDir }),
    (sessionId) => sessionScopedTools.forgetSession(sessionId),
  );
```

### 7.3 测试

- [ ] **Step 1: 写测试 — SessionRouter 删除时调用 forgetSession**

在 `apps/agent-server/tests/session/SessionRouter.test.ts` 增加：

```ts
  it("calls onSessionDeleted hook after persistence.deleteSession", async () => {
    const persistence = makeFakePersistenceWithSession("s1");
    const orchestrator = makeFakeOrchestrator();
    const forgotten: string[] = [];
    const router = new SessionRouter(
      orchestrator,
      persistence,
      () => "now",
      undefined,
      (sessionId) => forgotten.push(sessionId),
    );

    await router.receive(
      {
        type: "delete_session_request",
        sessionId: "ctx",
        messageId: "m",
        timestamp: "now",
        payload: { targetSessionId: "s1" },
      },
      () => {},
    );

    expect(forgotten).toEqual(["s1"]);
  });
```

- [ ] **Step 2: 运行测试验证失败 → 改 SessionRouter → 通过**

```bash
pnpm exec vitest run apps/agent-server/tests/session/SessionRouter.test.ts
```

Expected: 第一次 FAIL（缺 onSessionDeleted），改完后 PASS。

- [ ] **Step 3: server.ts 改动通过整体测试间接验证**

```bash
bash ./scripts/test.sh
```

Expected: 全绿。如果失败重点查：
- 历史推断函数是否漏 import META_TOOL_NAME
- AgentMessage 类型是否需要从 core 导入
- 既有 `SessionRuntimeOrchestrator` 测试是否因为 beforeRun 闭包变更而 break（应该不会，因为闭包是本地构造）

- [ ] **Step 4: 提交**

```bash
git add apps/agent-server/src/server.ts \
        apps/agent-server/src/SessionRouter.ts \
        apps/agent-server/tests/session/SessionRouter.test.ts
git commit -m "feat(agent-server): server 闭包接入懒激活回调与会话删除清理"
```

---

## Task 8: 整体 TypeScript + Swift 验证

**Files:** 无修改

- [ ] **Step 1: 全量 TS 测试**

```bash
bash ./scripts/test.sh
```

Expected: 全绿。

- [ ] **Step 2: Swift build（链路打包）**

```bash
bash ./scripts/swiftw build
```

Expected: 构建成功。

- [ ] **Step 3: 若有 lint / typecheck 命令在 package.json，运行**

```bash
pnpm exec tsc -b
```

Expected: 无 type 错误。

---

## Task 9: 文档同步

**Files:**
- Modify: `packages/core/src/tools/tools.md`
- Modify: `packages/core/src/runtime/runtime.md`
- Modify: `apps/agent-server/agent-server.md`
- Modify: `docs/manual-qa.md`

- [ ] **Step 1: 在 `packages/core/src/tools/tools.md` 增加 meta-tool 段落**

要点：登记 `MetaToolUseTool` / `META_TOOL_NAME = "use_tools"`，说明：
- 它是激活机制的入口而不是普通能力工具，不进入 builtin 注册流程；
- 不受 `~/.spotAgent/settings.json` allowlist/denylist 影响；
- 激活后仍保留在 registry 里，重复调用走幂等路径。

- [ ] **Step 2: 在 `packages/core/src/runtime/runtime.md` 描述新分支**

要点：
- `AgentRuntime.handleToolCall` 识别 `META_TOOL_NAME`，跳过 PermissionPolicy；
- `onMetaToolActivate` / `isSessionActivated` 两个可选回调；
- tool-use-policy section 仅在存在非 meta-tool 时出现。

- [ ] **Step 3: 在 `apps/agent-server/agent-server.md` 更新 SessionScopedToolRegistry 与 SessionRouter 描述**

要点：
- 未激活 session 只暴露 meta-tool，激活后扩展为完整工具集；
- plugin-binding 的 session 在 `refreshForSession` 中自动激活；
- agent-server 重启后通过历史 tool message 推断激活状态；
- 删除 session 调用 `forgetSession` 清理激活集合。

- [ ] **Step 4: 在 `docs/manual-qa.md` 加 4 个验收场景**

具体场景（按现有文档风格写）：
1. 新建 session → 输入纯聊天问题 → 模型直接回复；查看 `~/.spotAgent/log/` 网络日志，确认请求 tools 数组只有 `use_tools`。
2. 新建 session → 输入"看一下我屏幕"→ 模型先调 `use_tools`，再调真实工具 → tool messages 完整出现在历史。
3. 接 (2) → 同一 session 再问"再读一次桌面前台"→ 网络日志显示 tools 数组已含完整工具集，不再出现新的 `use_tools` 调用。
4. 触发激活的 session → kill agent-server 再启动 → 同一 session 再发 user message → 网络日志显示 tools 数组直接是完整工具集（验证恢复推断）。

- [ ] **Step 5: 提交文档**

```bash
git add packages/core/src/tools/tools.md \
        packages/core/src/runtime/runtime.md \
        apps/agent-server/agent-server.md \
        docs/manual-qa.md
git commit -m "docs: 同步懒加载工具激活相关模块文档与手工 QA"
```

---

## Self-Review

**1. Spec 覆盖：**
- 总体方案（meta-tool / 单级激活 / 持久状态）→ Task 2/4/5
- Cache 行为（保留 meta-tool）→ Task 5（`refreshActivated` 始终把 meta-tool 放在首位）
- AgentRuntime 改动（meta-tool 分支、跳过权限、回调时机）→ Task 4
- SystemPrompt 改动（hasRealTools 判定）→ Task 3
- SessionScopedToolRegistry 双模式 + sessionId 隔离 + forgetSession → Task 5
- 边界场景：MCP 全挂（沿用现有 listMcpTools 容错）、重复调用（已激活幂等）、重启恢复、plugin-binding、删除清理 → Task 4/5/7
- 测试矩阵 → Task 2/3/4/5/6/7
- 文档同步 → Task 9

**2. Placeholder 扫描：** 无 TBD / TODO / "类似 Task N"。所有代码段落都给出可直接粘贴的内容。`scriptedLLMClient` 给了 fallback 示例并要求落地时优先复用既有 helper。

**3. 类型一致性：** `META_TOOL_NAME` / `MetaToolUseTool` / `META_TOOL_FIRST_ACTIVATION_RESULT` / `META_TOOL_ALREADY_ACTIVE_RESULT` 在 Task 2 定义，Task 3/4/5/7 全部用同名引用；`onMetaToolActivate` / `isSessionActivated` 在 Task 4 定义，Task 7 注入；`activate` / `isActivated` / `forgetSession` 在 Task 5 定义，Task 7 调用。

**4. 风险点提示给执行者：**
- `scriptedLLMClient` 的实际形态以现有 `LLMClient` 接口为准；项目里若已有 `MockLLMClient` 测试 helper，优先复用；
- `SessionRouter` 构造函数参数顺序变更属于轻量重构，注意只在新增可选参数的位置追加，避免破坏现有调用（server.ts 是唯一构造点）；
- 历史推断 `historyShowsToolsActivated` 只看 role=tool + name=use_tools，若未来 meta-tool 改名需同步更新（但 `META_TOOL_NAME` 是常量，refactor 会被 grep 出来）。

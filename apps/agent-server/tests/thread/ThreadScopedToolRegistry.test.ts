import { describe, expect, it } from "vitest";
import { MockLLMClient } from "@handagent/core/llm/MockLLMClient.ts";
import { AgentRuntime } from "@handagent/core/runtime/AgentRuntime.ts";
import type { AgentMessage } from "@handagent/core/runtime/AgentMessage.ts";
import type { AgentTool } from "@handagent/core/tools/AgentTool.ts";
import { ToolRegistry } from "@handagent/core/tools/ToolRegistry.ts";
import { META_TOOL_NAME } from "@handagent/core/tools/MetaToolUseTool.ts";
import { ThreadScopedToolRegistry } from "../../src/actions/ThreadScopedToolRegistry.ts";

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
}): ThreadScopedToolRegistry {
  const builtin = new ToolRegistry(options?.builtin ?? [fakeTool("frontmost.app")]);
  return new ThreadScopedToolRegistry({
    builtinRegistry: builtin,
    globalMcpServerIds: options?.globalMcpServerIds ?? [],
    listMcpTools: async (id) => options?.mcp?.[id] ?? [],
  });
}

describe("ThreadScopedToolRegistry lazy activation", () => {
  it("only exposes the meta-tool before activation", async () => {
    const scoped = buildScoped();
    await scoped.refreshForThread("s1", undefined);

    expect(scoped.registryForThread("s1").list().map((t) => t.name)).toEqual(["use_tools"]);
    expect(scoped.isActivated("s1")).toBe(false);
  });

  it("activate switches the registry to builtin + mcp tools without the meta-tool", async () => {
    const scoped = buildScoped({
      builtin: [fakeTool("frontmost.app"), fakeTool("clipboard.read")],
      mcp: { srv: [fakeTool("mcp.srv.echo")] },
      globalMcpServerIds: ["srv"],
    });

    await scoped.activate("s1");

    expect(scoped.registryForThread("s1").list().map((t) => t.name)).toEqual([
      "frontmost.app",
      "clipboard.read",
      "mcp.srv.echo",
    ]);
    expect(scoped.isActivated("s1")).toBe(true);
  });

  it("removes the meta-tool from the next LLM request after activation", async () => {
    const toolNamesPerRequest: string[][] = [];
    const scoped = buildScoped({
      builtin: [fakeTool("frontmost.app")],
    });
    await scoped.refreshForThread("s1", undefined);

    const client = {
      async *stream(_messages: AgentMessage[], tools: AgentTool[]) {
        toolNamesPerRequest.push(tools.map((tool) => tool.name));
        if (toolNamesPerRequest.length === 1) {
          yield {
            type: "tool_call" as const,
            toolCall: { id: "meta-1", name: META_TOOL_NAME, arguments: {} },
          };
          yield {
            type: "message_end" as const,
            message: { role: "assistant" as const, content: "" },
            toolCalls: [{ id: "meta-1", name: META_TOOL_NAME, arguments: {} }],
          };
          return;
        }
        yield { type: "text_delta" as const, text: "done" };
        yield {
          type: "message_end" as const,
          message: { role: "assistant" as const, content: "done" },
          toolCalls: [],
        };
      },
    };

    const runtime = new AgentRuntime(client, scoped.registryForThread("s1"), {
      onMetaToolActivate: (threadId) => scoped.activate(threadId),
      isThreadActivated: (threadId) => scoped.isActivated(threadId),
    });

    await runtime.runWithMessages([{ role: "user", content: "inspect screen" }], () => {}, {
      threadId: "s1",
    });

    expect(toolNamesPerRequest).toEqual([
      ["use_tools"],
      ["frontmost.app"],
    ]);
  });

  it("isolates activation state per Thread", async () => {
    const scoped = buildScoped();
    await scoped.activate("s1");
    await scoped.refreshForThread("s2", undefined);

    expect(scoped.isActivated("s1")).toBe(true);
    expect(scoped.isActivated("s2")).toBe(false);
    expect(scoped.registryForThread("s2").list().map((t) => t.name)).toEqual(["use_tools"]);
    expect(scoped.registryForThread("s1").list().map((t) => t.name)).toEqual([
      "frontmost.app",
    ]);
  });

  it("plugin binding Thread skips meta-only and goes straight to full tools", async () => {
    const scoped = buildScoped({
      builtin: [fakeTool("frontmost.app")],
      mcp: { srv: [fakeTool("mcp.srv.echo")] },
      globalMcpServerIds: [],
    });

    await scoped.refreshForThread("s1", { mcpServerIds: ["srv"] });

    expect(scoped.registryForThread("s1").list().map((t) => t.name)).toEqual([
      "frontmost.app",
      "mcp.srv.echo",
    ]);
    expect(scoped.isActivated("s1")).toBe(true);
  });

  it("forgetThread drops activation state", async () => {
    const scoped = buildScoped();
    await scoped.activate("s1");
    expect(scoped.isActivated("s1")).toBe(true);

    scoped.forgetThread("s1");
    expect(scoped.isActivated("s1")).toBe(false);
  });

  it("does not rewrite one Thread registry when another Thread refreshes", async () => {
    const scoped = buildScoped({
      builtin: [fakeTool("frontmost.app"), fakeTool("clipboard.read")],
    });

    await scoped.activate("s1");
    const s1Registry = scoped.registryForThread("s1");

    await scoped.refreshForThread("s2", undefined);

    expect(scoped.registryForThread("s2").list().map((t) => t.name)).toEqual(["use_tools"]);
    expect(s1Registry.list().map((t) => t.name)).toEqual([
      "frontmost.app",
      "clipboard.read",
    ]);
  });

  it("can eagerly expose builtin tools for mock LLM direct tool-call scenarios", async () => {
    const fileWriteCalls: unknown[] = [];
    const fileWriteTool: AgentTool = {
      name: "file.write",
      description: "write file",
      inputSchema: { type: "object" },
      call: async (input) => {
        fileWriteCalls.push(input);
        return "ok";
      },
    };
    const scoped = new ThreadScopedToolRegistry({
      builtinRegistry: new ToolRegistry([fileWriteTool]),
      globalMcpServerIds: [],
      listMcpTools: async () => [],
      exposeBuiltinToolsBeforeActivation: true,
    });

    await scoped.refreshForThread("mock-Thread", undefined);
    const runtime = new AgentRuntime(
      new MockLLMClient(),
      scoped.registryForThread("mock-Thread"),
      {
        isThreadActivated: (threadId) => scoped.isActivated(threadId),
      },
    );

    const result = await runtime.runWithMessages(
      [{ role: "user", content: "please [mock:file-write]" }],
      () => {},
      { threadId: "mock-Thread" },
    );

    expect(fileWriteCalls).toEqual([
      {
        workspaceId: "qa-workspace",
        relativePath: "hello.txt",
        content: "hello from MockLLMClient",
      },
    ]);
    expect(result.messages.at(-1)).toEqual({
      role: "assistant",
      content: "Mock file.write completed for hello.txt.",
    });
  });

  it("does not eagerly load MCP tools when only builtin tools are needed for mock LLM scenarios", async () => {
    let listMcpToolCalls = 0;
    const scoped = new ThreadScopedToolRegistry({
      builtinRegistry: new ToolRegistry([fakeTool("file.write")]),
      globalMcpServerIds: ["filesystem"],
      listMcpTools: async () => {
        listMcpToolCalls += 1;
        return [fakeTool("mcp.filesystem.read_file")];
      },
      exposeBuiltinToolsBeforeActivation: true,
    });

    await scoped.refreshForThread("mock-Thread", undefined);

    expect(listMcpToolCalls).toBe(0);
    expect(scoped.isActivated("mock-Thread")).toBe(false);
    expect(scoped.registryForThread("mock-Thread").list().map((t) => t.name)).toEqual([
      "use_tools",
      "file.write",
    ]);
  });
});

import { describe, expect, it } from "vitest";
import { MockLLMClient } from "@handagent/core/llm/MockLLMClient.ts";
import { AgentRuntime } from "@handagent/core/runtime/AgentRuntime.ts";
import type { AgentTool } from "@handagent/core/tools/AgentTool.ts";
import { ToolRegistry } from "@handagent/core/tools/ToolRegistry.ts";
import { SessionScopedToolRegistry } from "../../src/actions/SessionScopedToolRegistry.ts";

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

    expect(scoped.registryForSession("s1").list().map((t) => t.name)).toEqual(["use_tools"]);
    expect(scoped.isActivated("s1")).toBe(false);
  });

  it("activate switches the registry to meta + builtin + mcp tools", async () => {
    const scoped = buildScoped({
      builtin: [fakeTool("frontmost.app"), fakeTool("clipboard.read")],
      mcp: { srv: [fakeTool("mcp.srv.echo")] },
      globalMcpServerIds: ["srv"],
    });

    await scoped.activate("s1");

    expect(scoped.registryForSession("s1").list().map((t) => t.name)).toEqual([
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
    expect(scoped.registryForSession("s2").list().map((t) => t.name)).toEqual(["use_tools"]);
    expect(scoped.registryForSession("s1").list().map((t) => t.name)).toEqual([
      "use_tools",
      "frontmost.app",
    ]);
  });

  it("plugin binding session skips meta-only and goes straight to full tools", async () => {
    const scoped = buildScoped({
      builtin: [fakeTool("frontmost.app")],
      mcp: { srv: [fakeTool("mcp.srv.echo")] },
      globalMcpServerIds: [],
    });

    await scoped.refreshForSession("s1", { mcpServerIds: ["srv"] });

    expect(scoped.registryForSession("s1").list().map((t) => t.name)).toEqual([
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

  it("does not rewrite one session registry when another session refreshes", async () => {
    const scoped = buildScoped({
      builtin: [fakeTool("frontmost.app"), fakeTool("clipboard.read")],
    });

    await scoped.activate("s1");
    const s1Registry = scoped.registryForSession("s1");

    await scoped.refreshForSession("s2", undefined);

    expect(scoped.registryForSession("s2").list().map((t) => t.name)).toEqual(["use_tools"]);
    expect(s1Registry.list().map((t) => t.name)).toEqual([
      "use_tools",
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
    const scoped = new SessionScopedToolRegistry({
      builtinRegistry: new ToolRegistry([fileWriteTool]),
      globalMcpServerIds: [],
      listMcpTools: async () => [],
      exposeBuiltinToolsBeforeActivation: true,
    });

    await scoped.refreshForSession("mock-session", undefined);
    const runtime = new AgentRuntime(
      new MockLLMClient(),
      scoped.registryForSession("mock-session"),
      {
        isSessionActivated: (sessionId) => scoped.isActivated(sessionId),
      },
    );

    const result = await runtime.runWithMessages(
      [{ role: "user", content: "please [mock:file-write]" }],
      () => {},
      { sessionId: "mock-session" },
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
    const scoped = new SessionScopedToolRegistry({
      builtinRegistry: new ToolRegistry([fakeTool("file.write")]),
      globalMcpServerIds: ["filesystem"],
      listMcpTools: async () => {
        listMcpToolCalls += 1;
        return [fakeTool("mcp.filesystem.read_file")];
      },
      exposeBuiltinToolsBeforeActivation: true,
    });

    await scoped.refreshForSession("mock-session", undefined);

    expect(listMcpToolCalls).toBe(0);
    expect(scoped.isActivated("mock-session")).toBe(false);
    expect(scoped.registryForSession("mock-session").list().map((t) => t.name)).toEqual([
      "use_tools",
      "file.write",
    ]);
  });
});

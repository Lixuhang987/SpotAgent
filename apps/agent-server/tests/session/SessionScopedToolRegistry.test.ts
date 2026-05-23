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

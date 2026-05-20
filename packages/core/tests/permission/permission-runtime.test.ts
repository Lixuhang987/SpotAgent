import { describe, expect, it, vi } from "vitest";
import { AgentRuntime, type AgentRuntimeEvent } from "../../src/runtime/AgentRuntime";
import { ToolRegistry } from "../../src/tools/ToolRegistry";
import type { AgentTool } from "../../src/tools/AgentTool";
import type { AgentMessage } from "../../src/runtime/AgentMessage";
import type {
  PermissionPolicy,
  PermissionResolution,
} from "../../src/permission/PermissionPolicy";
import { DENY_TOOL_RESULT_TEXT } from "../../src/permission/PermissionPolicy";

class EchoTool implements AgentTool {
  name = "echo";
  description = "echo";
  inputSchema = {
    type: "object",
    properties: { value: { type: "string" } },
    required: ["value"],
    additionalProperties: false,
  } as const;
  call = vi.fn(async (input: unknown) => ({ echoed: input }));
}

function makeClient() {
  let calls = 0;
  return {
    async complete(messages: AgentMessage[]) {
      void messages;
      calls += 1;
      if (calls === 1) {
        return {
          message: { role: "assistant" as const, content: "calling tool" },
          toolCalls: [
            { id: "call-1", name: "echo", arguments: { value: "x" } },
          ],
        };
      }
      return {
        message: { role: "assistant" as const, content: "done" },
        toolCalls: [],
      };
    },
  };
}

describe("PermissionPolicy integration", () => {
  it("denies tool call and injects denial result without invoking the tool", async () => {
    const tool = new EchoTool();
    const policy: PermissionPolicy = {
      async check() { return "deny"; },
      async resolveAsk() { return { decision: "deny" } as PermissionResolution; },
      async remember() {},
    };
    const events: AgentRuntimeEvent[] = [];
    const runtime = new AgentRuntime(makeClient(), new ToolRegistry([tool]), {
      permissionPolicy: policy,
    });

    const result = await runtime.runWithMessages(
      [{ role: "user", content: "hi" }],
      (e) => events.push(e),
    );

    expect(tool.call).not.toHaveBeenCalled();
    const toolMessage = result.messages.find((m) => m.role === "tool");
    expect(toolMessage?.content).toBe(DENY_TOOL_RESULT_TEXT);
    expect(events.find((e) => e.type === "tool_result")).toMatchObject({
      status: "error",
      output: DENY_TOOL_RESULT_TEXT,
    });
  });

  it("ask -> allow goes through normal tool path", async () => {
    const tool = new EchoTool();
    const policy: PermissionPolicy = {
      async check() { return "ask"; },
      async resolveAsk() { return { decision: "allow", remember: "session" }; },
      async remember() {},
    };
    const events: AgentRuntimeEvent[] = [];
    const runtime = new AgentRuntime(makeClient(), new ToolRegistry([tool]), {
      permissionPolicy: policy,
    });

    await runtime.runWithMessages(
      [{ role: "user", content: "hi" }],
      (e) => events.push(e),
    );

    expect(tool.call).toHaveBeenCalledTimes(1);
    expect(events.find((e) => e.type === "permission_decision")).toMatchObject({
      decision: "allow",
      scope: "session",
    });
    expect(events.find((e) => e.type === "tool_result")).toMatchObject({
      status: "success",
    });
  });

  it("ask -> deny short-circuits without invoking tool", async () => {
    const tool = new EchoTool();
    const policy: PermissionPolicy = {
      async check() { return "ask"; },
      async resolveAsk() { return { decision: "deny", reason: "no" }; },
      async remember() {},
    };
    const runtime = new AgentRuntime(makeClient(), new ToolRegistry([tool]), {
      permissionPolicy: policy,
    });

    await runtime.runWithMessages([{ role: "user", content: "hi" }]);

    expect(tool.call).not.toHaveBeenCalled();
  });
});

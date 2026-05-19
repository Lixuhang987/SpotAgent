import { describe, expect, it } from "vitest";
import type { LLMClient, LLMStreamEvent } from "../llm/LLMClient.ts";
import { ToolRegistry } from "../tools/ToolRegistry.ts";
import { AgentRuntime } from "./AgentRuntime.ts";
import type { AgentMessage } from "./AgentMessage.ts";

describe("AgentRuntime", () => {
  it("stops streaming and emits interrupted status when the run signal is aborted", async () => {
    let seenSignal: AbortSignal | undefined;
    const abortController = new AbortController();
    const client: LLMClient = {
      async *stream(_messages, _tools, options): AsyncIterable<LLMStreamEvent> {
        seenSignal = options?.signal;
        yield { type: "text_delta", text: "before abort" };
        abortController.abort();
        yield { type: "text_delta", text: " after abort" };
        yield {
          type: "message_end",
          message: { role: "assistant", content: "before abort after abort" },
        };
      },
    };
    const runtime = new AgentRuntime(client, new ToolRegistry());
    const events: string[] = [];

    await expect(
      runtime.runWithMessages(
        [{ role: "user", content: "hello" }],
        (event) => {
          if (event.type === "assistant_message_delta") events.push(event.payload.text);
          if (event.type === "assistant_message_end") events.push(event.payload.status);
        },
        { signal: abortController.signal },
      ),
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(seenSignal).toBe(abortController.signal);
    expect(events).toEqual(["before abort", "interrupted"]);
  });

  it("does not append tool results after the run signal is aborted during a tool call", async () => {
    const abortController = new AbortController();
    const client: LLMClient = {
      async *stream(): AsyncIterable<LLMStreamEvent> {
        yield {
          type: "tool_call",
          toolCall: { id: "tc-1", name: "slow.tool", arguments: {} },
        };
        yield {
          type: "message_end",
          message: { role: "assistant", content: "calling tool" },
          toolCalls: [{ id: "tc-1", name: "slow.tool", arguments: {} }],
        };
      },
    };
    const registry = new ToolRegistry();
    registry.register({
      name: "slow.tool",
      description: "slow tool",
      inputSchema: { type: "object", properties: {} },
      async call() {
        abortController.abort();
        return "late result";
      },
    });
    const runtime = new AgentRuntime(client, registry);
    const events: string[] = [];

    await expect(
      runtime.runWithMessages(
        [{ role: "user", content: "hello" }],
        (event) => {
          if (event.type === "tool_call") events.push("tool_call");
          if (event.type === "tool_result") events.push("tool_result");
          if (event.type === "assistant_message_end") events.push(event.payload.status);
        },
        { signal: abortController.signal },
      ),
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(events).toEqual(["completed", "tool_call"]);
  });
});

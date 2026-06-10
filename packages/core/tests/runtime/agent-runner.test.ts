import { describe, expect, it } from "vitest";
import { AgentRunner } from "../../src/runtime/AgentRunner.ts";

describe("AgentRunner", () => {
  it("consumes user_input and interrupt ops through the thread port", async () => {
    const events: string[] = [];
    const runner = new AgentRunner({
      config: {
        model: "test-model",
        provider: "test-provider",
        workspaceId: null,
        actionBinding: null,
        maxTimes: 1,
      },
      thread: {
        threadId: "thread-1",
        async getMessages() {
          return [];
        },
        async recordUserInput(op) {
          events.push(`record:${op.type}`);
          return { messageId: op.opId };
        },
        async emit(event) {
          events.push(`emit:${event.type}`);
        },
        async waitForPendingSummaries() {
          events.push("wait");
        },
      },
      rx_sub: (async function* () {
        yield {
          type: "user_input",
          opId: "op-1",
          timestamp: "2026-06-10T00:00:00.000Z",
          payload: {
            items: [{ type: "text", id: "item-1", text: "hello" }],
          },
        };
        yield {
          type: "interrupt",
          opId: "op-2",
          timestamp: "2026-06-10T00:00:01.000Z",
          payload: { reason: "user" },
        };
      })(),
    });

    await runner.run();

    expect(events).toContain("record:user_input");
    expect(events).toContain("emit:user.message.recorded");
    expect(events).toContain("emit:turn.completed");
  });
});

import { describe, expect, it, vi } from "vitest";
import { AgentManager, createSharedAgentStatus, renderUserInputForRuntime, type Agent } from "../../src/agent/AgentManager.ts";

describe("AgentManager", () => {
  it("stores a thread agent and forwards op.submit to it", async () => {
    const manager = new AgentManager();
    const sent: string[] = [];
    manager.register("thread-1", makeAgent(async (op) => {
      sent.push(op.type);
    }));

    await manager.submit("thread-1", {
      type: "interrupt",
      opId: "op-1",
      timestamp: "2026-06-10T00:00:00.000Z",
      payload: { reason: "user" },
    });

    expect(sent).toEqual(["interrupt"]);
  });

  it("closes and removes registered agents on delete", async () => {
    const manager = new AgentManager();
    const close = vi.fn(async () => {});
    manager.register("thread-1", { ...makeAgent(), close });

    await expect(manager.delete("thread-1")).resolves.toBe(true);

    expect(close).toHaveBeenCalled();
    expect(manager.has("thread-1")).toBe(false);
  });

  it("renders UserInput into legacy runtime text and attachments at the bridge", () => {
    const rendered = renderUserInputForRuntime({
      type: "user_input",
      opId: "op-1",
      timestamp: "2026-06-10T00:00:00.000Z",
      payload: {
        items: [
          { type: "text", id: "text-1", text: "hello" },
          { type: "text_selection", id: "sel-1", text: "selected" },
          { type: "image", id: "img-1", mimeType: "image/png", base64: "abc" },
          { type: "skill", id: "skill-1", actionId: "skill/demo", title: "Demo", prompt: "run skill" },
        ],
      },
    });

    expect(rendered.text).toBe("hello\n\nrun skill");
    expect(rendered.attachments).toEqual([
      { kind: "text_selection", id: "sel-1", text: "selected" },
      { kind: "image", id: "img-1", mimeType: "image/png", base64: "abc" },
    ]);
  });
});

function makeAgent(send: Agent["tx_sub"]["send"] = async () => {}): Agent {
  return {
    tx_sub: { send },
    rx_event: (async function* emptyRuntimeEventStream() {})(),
    agent_status: createSharedAgentStatus(),
    session: {},
    close: vi.fn(async () => {}),
  };
}

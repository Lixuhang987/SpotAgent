import { randomUUID } from "node:crypto";
import type { Op, UserInputOp } from "@handagent/core/protocol/Op.ts";
import type { ThreadAttachment } from "@handagent/core/protocol/ThreadProtocolShared.ts";
import type { RunStatus } from "@handagent/core/protocol/ThreadProtocolShared.ts";

export type AgentTxSub = {
  send(op: Op): Promise<void>;
};

export type SharedAgentStatus = {
  get(): RunStatus;
  set(value: RunStatus): void;
};

export type Agent = {
  tx_sub: AgentTxSub;
  rx_event: AsyncIterable<unknown>;
  agent_status: SharedAgentStatus;
  session: unknown;
  close(): Promise<void>;
};

export class AgentManager {
  private readonly agents = new Map<string, Agent>();

  register(threadId: string, agent: Agent): void {
    this.agents.set(threadId, agent);
  }

  get(threadId: string): Agent | undefined {
    return this.agents.get(threadId);
  }

  has(threadId: string): boolean {
    return this.agents.has(threadId);
  }

  async submit(threadId: string, op: Op): Promise<boolean> {
    const agent = this.agents.get(threadId);
    if (!agent) {
      return false;
    }

    await agent.tx_sub.send(op);
    return true;
  }

  async interrupt(threadId: string): Promise<boolean> {
    return this.submit(threadId, {
      type: "interrupt",
      opId: randomUUID(),
      timestamp: new Date().toISOString(),
      payload: { reason: "user" },
    });
  }

  isRunning(threadId: string): boolean {
    return this.agents.get(threadId)?.agent_status.get() === "running";
  }

  async delete(threadId: string): Promise<boolean> {
    const agent = this.agents.get(threadId);
    if (!agent) {
      return false;
    }

    await agent.close();
    this.agents.delete(threadId);
    return true;
  }
}

export function renderUserInputForRuntime(op: UserInputOp): {
  text: string;
  attachments?: ThreadAttachment[];
} {
  const textParts: string[] = [];
  const attachments: ThreadAttachment[] = [];

  for (const item of op.payload.items) {
    switch (item.type) {
      case "text":
        textParts.push(item.text);
        break;
      case "text_selection":
        attachments.push({ kind: "text_selection", id: item.id, text: item.text });
        break;
      case "image":
        attachments.push({
          kind: "image",
          id: item.id,
          mimeType: item.mimeType,
          base64: item.base64,
        });
        break;
      case "skill":
        textParts.push(item.prompt);
        break;
    }
  }

  return {
    text: textParts.filter((value) => value.length > 0).join("\n\n"),
    ...(attachments.length > 0 ? { attachments } : {}),
  };
}

export function createSharedAgentStatus(initial: RunStatus = "idle"): SharedAgentStatus {
  let value = initial;
  return {
    get: () => value,
    set: (next) => {
      value = next;
    },
  };
}

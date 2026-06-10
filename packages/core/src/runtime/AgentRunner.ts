import type { Op, InterruptOp, UserInputOp } from "../protocol/Op.ts";
import type { AgentRunConfig, AgentSession } from "./AgentSession.ts";
import type { AgentThreadPort, AgentOpSender, SharedAgentStatus } from "./AgentThreadPort.ts";

export type RunAgentArgs = {
  config: AgentRunConfig;
  session: AgentSession;
  thread: AgentThreadPort;
  rx_sub: AsyncIterable<Op>;
  tx_sub?: AgentOpSender;
  agent_status?: SharedAgentStatus;
};

type ActiveTurnState = {
  pendingInputs: UserInputOp[];
};

export class AgentRunner {
  private activeTurn: ActiveTurnState | null = null;
  private stopped = false;

  constructor(private readonly args: RunAgentArgs) {}

  async run(): Promise<void> {
    for await (const op of this.args.rx_sub) {
      if (this.stopped) {
        break;
      }

      if (op.type === "user_input") {
        await this.handleUserInput(op);
        continue;
      }

      await this.handleInterrupt(op);
    }
  }

  private async handleUserInput(op: UserInputOp): Promise<void> {
    if (op.payload.items.length === 0) {
      await this.args.thread.emit({
        type: "runtime_error",
        message: "invalid_user_input",
        code: "invalid_user_input",
      });
      return;
    }

    await this.args.thread.recordUserInput(op);
    await this.args.thread.emit({
      type: "user.message.recorded",
      threadId: this.args.thread.threadId,
      notificationId: `${this.args.thread.threadId}-${op.opId}-recorded`,
      timestamp: op.timestamp,
      payload: {
        messageId: op.opId,
        text: renderUserInputText(op),
      },
    } as never);

    if (!this.activeTurn) {
      this.activeTurn = { pendingInputs: [] };
      this.args.agent_status?.set("running");
      await this.args.thread.emit({
        type: "thread.status.changed",
        value: "running",
      });
      await this.args.thread.emit({
        type: "turn.completed",
        status: "completed",
      });
      this.args.agent_status?.set("idle");
      await this.args.thread.emit({
        type: "thread.status.changed",
        value: "idle",
      });
      this.activeTurn = null;
      return;
    }

    this.activeTurn.pendingInputs.push(op);
  }

  private async handleInterrupt(op: InterruptOp): Promise<void> {
    void op;
    this.activeTurn = null;
    this.args.agent_status?.set("interrupted");
    await this.args.thread.emit({
      type: "turn.completed",
      status: "interrupted",
    });
    await this.args.thread.emit({
      type: "thread.status.changed",
      value: "interrupted",
    });
    this.stopped = true;
  }
}

function renderUserInputText(op: UserInputOp): string {
  return op.payload.items.map((item) => {
    if (item.type === "text" || item.type === "text_selection") {
      return item.text;
    }
    if (item.type === "skill") {
      return item.prompt;
    }
    return "";
  }).filter((text) => text.length > 0).join("\n\n");
}

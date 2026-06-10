import type { AgentMessage } from "./AgentMessage.ts";
import type { AgentRuntimeEvent } from "./AgentRuntime.ts";
import type { Op, UserInputOp } from "../protocol/Op.ts";
import type { RunStatus } from "../protocol/ThreadProtocolShared.ts";

export type AgentThreadLifecycleEvent =
  | {
      type: "thread.status.changed";
      value: RunStatus;
    }
  | {
      type: "turn.completed";
      status: "completed" | "interrupted" | "failed";
    };

export type RecordedUserInput = {
  messageId: string;
};

export type AgentThreadPort = {
  threadId: string;
  getMessages(): Promise<AgentMessage[]>;
  recordUserInput(op: UserInputOp): Promise<RecordedUserInput>;
  emit(event: AgentRuntimeEvent | AgentThreadLifecycleEvent): Promise<void>;
  waitForPendingSummaries(messages?: AgentMessage[]): Promise<void>;
};

export type AgentOpSender = {
  send(op: Op): Promise<void>;
};

export type SharedAgentStatus = {
  get(): RunStatus;
  set(value: RunStatus): void;
};

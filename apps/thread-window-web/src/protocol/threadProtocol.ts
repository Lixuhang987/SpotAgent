import type { ClientResponse } from "@handagent/core/protocol/ClientResponse.ts";
import type { ServerRequest } from "@handagent/core/protocol/ServerRequest.ts";
import type { ThreadCommand } from "@handagent/core/protocol/ThreadCommand.ts";
import type { ThreadNotification } from "@handagent/core/protocol/ThreadNotification.ts";
import type {
  ActionBindingPayload,
  ThreadAttachment,
} from "@handagent/core/protocol/ThreadProtocolShared.ts";

export type {
  ActionBindingPayload,
  RunStatus,
  ThreadAttachment,
  ThreadListEntry,
  ThreadSnapshotPayload,
  WorkspaceAskCandidate,
} from "@handagent/core/protocol/ThreadProtocolShared.ts";
export type { ClientResponse } from "@handagent/core/protocol/ClientResponse.ts";
export type { ServerRequest } from "@handagent/core/protocol/ServerRequest.ts";
export type { ThreadCommand } from "@handagent/core/protocol/ThreadCommand.ts";
export type { ThreadNotification } from "@handagent/core/protocol/ThreadNotification.ts";

export type InitialPromptPayload = {
  clientRequestId: string;
  text: string;
  attachments: ThreadAttachment[];
  actionBinding: ActionBindingPayload | null;
};

export function encodeThreadStart(input: {
  commandId: string;
  timestamp: string;
  workspaceId: string | null;
  actionBinding: ActionBindingPayload | null;
}): string {
  const command: ThreadCommand = {
    type: "thread.start",
    commandId: input.commandId,
    timestamp: input.timestamp,
    payload: {
      workspaceId: input.workspaceId,
      actionBinding: input.actionBinding,
    },
  };
  return encode(command);
}

export function encodeThreadResume(input: {
  threadId: string;
  commandId: string;
  timestamp: string;
}): string {
  return encode({
    type: "thread.resume",
    threadId: input.threadId,
    commandId: input.commandId,
    timestamp: input.timestamp,
  });
}

export function encodeThreadList(input: {
  commandId: string;
  timestamp: string;
}): string {
  return encode({
    type: "thread.list",
    commandId: input.commandId,
    timestamp: input.timestamp,
  });
}

export function encodeThreadDelete(input: {
  commandId: string;
  timestamp: string;
  targetThreadId: string;
}): string {
  return encode({
    type: "thread.delete",
    commandId: input.commandId,
    timestamp: input.timestamp,
    payload: { targetThreadId: input.targetThreadId },
  });
}

export function encodeTurnStart(input: {
  threadId: string;
  commandId: string;
  timestamp: string;
  text: string;
  attachments: ThreadAttachment[];
}): string {
  return encode({
    type: "turn.start",
    threadId: input.threadId,
    commandId: input.commandId,
    timestamp: input.timestamp,
    payload: {
      text: input.text,
      ...(input.attachments.length ? { attachments: input.attachments } : {}),
    },
  });
}

export function encodeTurnInterrupt(input: {
  threadId: string;
  commandId: string;
  timestamp: string;
}): string {
  return encode({
    type: "turn.interrupt",
    threadId: input.threadId,
    commandId: input.commandId,
    timestamp: input.timestamp,
  });
}

export function encodePermissionAnswer(input: {
  requestId: string;
  timestamp: string;
  decision: "allow" | "deny";
  scope?: "once" | "thread" | "always";
  reason?: string;
}): string {
  return encode({
    type: "permission.answered",
    requestId: input.requestId,
    timestamp: input.timestamp,
    payload: {
      decision: input.decision,
      ...(input.scope ? { scope: input.scope } : {}),
      ...(input.reason ? { reason: input.reason } : {}),
    },
  });
}

export function encodeWorkspaceAnswer(input: {
  requestId: string;
  timestamp: string;
  workspaceId?: string;
  cancelled?: boolean;
}): string {
  return encode({
    type: "workspace.answered",
    requestId: input.requestId,
    timestamp: input.timestamp,
    payload: {
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      ...(input.cancelled === undefined ? {} : { cancelled: input.cancelled }),
    },
  });
}

export function isThreadNotification(value: unknown): value is ThreadNotification {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }
  return [
    "thread.started",
    "thread.snapshot",
    "user.message.recorded",
    "turn.started",
    "assistant.delta",
    "tool.started",
    "tool.finished",
    "turn.completed",
    "thread.status.changed",
    "thread.listed",
    "thread.deleted",
    "thread.error",
  ].includes(value.type);
}

export function isServerRequest(value: unknown): value is ServerRequest {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }
  return value.type === "permission.requested" || value.type === "workspace.requested";
}

function encode(value: ThreadCommand | ClientResponse): string {
  return JSON.stringify(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

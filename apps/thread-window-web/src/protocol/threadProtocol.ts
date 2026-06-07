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

export function encodeWorkspaceList(input: {
  commandId: string;
  timestamp: string;
}): string {
  return encode({
    type: "workspace.list",
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

  switch (value.type) {
    case "thread.started":
      return hasNotificationBase(value)
        && hasThreadId(value)
        && isRecord(value.payload)
        && isOptionalString(value.commandId)
        && isNullableString(value.payload.preview);
    case "thread.snapshot":
      return hasNotificationBase(value)
        && hasThreadId(value)
        && isRecord(value.payload)
        && isOptionalString(value.commandId)
        && Array.isArray(value.payload.messages)
        && value.payload.messages.every(isConversationMessage)
        && isRunStatus(value.payload.status);
    case "user.message.recorded":
      return hasNotificationBase(value)
        && hasThreadId(value)
        && isRecord(value.payload)
        && typeof value.payload.messageId === "string"
        && typeof value.payload.text === "string";
    case "turn.started":
      return hasNotificationBase(value)
        && hasThreadId(value)
        && typeof value.turnId === "string"
        && isRecord(value.payload);
    case "assistant.delta":
      return hasNotificationBase(value)
        && hasThreadId(value)
        && typeof value.turnId === "string"
        && typeof value.itemId === "string"
        && isRecord(value.payload)
        && typeof value.payload.text === "string";
    case "tool.started":
      return hasNotificationBase(value)
        && hasThreadId(value)
        && typeof value.turnId === "string"
        && typeof value.itemId === "string"
        && isRecord(value.payload)
        && typeof value.payload.name === "string"
        && isRecord(value.payload.input);
    case "tool.finished":
      return hasNotificationBase(value)
        && hasThreadId(value)
        && typeof value.turnId === "string"
        && typeof value.itemId === "string"
        && isRecord(value.payload)
        && typeof value.payload.name === "string"
        && isToolFinishedStatus(value.payload.status)
        && typeof value.payload.output === "string";
    case "turn.completed":
      return hasNotificationBase(value)
        && hasThreadId(value)
        && typeof value.turnId === "string"
        && isRecord(value.payload)
        && isTurnCompletedStatus(value.payload.status);
    case "thread.status.changed":
      return hasNotificationBase(value)
        && hasThreadId(value)
        && isRecord(value.payload)
        && isRunStatus(value.payload.value);
    case "thread.listed":
      return hasNotificationBase(value)
        && isRecord(value.payload)
        && isOptionalString(value.commandId)
        && Array.isArray(value.payload.threads);
    case "thread.deleted":
      return hasNotificationBase(value)
        && isRecord(value.payload)
        && isOptionalString(value.commandId)
        && typeof value.payload.targetThreadId === "string"
        && isThreadDeletedStatus(value.payload.status);
    case "thread.error":
      return hasNotificationBase(value)
        && isRecord(value.payload)
        && isOptionalString(value.threadId)
        && isOptionalString(value.commandId)
        && typeof value.payload.message === "string";
    default:
      return false;
  }
}

export function isServerRequest(value: unknown): value is ServerRequest {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }

  switch (value.type) {
    case "permission.requested":
      return hasServerRequestBase(value)
        && isRecord(value.payload)
        && typeof value.payload.toolName === "string"
        && typeof value.payload.toolCallId === "string"
        && isRecord(value.payload.arguments);
    case "workspace.requested":
      return hasServerRequestBase(value)
        && isRecord(value.payload)
        && typeof value.payload.prompt === "string"
        && Array.isArray(value.payload.candidates);
    default:
      return false;
  }
}

function encode(value: ThreadCommand | ClientResponse): string {
  return JSON.stringify(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasNotificationBase(value: Record<string, unknown>): boolean {
  return typeof value.notificationId === "string"
    && typeof value.timestamp === "string";
}

function hasServerRequestBase(value: Record<string, unknown>): boolean {
  return typeof value.requestId === "string"
    && typeof value.threadId === "string"
    && typeof value.timestamp === "string";
}

function hasThreadId(value: Record<string, unknown>): boolean {
  return typeof value.threadId === "string";
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isNullableString(value: unknown): boolean {
  return value === null || typeof value === "string";
}

function isConversationMessage(value: unknown): boolean {
  return isRecord(value)
    && !Array.isArray(value)
    && typeof value.id === "string"
    && isConversationMessageRole(value.role)
    && typeof value.text === "string"
    && isConversationMessageStatus(value.status)
    && typeof value.createdAt === "string"
    && typeof value.updatedAt === "string"
    && isOptionalToolCall(value.toolCall)
    && isOptionalString(value.error);
}

function isConversationMessageRole(value: unknown): boolean {
  return value === "user"
    || value === "assistant"
    || value === "tool"
    || value === "system";
}

function isConversationMessageStatus(value: unknown): boolean {
  return value === "streaming"
    || value === "running"
    || value === "completed"
    || value === "failed";
}

function isOptionalToolCall(value: unknown): boolean {
  return value === undefined
    || (isRecord(value) && !Array.isArray(value) && typeof value.name === "string");
}

function isRunStatus(value: unknown): boolean {
  return value === "idle"
    || value === "running"
    || value === "failed"
    || value === "interrupted";
}

function isTurnCompletedStatus(value: unknown): boolean {
  return value === "completed"
    || value === "interrupted"
    || value === "failed";
}

function isThreadDeletedStatus(value: unknown): boolean {
  return value === "deleted" || value === "not_found";
}

function isToolFinishedStatus(value: unknown): boolean {
  return value === "completed" || value === "failed";
}

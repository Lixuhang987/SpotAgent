import type {
  ActionBindingPayload,
  ThreadAttachment,
} from "@handagent/core/protocol/ThreadProtocolShared.ts";

type InitialPromptPayload = {
  clientRequestId: string;
  text: string;
  attachments: ThreadAttachment[];
  actionBinding: ActionBindingPayload | null;
};

export type SwiftToElectronCommand =
  | {
      channel: "electron_shell";
      type: "thread_window.open_initial_prompt";
      commandId: string;
      payload: InitialPromptPayload;
    }
  | {
      channel: "electron_shell";
      type: "thread_window.open_history";
      commandId: string;
    }
  | {
      channel: "electron_shell";
      type: "thread_window.focus";
      commandId: string;
      threadId?: string | null;
    }
  | {
      channel: "electron_shell";
      type: "activity_window.show";
      commandId: string;
    }
  | {
      channel: "electron_shell";
      type: "shutdown";
      commandId: string;
    };

export type ElectronToSwiftEvent =
  | { channel: "electron_shell"; type: "electron.ready"; timestamp: string }
  | { channel: "electron_shell"; type: "thread_window.prepared"; timestamp: string }
  | { channel: "electron_shell"; type: "thread_window.prepare_failed"; message: string }
  | { channel: "electron_shell"; type: "command.ack"; commandId: string; ok: boolean; error?: string }
  | { channel: "electron_shell"; type: "thread_window.closed"; timestamp: string }
  | { channel: "electron_shell"; type: "renderer.crashed"; window: "thread" | "activity"; reason: string }
  | { channel: "electron_shell"; type: "agent_server.health"; available: boolean; message?: string };

export function parseCommand(raw: string): SwiftToElectronCommand {
  const value = JSON.parse(raw) as unknown;
  if (!isSwiftToElectronCommand(value)) {
    throw new Error("unsupported electron shell command");
  }
  return value;
}

export function encodeEvent(event: ElectronToSwiftEvent): string {
  return JSON.stringify(event);
}

export function isSwiftToElectronCommand(value: unknown): value is SwiftToElectronCommand {
  if (!isRecord(value) || value.channel !== "electron_shell" || typeof value.commandId !== "string") {
    return false;
  }
  switch (value.type) {
    case "thread_window.open_initial_prompt":
      return isRecord(value.payload)
        && typeof value.payload.clientRequestId === "string"
        && typeof value.payload.text === "string"
        && Array.isArray(value.payload.attachments)
        && value.payload.attachments.every(isThreadAttachment)
        && (value.payload.actionBinding === null || isActionBinding(value.payload.actionBinding));
    case "thread_window.open_history":
    case "activity_window.show":
    case "shutdown":
      return true;
    case "thread_window.focus":
      return value.threadId === undefined || value.threadId === null || typeof value.threadId === "string";
    default:
      return false;
  }
}

function isActionBinding(value: unknown): value is ActionBindingPayload {
  return isRecord(value)
    && typeof value.pluginId === "string"
    && typeof value.promptName === "string";
}

function isThreadAttachment(value: unknown): value is ThreadAttachment {
  if (!isRecord(value) || typeof value.id !== "string") {
    return false;
  }

  if (value.kind === "text_selection") {
    return typeof value.text === "string";
  }

  if (value.kind === "image") {
    return (value.mimeType === "image/png" || value.mimeType === "image/jpeg" || value.mimeType === "image/webp")
      && typeof value.base64 === "string";
  }

  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

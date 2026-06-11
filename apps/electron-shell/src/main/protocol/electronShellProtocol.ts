import type {
  ActionBindingPayload,
} from "@handagent/core/protocol/ThreadProtocolShared.ts";
import type { UserInput } from "@handagent/core/protocol/Op.ts";

export type InitialPromptPayload = {
  clientRequestId: string;
  userInput: UserInput;
  actionBinding: ActionBindingPayload | null;
};

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";
export type HostTheme = { preference: ThemePreference; resolved: ResolvedTheme };

export type OpenInitialPromptCommand = {
  channel: "electron_shell";
  type: "thread_window.open_initial_prompt";
  commandId: string;
  payload: InitialPromptPayload;
};

export type OpenHistoryCommand = {
  channel: "electron_shell";
  type: "thread_window.open_history";
  commandId: string;
};

export type FocusThreadWindowCommand = {
  channel: "electron_shell";
  type: "thread_window.focus";
  commandId: string;
  threadId?: string | null;
};

export type ShowActivityWindowCommand = {
  channel: "electron_shell";
  type: "activity_window.show";
  commandId: string;
};

export type ThemeChangedCommand = {
  channel: "electron_shell";
  type: "theme.changed";
  commandId: string;
  theme: HostTheme;
};

export type ShutdownCommand = {
  channel: "electron_shell";
  type: "shutdown";
  commandId: string;
};

export type SwiftToElectronCommand =
  | OpenInitialPromptCommand
  | OpenHistoryCommand
  | FocusThreadWindowCommand
  | ShowActivityWindowCommand
  | ThemeChangedCommand
  | ShutdownCommand;

export type ElectronReadyEvent = {
  channel: "electron_shell";
  type: "electron.ready";
  timestamp: string;
};

export type ThreadWindowPreparedEvent = {
  channel: "electron_shell";
  type: "thread_window.prepared";
  timestamp: string;
};

export type ThreadWindowPrepareFailedEvent = {
  channel: "electron_shell";
  type: "thread_window.prepare_failed";
  message: string;
};

export type CommandAckEvent = {
  channel: "electron_shell";
  type: "command.ack";
  commandId: string;
  ok: boolean;
  error?: string;
};

export type ThreadWindowClosedEvent = {
  channel: "electron_shell";
  type: "thread_window.closed";
  timestamp: string;
  wasVisible: boolean;
};

export type RendererCrashedEvent = {
  channel: "electron_shell";
  type: "renderer.crashed";
  window: "thread" | "activity";
  reason: string;
};

export type AgentServerHealthEvent = {
  channel: "electron_shell";
  type: "agent_server.health";
  available: boolean;
  message?: string;
};

export type ElectronToSwiftEvent =
  | ElectronReadyEvent
  | ThreadWindowPreparedEvent
  | ThreadWindowPrepareFailedEvent
  | CommandAckEvent
  | ThreadWindowClosedEvent
  | RendererCrashedEvent
  | AgentServerHealthEvent;

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
        && isUserInput(value.payload.userInput)
        && (value.payload.actionBinding === null || isActionBinding(value.payload.actionBinding));
    case "thread_window.open_history":
    case "activity_window.show":
    case "shutdown":
      return true;
    case "thread_window.focus":
      return value.threadId === undefined || value.threadId === null || typeof value.threadId === "string";
    case "theme.changed":
      return isHostTheme(value.theme);
    default:
      return false;
  }
}

function isHostTheme(value: unknown): value is HostTheme {
  return isRecord(value)
    && (value.preference === "light" || value.preference === "dark" || value.preference === "system")
    && (value.resolved === "light" || value.resolved === "dark");
}

function isActionBinding(value: unknown): value is ActionBindingPayload {
  return isRecord(value)
    && typeof value.pluginId === "string"
    && typeof value.promptName === "string";
}

function isUserInput(value: unknown): value is UserInput {
  return isRecord(value)
    && Array.isArray(value.items)
    && value.items.length > 0
    && value.items.every(isInputItem);
}

function isInputItem(value: unknown): boolean {
  if (!isRecord(value) || typeof value.id !== "string") {
    return false;
  }

  if (value.type === "text") {
    return typeof value.text === "string";
  }

  if (value.type === "text_selection") {
    return typeof value.text === "string";
  }

  if (value.type === "image") {
    return (value.mimeType === "image/png" || value.mimeType === "image/jpeg" || value.mimeType === "image/webp")
      && typeof value.base64 === "string";
  }

  if (value.type === "skill") {
    return typeof value.actionId === "string"
      && typeof value.title === "string"
      && typeof value.prompt === "string";
  }

  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

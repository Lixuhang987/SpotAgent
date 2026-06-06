import type { InitialPromptPayload } from "../protocol/threadProtocol.ts";

declare global {
  interface Window {
    handAgentThreadWindowConfig?: {
      threadWebSocketURL?: string;
    };
    handAgentReceiveInitialPrompt?: (payload: InitialPromptPayload) => void;
  }
}

export function getThreadWebSocketURL(): string {
  return window.handAgentThreadWindowConfig?.threadWebSocketURL ?? "ws://127.0.0.1:4317/api/thread";
}

export function installInitialPromptReceiver(handler: (payload: InitialPromptPayload) => void): void {
  window.handAgentReceiveInitialPrompt = handler;
}

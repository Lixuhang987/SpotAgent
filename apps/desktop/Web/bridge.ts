export const OPEN_PROMPT_EVENT = "handagent:openPrompt";
export const HOST_STATUS_EVENT = "handagent:hostStatus";
const DEFAULT_AGENT_SERVER_URL = "ws://127.0.0.1:4317/api/session";

export interface PromptState {
  visible: boolean;
  prefill: string;
}

export interface HostStatus {
  hotkeyAvailable: boolean;
  message: string;
}

declare global {
  interface Window {
    __HANDAGENT_SERVER_URL__?: string;
  }
}

export function openPrompt(prefill = ""): PromptState {
  return {
    visible: false,
    prefill,
  };
}

export function dispatchOpenPrompt(prefill = ""): PromptState {
  const state = {
    visible: true,
    prefill,
  };

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(OPEN_PROMPT_EVENT, {
        detail: state,
      })
    );
  }

  return state;
}

export function readAgentServerUrl(): string {
  if (typeof window === "undefined") {
    return DEFAULT_AGENT_SERVER_URL;
  }

  return window.__HANDAGENT_SERVER_URL__ ?? DEFAULT_AGENT_SERVER_URL;
}

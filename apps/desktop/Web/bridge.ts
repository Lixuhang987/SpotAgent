export const OPEN_PROMPT_EVENT = "handagent:openPrompt";
export const HOST_STATUS_EVENT = "handagent:hostStatus";

export interface PromptState {
  visible: boolean;
  prefill: string;
}

export interface HostStatus {
  hotkeyAvailable: boolean;
  message: string;
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

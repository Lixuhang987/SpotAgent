import { contextBridge } from "electron";

declare global {
  interface Window {
    handAgentThreadWindowConfig?: { threadWebSocketURL?: string };
    handAgentPendingInitialPrompts?: unknown[];
    handAgentReceiveInitialPrompt?: (payload: unknown) => void;
  }
}

const threadWebSocketURL = "ws://127.0.0.1:4317/api/thread";

contextBridge.executeInMainWorld({
  func: (url: string) => {
    window.handAgentThreadWindowConfig = { threadWebSocketURL: url };
    window.handAgentPendingInitialPrompts = Array.isArray(window.handAgentPendingInitialPrompts)
      ? window.handAgentPendingInitialPrompts
      : [];
    if (typeof window.handAgentReceiveInitialPrompt !== "function") {
      window.handAgentReceiveInitialPrompt = (payload: unknown) => {
        window.handAgentPendingInitialPrompts?.push(payload);
      };
    }
  },
  args: [threadWebSocketURL],
});

contextBridge.exposeInMainWorld("handAgentElectron", {
  phase: "phase-0",
});

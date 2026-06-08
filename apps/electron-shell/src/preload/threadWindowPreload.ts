import { contextBridge } from "electron";

declare global {
  interface Window {
    handAgentThreadWindowConfig?: { threadWebSocketURL?: string };
    handAgentPendingInitialPrompts?: unknown[];
    handAgentReceiveInitialPrompt?: (payload: unknown) => void;
  }
}

window.handAgentThreadWindowConfig = {
  threadWebSocketURL: "ws://127.0.0.1:4317/api/thread",
};
window.handAgentPendingInitialPrompts = Array.isArray(window.handAgentPendingInitialPrompts)
  ? window.handAgentPendingInitialPrompts
  : [];
window.handAgentReceiveInitialPrompt =
  typeof window.handAgentReceiveInitialPrompt === "function"
    ? window.handAgentReceiveInitialPrompt
    : (payload: unknown) => {
        window.handAgentPendingInitialPrompts?.push(payload);
      };

contextBridge.exposeInMainWorld("handAgentElectron", {
  phase: "phase-0",
});

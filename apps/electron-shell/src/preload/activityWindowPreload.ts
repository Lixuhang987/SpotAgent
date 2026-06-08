import { contextBridge, ipcRenderer } from "electron";

declare global {
  interface Window {
    handAgentActivityWindowConfig?: { activityWebSocketURL?: string };
    handAgentActivityWindow?: {
      focusThread(threadId: string | null): void;
    };
  }
}

const activityWebSocketURL = "ws://127.0.0.1:4317/api/activity";

contextBridge.executeInMainWorld({
  func: (url: string) => {
    window.handAgentActivityWindowConfig = { activityWebSocketURL: url };
  },
  args: [activityWebSocketURL],
});

contextBridge.exposeInMainWorld("handAgentActivityWindow", {
  focusThread(threadId: string | null): void {
    ipcRenderer.send("activity-window:focus-thread", threadId);
  },
});

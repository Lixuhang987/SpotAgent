import { contextBridge, ipcRenderer } from "electron";

type HostTheme = {
  preference: "light" | "dark" | "system";
  resolved: "light" | "dark";
};

declare global {
  interface Window {
    handAgentThreadWindowConfig?: { threadWebSocketURL?: string };
    handAgentTheme?: HostTheme;
    handAgentSubscribeThemeChange?: (handler: (theme: HostTheme) => void) => () => void;
    handAgentPendingInitialPrompts?: unknown[];
    handAgentReceiveInitialPrompt?: (payload: unknown) => void;
  }
}

const threadWebSocketURL = "ws://127.0.0.1:4317/api/thread";
const fallbackTheme: HostTheme = { preference: "system", resolved: "light" };
const initialTheme = readInitialTheme();

contextBridge.executeInMainWorld({
  func: (url: string, theme: HostTheme) => {
    window.handAgentThreadWindowConfig = { threadWebSocketURL: url };
    window.handAgentTheme = theme;
    window.handAgentPendingInitialPrompts = Array.isArray(window.handAgentPendingInitialPrompts)
      ? window.handAgentPendingInitialPrompts
      : [];
    if (typeof window.handAgentReceiveInitialPrompt !== "function") {
      window.handAgentReceiveInitialPrompt = (payload: unknown) => {
        window.handAgentPendingInitialPrompts?.push(payload);
      };
    }
  },
  args: [threadWebSocketURL, initialTheme],
});

contextBridge.exposeInMainWorld("handAgentSubscribeThemeChange", (handler: (theme: HostTheme) => void) => {
  const listener = (_event: unknown, theme: HostTheme) => {
    if (isHostTheme(theme)) {
      handler(theme);
    }
  };
  ipcRenderer.on("handagent:theme-changed", listener);
  return () => ipcRenderer.off("handagent:theme-changed", listener);
});

contextBridge.exposeInMainWorld("handAgentElectron", {
  phase: "phase-0",
});

function readInitialTheme(): HostTheme {
  const raw = process.argv.find((arg) => arg.startsWith("--handagent-theme="));
  if (!raw) {
    return fallbackTheme;
  }
  try {
    const decoded = decodeURIComponent(raw.slice("--handagent-theme=".length));
    const parsed = JSON.parse(decoded) as unknown;
    return isHostTheme(parsed) ? parsed : fallbackTheme;
  } catch {
    return fallbackTheme;
  }
}

function isHostTheme(value: unknown): value is HostTheme {
  return typeof value === "object"
    && value !== null
    && ["light", "dark", "system"].includes((value as HostTheme).preference)
    && ["light", "dark"].includes((value as HostTheme).resolved);
}

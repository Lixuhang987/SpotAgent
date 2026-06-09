export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export type HostTheme = {
  preference: ThemePreference;
  resolved: ResolvedTheme;
};

declare global {
  interface Window {
    handAgentTheme?: HostTheme;
    handAgentSubscribeThemeChange?: (handler: (theme: HostTheme) => void) => () => void;
  }
}

const fallbackTheme: HostTheme = { preference: "system", resolved: "light" };

export function getInitialTheme(): HostTheme {
  return isHostTheme(window.handAgentTheme) ? window.handAgentTheme : fallbackTheme;
}

export function applyThemeToDocument(theme: HostTheme): void {
  document.documentElement.dataset.theme = theme.resolved;
}

export function installThemeSubscription(handler: (theme: HostTheme) => void): () => void {
  if (typeof window.handAgentSubscribeThemeChange !== "function") {
    return () => {};
  }
  return window.handAgentSubscribeThemeChange(handler);
}

function isHostTheme(value: unknown): value is HostTheme {
  return typeof value === "object"
    && value !== null
    && (value as HostTheme).preference !== undefined
    && (value as HostTheme).resolved !== undefined
    && ["light", "dark", "system"].includes((value as HostTheme).preference)
    && ["light", "dark"].includes((value as HostTheme).resolved);
}

import { useEffect, useMemo, useState, type ReactElement } from "react";

import { ActivitySocketClient } from "./activitySocketClient.ts";
import {
  activityDisplay,
  initialActivityState,
  reduceActivityEvent,
  type ActivityState,
} from "./activityState.ts";

declare global {
  interface Window {
    handAgentActivityWindowConfig?: {
      activityWebSocketURL?: string;
    };
    handAgentTheme?: HostTheme;
    handAgentSubscribeThemeChange?: (handler: (theme: HostTheme) => void) => () => void;
    handAgentActivityWindow?: {
      focusThread(threadId: string | null): void;
    };
  }
}

type HostTheme = {
  preference: "light" | "dark" | "system";
  resolved: "light" | "dark";
};

function activityURL(): string {
  return (
    window.handAgentActivityWindowConfig?.activityWebSocketURL ??
    "ws://127.0.0.1:4317/api/activity"
  );
}

function initialTheme(): HostTheme {
  return isHostTheme(window.handAgentTheme)
    ? window.handAgentTheme
    : { preference: "system", resolved: "light" };
}

function applyTheme(theme: HostTheme): void {
  document.documentElement.dataset.theme = theme.resolved;
}

function isHostTheme(value: unknown): value is HostTheme {
  return typeof value === "object"
    && value !== null
    && ["light", "dark", "system"].includes((value as HostTheme).preference)
    && ["light", "dark"].includes((value as HostTheme).resolved);
}

export function App(): ReactElement {
  const [activity, setActivity] =
    useState<ActivityState>(initialActivityState);
  const display = useMemo(() => activityDisplay(activity), [activity]);

  useEffect(() => {
    applyTheme(initialTheme());
    return window.handAgentSubscribeThemeChange?.((theme) => applyTheme(theme)) ?? (() => {});
  }, []);

  useEffect(() => {
    const client = new ActivitySocketClient({
      url: activityURL(),
      onEvent: (event) => {
        setActivity((current) => reduceActivityEvent(current, event));
      },
    });

    client.connect();
    return () => client.close();
  }, []);

  return (
    <button
      className={`activity-bubble activity-bubble--${display.tone}`}
      type="button"
      onClick={() =>
        window.handAgentActivityWindow?.focusThread(
          activity.activeThreadId ?? null,
        )
      }
    >
      <span className="activity-bubble__pulse" aria-hidden="true" />
      <span className="activity-bubble__content">
        <span className="activity-bubble__label">{display.label}</span>
        <span className="activity-bubble__detail">{display.detail}</span>
      </span>
    </button>
  );
}

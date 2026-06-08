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
    handAgentActivityWindow?: {
      focusThread(threadId: string | null): void;
    };
  }
}

function activityURL(): string {
  return (
    window.handAgentActivityWindowConfig?.activityWebSocketURL ??
    "ws://127.0.0.1:4317/api/activity"
  );
}

export function App(): ReactElement {
  const [activity, setActivity] =
    useState<ActivityState>(initialActivityState);
  const display = useMemo(() => activityDisplay(activity), [activity]);

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

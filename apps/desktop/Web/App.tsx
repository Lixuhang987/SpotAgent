import { useEffect, useRef, useState } from "react";
import { BubbleList } from "./BubbleList";
import { PromptBox } from "./PromptBox";
import {
  HOST_STATUS_EVENT,
  OPEN_PROMPT_EVENT,
  openPrompt,
  readAgentServerUrl,
  type HostStatus,
  type PromptState,
} from "./bridge";
import {
  createEmptyConversationState,
  reduceSessionMessage,
  toBubbleItems,
  type ConversationState,
} from "./sessionState";
import type { SessionMessage } from "../../../packages/core/src/protocol/SessionMessage.ts";

function createSessionId() {
  return `session-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function createMessageId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function App() {
  const socketRef = useRef<WebSocket | null>(null);
  const [promptState, setPromptState] = useState<PromptState>(() => openPrompt());
  const [draft, setDraft] = useState(promptState.prefill);
  const [conversation, setConversation] = useState<ConversationState>(() =>
    createEmptyConversationState(createSessionId()),
  );
  const [hostStatus, setHostStatus] = useState<HostStatus>({
    hotkeyAvailable: false,
    message: "正在检查全局热键权限…",
  });
  const [socketStatus, setSocketStatus] = useState<"connecting" | "open" | "closed" | "error">(
    "connecting",
  );

  useEffect(() => {
    const handleOpenPrompt = (event: Event) => {
      const customEvent = event as CustomEvent<PromptState>;
      const nextState = {
        visible: true,
        prefill: customEvent.detail?.prefill ?? "",
      };
      setPromptState(nextState);
      setDraft(nextState.prefill);
    };

    const handleHostStatus = (event: Event) => {
      const customEvent = event as CustomEvent<HostStatus>;
      setHostStatus(customEvent.detail);
    };

    window.addEventListener(OPEN_PROMPT_EVENT, handleOpenPrompt);
    window.addEventListener(HOST_STATUS_EVENT, handleHostStatus);
    return () => {
      window.removeEventListener(OPEN_PROMPT_EVENT, handleOpenPrompt);
      window.removeEventListener(HOST_STATUS_EVENT, handleHostStatus);
    };
  }, []);

  useEffect(() => {
    const socket = new WebSocket(readAgentServerUrl());
    socketRef.current = socket;
    setSocketStatus("connecting");

    socket.addEventListener("open", () => {
      setSocketStatus("open");
      socket.send(
        JSON.stringify({
          type: "open_session",
          sessionId: conversation.sessionId,
          messageId: createMessageId(),
          timestamp: new Date().toISOString(),
          payload: {},
        } satisfies SessionMessage),
      );
    });

    socket.addEventListener("close", () => {
      setSocketStatus("closed");
    });

    socket.addEventListener("error", () => {
      setSocketStatus("error");
    });

    socket.addEventListener("message", (event) => {
      if (typeof event.data !== "string") {
        return;
      }

      try {
        const message = JSON.parse(event.data) as SessionMessage;
        setConversation((current) => reduceSessionMessage(current, message));
      } catch {
        // Ignore malformed websocket payloads.
      }
    });

    return () => {
      socketRef.current = null;
      socket.close();
    };
  }, []);

  const submitPrompt = () => {
    const nextPrompt = draft.trim();
    const socket = socketRef.current;

    if (!nextPrompt || socket?.readyState !== WebSocket.OPEN) {
      return;
    }

    const message: SessionMessage = {
      type: "user_message",
      sessionId: conversation.sessionId,
      messageId: createMessageId(),
      timestamp: new Date().toISOString(),
      payload: {
        text: nextPrompt,
        selection: null,
      },
    };

    setConversation((current) => reduceSessionMessage(current, message));
    socket.send(JSON.stringify(message));
    setPromptState({ visible: false, prefill: "" });
    setDraft("");
  };

  const bubbles = toBubbleItems(conversation);
  const statusMessage =
    conversation.status === "running"
      ? "正在运行任务…"
      : conversation.status === "failed" && conversation.error
        ? conversation.error
        : hostStatus.message;

  return (
    <main aria-label="desktop agent shell">
      <h1>Desktop Agent</h1>
      <p>{statusMessage}</p>
      <BubbleList items={bubbles} />
      {promptState.visible ? (
        <PromptBox
          value={draft}
          onChange={setDraft}
          onSubmit={submitPrompt}
          disabled={socketStatus !== "open"}
        />
      ) : null}
    </main>
  );
}

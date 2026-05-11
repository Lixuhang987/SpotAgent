import { useEffect, useState } from "react";
import { BubbleList, type BubbleItem } from "./BubbleList";
import {
  HOST_STATUS_EVENT,
  OPEN_PROMPT_EVENT,
  openPrompt,
  type HostStatus,
  type PromptState,
} from "./bridge";
import { AgentRuntime } from "../../../packages/core/src/runtime/AgentRuntime";
import { AgentSession } from "../../../packages/core/src/runtime/AgentSession";
import { ToolRegistry } from "../../../packages/core/src/tools/ToolRegistry";
import { VercelClient } from "../../../packages/core/src/llm/VercelClient";

export function App() {
  const [promptState, setPromptState] = useState<PromptState>(() => openPrompt());
  const [draft, setDraft] = useState(promptState.prefill);
  const [bubbles, setBubbles] = useState<BubbleItem[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [hostStatus, setHostStatus] = useState<HostStatus>({
    hotkeyAvailable: false,
    message: "正在检查全局热键权限…",
  });

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

  const submitPrompt = async () => {
    const nextPrompt = draft.trim();
    if (!nextPrompt || isRunning) {
      return;
    }

    const session = await AgentSession.open({ prompt: nextPrompt });
    setBubbles((current) => [
      ...current,
      {
        id: `user-${current.length + 1}`,
        text: session.prompt,
        kind: "user",
      },
    ]);
    setPromptState({ visible: false, prefill: "" });
    setDraft("");
    setIsRunning(true);

    try {
      const runtime = new AgentRuntime(new VercelClient(), new ToolRegistry());
      const result = await runtime.run(session.buildInitialUserMessage());
      setBubbles((current) => [
        ...current,
        ...result.bubbles.map((bubble) => ({
          ...bubble,
          kind: "assistant" as const,
        })),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "运行失败";
      setBubbles((current) => [
        ...current,
        {
          id: `assistant-error-${current.length + 1}`,
          text: message,
          kind: "assistant",
        },
      ]);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <main aria-label="desktop agent shell">
      <h1>Desktop Agent</h1>
      <p>{isRunning ? "正在运行任务…" : hostStatus.message}</p>
      <BubbleList items={bubbles.length > 0 ? bubbles : [{ id: "prompt-state", text: "按全局热键可唤起输入框" }]} />
      {promptState.visible ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submitPrompt();
          }}
        >
          <label>
            <span>Prompt</span>
            <input
              autoFocus
              placeholder="输入你要 Agent 执行的任务"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              disabled={isRunning}
            />
          </label>
        </form>
      ) : null}
    </main>
  );
}

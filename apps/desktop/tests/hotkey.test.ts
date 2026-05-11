import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchOpenPrompt, OPEN_PROMPT_EVENT, type PromptState } from "../Web/bridge";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("hotkey prompt bridge", () => {
  it("dispatches the openPrompt event with a visible payload", () => {
    const windowTarget = new EventTarget();
    const handler = vi.fn<(event: Event) => void>();
    windowTarget.addEventListener(OPEN_PROMPT_EVENT, handler);
    vi.stubGlobal("window", windowTarget);

    const state = dispatchOpenPrompt("已选内容");

    expect(state).toEqual({
      visible: true,
      prefill: "已选内容",
    });
    expect(handler).toHaveBeenCalledTimes(1);

    const event = handler.mock.calls[0]?.[0] as CustomEvent<PromptState>;
    expect(event.type).toBe(OPEN_PROMPT_EVENT);
    expect(event.detail).toEqual({
      visible: true,
      prefill: "已选内容",
    });
  });
});

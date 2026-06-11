import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installInitialPromptReceiver } from "../src/native/nativeConfig.ts";

describe("nativeConfig", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function nativeWindow() {
    return window as typeof window & {
      handAgentPendingInitialPrompts?: Array<{
        clientRequestId: string;
        userInput: {
          items: Array<{ type: "text"; id: string; text: string }>;
        };
        actionBinding: null;
      }>;
    };
  }

  it("flushes initial prompts queued before React installs the receiver", () => {
    nativeWindow().handAgentPendingInitialPrompts = [{
      clientRequestId: "prompt-1",
      userInput: {
        items: [{ type: "text", id: "text-1", text: "hello" }],
      },
      actionBinding: null,
    }];
    const received: string[] = [];

    installInitialPromptReceiver((payload) => {
      received.push(payload.userInput.items[0]?.type === "text" ? payload.userInput.items[0].text : "");
    });

    expect(received).toEqual(["hello"]);
    expect(nativeWindow().handAgentPendingInitialPrompts).toEqual([]);
  });
});

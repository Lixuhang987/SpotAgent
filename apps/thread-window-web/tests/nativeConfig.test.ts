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
        text: string;
        attachments: [];
        actionBinding: null;
      }>;
    };
  }

  it("flushes initial prompts queued before React installs the receiver", () => {
    nativeWindow().handAgentPendingInitialPrompts = [{
      clientRequestId: "prompt-1",
      text: "hello",
      attachments: [],
      actionBinding: null,
    }];
    const received: string[] = [];

    installInitialPromptReceiver((payload) => {
      received.push(payload.text);
    });

    expect(received).toEqual(["hello"]);
    expect(nativeWindow().handAgentPendingInitialPrompts).toEqual([]);
  });
});

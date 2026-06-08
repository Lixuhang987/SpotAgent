import { describe, expect, it, vi } from "vitest";
import { handleActivityWindowFocusThreadIpc } from "../../src/main/activityWindowIpc.js";

describe("handleActivityWindowFocusThreadIpc", () => {
  it("forwards string and null thread ids from the activity window", () => {
    const activitySender = { id: 1 };
    const runtime = { handleActivityWindowFocusRequest: vi.fn() };

    handleActivityWindowFocusThreadIpc(
      { sender: activitySender },
      "thread-1",
      { activityWebContents: () => activitySender, runtime },
    );
    handleActivityWindowFocusThreadIpc(
      { sender: activitySender },
      null,
      { activityWebContents: () => activitySender, runtime },
    );

    expect(runtime.handleActivityWindowFocusRequest).toHaveBeenCalledWith("thread-1");
    expect(runtime.handleActivityWindowFocusRequest).toHaveBeenCalledWith(null);
  });

  it("ignores messages from other renderer senders", () => {
    const runtime = { handleActivityWindowFocusRequest: vi.fn() };

    handleActivityWindowFocusThreadIpc(
      { sender: { id: 2 } },
      "thread-1",
      { activityWebContents: () => ({ id: 1 }), runtime },
    );

    expect(runtime.handleActivityWindowFocusRequest).not.toHaveBeenCalled();
  });

  it("ignores malformed thread ids from the activity window", () => {
    const activitySender = { id: 1 };
    const runtime = { handleActivityWindowFocusRequest: vi.fn() };

    handleActivityWindowFocusThreadIpc(
      { sender: activitySender },
      { threadId: "thread-1" },
      { activityWebContents: () => activitySender, runtime },
    );

    expect(runtime.handleActivityWindowFocusRequest).not.toHaveBeenCalled();
  });
});

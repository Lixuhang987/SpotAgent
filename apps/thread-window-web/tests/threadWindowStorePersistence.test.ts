import { afterEach, describe, expect, it, vi } from "vitest";

describe("threadWindowStore workspace expansion persistence", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("loads persisted workspace expansion ids when the store initializes", async () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: vi.fn(() => JSON.stringify(["default", "qa-workspace"])),
        setItem: vi.fn(),
      },
    });

    const { createThreadWindowStore } = await import("../src/store/threadWindowStore.ts");

    expect(Array.from(createThreadWindowStore.getState().expandedWorkspaceIds)).toEqual([
      "default",
      "qa-workspace",
    ]);
  });
});

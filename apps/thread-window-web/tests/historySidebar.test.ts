import { describe, expect, it } from "vitest";
import { filterHistoryEntries } from "../src/components/HistorySidebar.tsx";
import type { ThreadListEntry } from "../src/protocol/threadProtocol.ts";

const history: ThreadListEntry[] = [
  {
    id: "thread-alpha",
    preview: "Read clipboard",
    createdAt: "2026-06-06T00:00:00.000Z",
    updatedAt: "2026-06-06T00:00:00.000Z",
    messageCount: 2,
  },
  {
    id: "thread-beta",
    preview: "Summarize workspace",
    createdAt: "2026-06-06T00:00:00.000Z",
    updatedAt: "2026-06-06T00:00:00.000Z",
    messageCount: 4,
  },
];

describe("filterHistoryEntries", () => {
  it("returns all entries for an empty query", () => {
    expect(filterHistoryEntries(history, " ")).toEqual(history);
  });

  it("matches preview text case-insensitively", () => {
    expect(filterHistoryEntries(history, "CLIP").map((entry) => entry.id)).toEqual(["thread-alpha"]);
  });

  it("matches thread id", () => {
    expect(filterHistoryEntries(history, "beta").map((entry) => entry.id)).toEqual(["thread-beta"]);
  });
});

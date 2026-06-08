import { describe, expect, it } from "vitest";
import type { ThreadListEntry } from "../src/protocol/threadProtocol.ts";
import { groupThreadsByWorkspace } from "../src/utils/groupThreads.ts";

const timestamp = "2026-06-09T00:00:00.000Z";

function thread(id: string, workspaceId: string | null, preview: string): ThreadListEntry {
  return {
    id,
    preview,
    workspaceId,
    createdAt: timestamp,
    updatedAt: timestamp,
    messageCount: 1,
  };
}

describe("groupThreadsByWorkspace", () => {
  it("sorts workspace groups by name and keeps default conversations separate", () => {
    const grouped = groupThreadsByWorkspace(
      [
        thread("thread-default", null, "default conversation"),
        thread("thread-qa", "qa-workspace", "qa thread"),
        thread("thread-handagent", "handagent-test", "handAgent thread"),
        thread("thread-tmp", "tmp", "tmp thread"),
        thread("thread-workspace-default", "default", "default workspace thread"),
      ],
      [
        { id: "default", name: "default", rootPath: "/default" },
        { id: "tmp", name: "tmp", rootPath: "/tmp" },
        { id: "qa-workspace", name: "qa-workspace", rootPath: "/qa" },
        { id: "handagent-test", name: "handagent-test", rootPath: "/handagent" },
      ],
      "",
    );

    expect(grouped.workspaceGroups.map((group) => group.workspace.name)).toEqual([
      "default",
      "handagent-test",
      "qa-workspace",
      "tmp",
    ]);
    expect(grouped.workspaceGroups.map((group) => group.threads.map((item) => item.id))).toEqual([
      ["thread-workspace-default"],
      ["thread-handagent"],
      ["thread-qa"],
      ["thread-tmp"],
    ]);
    expect(grouped.defaultGroup.map((item) => item.id)).toEqual(["thread-default"]);
  });
});

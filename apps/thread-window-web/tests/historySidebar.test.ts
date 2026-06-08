import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ThreadWindowState } from "../src/store/threadWindowStore.ts";
import type { ThreadListEntry } from "../src/protocol/threadProtocol.ts";

const timestamp = "2026-06-09T00:00:00.000Z";

const mockState: Pick<
  ThreadWindowState,
  "workspaces" | "expandedWorkspaceIds" | "searchQuery" | "setSearchQuery" | "toggleWorkspaceExpanded"
> = {
  workspaces: [
    {
      id: "workspace-1",
      name: "Project workspace",
      rootPath: "/tmp/project",
    },
  ],
  expandedWorkspaceIds: new Set(["workspace-1"]),
  searchQuery: "",
  setSearchQuery: vi.fn(),
  toggleWorkspaceExpanded: vi.fn(),
};

vi.mock("../src/store/threadWindowStore.ts", () => ({
  createThreadWindowStore: <T,>(selector: (state: typeof mockState) => T) => selector(mockState),
}));

const { HistorySidebar } = await import("../src/components/HistorySidebar.tsx");

describe("HistorySidebar", () => {
  beforeEach(() => {
    mockState.workspaces = [
      {
        id: "workspace-1",
        name: "Project workspace",
        rootPath: "/tmp/project",
      },
    ];
    mockState.expandedWorkspaceIds = new Set(["workspace-1"]);
    mockState.searchQuery = "";
    mockState.setSearchQuery = vi.fn();
    mockState.toggleWorkspaceExpanded = vi.fn();
  });

  it("provides Radix Accordion context for workspace groups", () => {
    const html = renderToStaticMarkup(
      React.createElement(HistorySidebar, {
        history: [],
        activeTabId: null,
        onOpenThread: vi.fn(),
        onDeleteThread: vi.fn(),
        onNewThread: vi.fn(),
      }),
    );

    expect(html).toContain("Project workspace");
    expect(html).toContain("/tmp/project");
  });

  it("renders workspace groups alphabetically before the default conversation group", () => {
    mockState.workspaces = [
      { id: "default", name: "default", rootPath: "/default" },
      { id: "tmp", name: "tmp", rootPath: "/tmp" },
      { id: "qa-workspace", name: "qa-workspace", rootPath: "/qa" },
      { id: "handagent-test", name: "handagent-test", rootPath: "/handagent" },
    ];
    mockState.expandedWorkspaceIds = new Set(["tmp", "qa-workspace", "handagent-test"]);
    const history: ThreadListEntry[] = [
      {
        id: "thread-default",
        preview: "default conversation",
        workspaceId: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        messageCount: 1,
      },
    ];

    const html = renderToStaticMarkup(
      React.createElement(HistorySidebar, {
        history,
        activeTabId: null,
        onOpenThread: vi.fn(),
        onDeleteThread: vi.fn(),
        onNewThread: vi.fn(),
      }),
    );

    const workspaceDefaultIndex = html.indexOf("default");
    const handagentIndex = html.indexOf("handagent-test");
    const qaIndex = html.indexOf("qa-workspace");
    const tmpIndex = html.indexOf("tmp");
    const defaultIndex = html.indexOf("默认对话");

    expect(workspaceDefaultIndex).toBeGreaterThanOrEqual(0);
    expect(handagentIndex).toBeGreaterThan(workspaceDefaultIndex);
    expect(qaIndex).toBeGreaterThan(handagentIndex);
    expect(tmpIndex).toBeGreaterThan(qaIndex);
    expect(defaultIndex).toBeGreaterThan(tmpIndex);
  });
});

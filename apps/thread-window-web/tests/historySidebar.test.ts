import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ThreadWindowState } from "../src/store/threadWindowStore.ts";

const mockState = {
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
} satisfies Pick<
  ThreadWindowState,
  "workspaces" | "expandedWorkspaceIds" | "searchQuery" | "setSearchQuery" | "toggleWorkspaceExpanded"
>;

vi.mock("../src/store/threadWindowStore.ts", () => ({
  createThreadWindowStore: <T,>(selector: (state: typeof mockState) => T) => selector(mockState),
}));

const { HistorySidebar } = await import("../src/components/HistorySidebar.tsx");

describe("HistorySidebar", () => {
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
});

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App.tsx";
import { Composer } from "../src/components/Composer.tsx";
import { HistorySidebar } from "../src/components/HistorySidebar.tsx";
import { MessageList } from "../src/components/MessageList.tsx";
import { TabBar } from "../src/components/TabBar.tsx";
import { createThreadWindowStore, type ThreadTabState } from "../src/store/threadWindowStore.ts";

function tabState(threadId: string): ThreadTabState {
  return {
    threadId,
    title: threadId,
    status: "idle",
    messages: [],
    pendingInitialPrompt: null,
    queuedComposerInputs: [],
    queuedInputDispatchPending: false,
    permissionRequests: [],
    workspaceRequests: [],
    errorMessage: null,
  };
}

function render(element: React.ReactElement) {
  return renderToStaticMarkup(element);
}

beforeEach(() => {
  vi.stubGlobal("window", {
    innerWidth: 1024,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    handAgentThreadWindowConfig: {},
    handAgentPendingInitialPrompts: [],
  });
  createThreadWindowStore.setState({
    connectionState: "connected",
    windowErrorMessage: null,
    history: [],
    tabs: {},
    activeTabId: null,
    pendingInitialPrompts: {},
    processedNotificationIds: {},
    workspaces: [],
    expandedWorkspaceIds: new Set(),
    searchQuery: "",
  });
});

describe("ThreadWindow scroll containers", () => {
  it("locks the app shell to the viewport without using viewport-width sizing", () => {
    createThreadWindowStore.setState({
      tabs: { "thread-1": tabState("thread-1") },
      activeTabId: "thread-1",
    });

    const html = render(React.createElement(App));

    expect(html).toContain("grid h-screen w-full max-w-full overflow-hidden");
    expect(html).toContain('data-thread-window-error-slot="true"');
    expect(html).not.toContain("w-screen");
    expect(html).not.toContain("min-h-screen");
  });

  it("keeps the history chrome fixed while only the thread list scrolls", () => {
    const html = render(
      React.createElement(HistorySidebar, {
        history: [],
        activeTabId: null,
        onOpenThread: vi.fn(),
        onDeleteThread: vi.fn(),
        onNewThread: vi.fn(),
      }),
    );

    expect(html).toContain("h-screen min-h-0");
    expect(html).toContain("flex-1 min-h-0");
    expect(html).toContain("overflow-y-auto overflow-x-hidden");
  });

  it("uses the message list as the only conversation scroll container", () => {
    const html = render(
      React.createElement(MessageList, {
        messages: [
          {
            id: "message-1",
            role: "assistant",
            text: "A long assistant reply should wrap inside the conversation column.",
          },
        ],
        errorMessage: null,
      }),
    );

    expect(html).toContain("overflow-y-auto overflow-x-hidden");
  });

  it("renders queued composer input above the input bar", () => {
    const html = render(
      React.createElement(Composer, {
        disabled: false,
        stopDisabled: false,
        queuedInputs: [
          { text: "排队的后续问题 1", attachments: [] },
          { text: "排队的后续问题 2", attachments: [] },
        ],
        onSubmit: vi.fn(),
        onStop: vi.fn(),
        onRemoveQueuedInput: vi.fn(),
      }),
    );

    expect(html).toContain('data-queued-composer-panel="true"');
    expect(html).toContain("排队的后续问题 1");
    expect(html).toContain("排队的后续问题 2");
    expect(html).toContain('aria-label="移除排队输入 1"');
  });

  it("lets only the tab strip scroll horizontally", () => {
    const tabs = Array.from({ length: 8 }, (_, index) => tabState(`thread-${index + 1}`));

    const html = render(
      React.createElement(TabBar, {
        tabs,
        activeTabId: "thread-1",
        onActivate: vi.fn(),
        onClose: vi.fn(),
      }),
    );

    expect(html).toContain("w-full max-w-full");
    expect(html).toContain("overflow-x-auto overflow-y-hidden");
  });
});

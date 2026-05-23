import { describe, expect, it } from "vitest";
import { MockLLMClient, mockLLMScenarios, type MockLLMScenario } from "../../src/llm/MockLLMClient";
import { AgentRuntime } from "../../src/runtime/AgentRuntime";
import type { AgentTool } from "../../src/tools/AgentTool";
import { ToolRegistry } from "../../src/tools/ToolRegistry";

class FakeFileWriteTool implements AgentTool {
  name = "file.write";
  description = "write file";
  inputSchema = {
    type: "object",
    properties: {
      workspaceId: { type: "string" },
      relativePath: { type: "string" },
      content: { type: "string" },
    },
    required: ["workspaceId", "relativePath", "content"],
    additionalProperties: false,
  } as const;

  calls: unknown[] = [];

  async call(input: unknown): Promise<unknown> {
    this.calls.push(input);
    return { ok: true, input };
  }
}

describe("MockLLMClient", () => {
  it("keeps scenario triggers unique and visible for QA maintenance", () => {
    const triggers = mockLLMScenarios.flatMap((scenario) => scenario.triggers);

    expect(new Set(triggers).size).toBe(triggers.length);
    expect(triggers).toEqual(expect.arrayContaining([
      "[mock:assistant-ok]",
      "[mock:clipboard-read]",
      "[mock:file-write]",
      "[mock:file-read]",
      "[mock:workspace-list]",
      "[mock:path-escape]",
      "[mock:symlink-escape]",
      "[mock:workspace-ask]",
      "[mock:permission-write]",
      "[mock:plugin-echo]",
      "[mock:plugin-workspace-read]",
      "[mock:plugin-workspace-write]",
      "[mock:plugin-workspace-escape]",
      "[mock:plugin-workspace-symlink]",
      "[mock:mcp-echo]",
      "[mock:computer-use-list-apps]",
      "[mock:computer-use-get-finder]",
      "[mock:ocr-invalid]",
      "[mock:ocr-sample]",
      "[mock:accessibility-frontmost]",
      "[mock:accessibility-set-frontmost]",
      "[mock:screen-display]",
      "[mock:screen-window]",
      "[mock:image-summary]",
      "[mock:llm-error]",
      "[mock:slow]",
      "[mock:slow-focus]",
      "[mock:unknown-tool]",
    ]));
  });

  it("returns a deterministic assistant response for the main QA chain", async () => {
    const client = new MockLLMClient();

    await expect(
      client.complete([{ role: "user", content: "run [mock:assistant-ok]" }], []),
    ).resolves.toEqual({
      message: {
        role: "assistant",
        content: "Mock assistant response: main chain is reachable.",
      },
      toolCalls: [],
    });
  });

  it("streams assistant text as deterministic deltas", async () => {
    const client = new MockLLMClient();

    const events = [];
    for await (const event of client.stream(
      [{ role: "user", content: "run [mock:assistant-ok]" }],
      [],
    )) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: "text_delta", text: "Mock " },
      { type: "text_delta", text: "assistant " },
      { type: "text_delta", text: "response: " },
      { type: "text_delta", text: "main " },
      { type: "text_delta", text: "chain " },
      { type: "text_delta", text: "is " },
      { type: "text_delta", text: "reachable." },
      {
        type: "message_end",
        message: {
          role: "assistant",
          content: "Mock assistant response: main chain is reachable.",
        },
        toolCalls: [],
      },
    ]);
  });

  it("streams tool calls before the message end event", async () => {
    const client = new MockLLMClient();

    const events = [];
    for await (const event of client.stream(
      [{ role: "user", content: "run [mock:file-write]" }],
      [],
    )) {
      events.push(event);
    }

    expect(events).toEqual([
      {
        type: "tool_call",
        toolCall: {
          id: "mock-file-write-1",
          name: "file.write",
          arguments: {
            workspaceId: "qa-workspace",
            relativePath: "hello.txt",
            content: "hello from MockLLMClient",
          },
        },
      },
      {
        type: "message_end",
        message: { role: "assistant", content: "" },
        toolCalls: [
          {
            id: "mock-file-write-1",
            name: "file.write",
            arguments: {
              workspaceId: "qa-workspace",
              relativePath: "hello.txt",
              content: "hello from MockLLMClient",
            },
          },
        ],
      },
    ]);
  });

  it("returns a real-shape file.write tool call and then a final answer", async () => {
    const client = new MockLLMClient();
    const first = await client.complete(
      [{ role: "user", content: "run [mock:file-write]" }],
      [],
    );

    expect(first).toEqual({
      message: { role: "assistant", content: "" },
      toolCalls: [
        {
          id: "mock-file-write-1",
          name: "file.write",
          arguments: {
            workspaceId: "qa-workspace",
            relativePath: "hello.txt",
            content: "hello from MockLLMClient",
          },
        },
      ],
    });

    await expect(
      client.complete(
        [
          { role: "user", content: "run [mock:file-write]" },
          { ...first.message, toolCalls: first.toolCalls },
          {
            role: "tool",
            toolCallId: "mock-file-write-1",
            name: "file.write",
            content: JSON.stringify({ ok: true }),
          },
        ],
        [],
      ),
    ).resolves.toEqual({
      message: {
        role: "assistant",
        content: "Mock file.write completed for hello.txt.",
      },
      toolCalls: [],
    });
  });

  it("returns deterministic platform QA tool calls", async () => {
    const client = new MockLLMClient();

    await expect(
      client.complete([{ role: "user", content: "run [mock:clipboard-read]" }], []),
    ).resolves.toMatchObject({
      toolCalls: [{ id: "mock-clipboard-read-1", name: "clipboard.read", arguments: {} }],
    });

    await expect(
      client.complete([{ role: "user", content: "run [mock:screen-display]" }], []),
    ).resolves.toMatchObject({
      toolCalls: [
        {
          id: "mock-screen-display-1",
          name: "screen.capture",
          arguments: { target: { kind: "display" } },
        },
      ],
    });

    await expect(
      client.complete([{ role: "user", content: "run [mock:screen-window] windowId=123" }], []),
    ).resolves.toMatchObject({
      toolCalls: [
        {
          id: "mock-screen-window-1",
          name: "screen.capture",
          arguments: { target: { kind: "window", windowId: 123 } },
        },
      ],
    });

    await expect(
      client.complete([{ role: "user", content: "run [mock:plugin-echo]" }], []),
    ).resolves.toMatchObject({
      toolCalls: [
        {
          id: "mock-plugin-echo-1",
          name: "plugin.echo",
          arguments: { message: "hello from MockLLMClient" },
        },
      ],
    });

    await expect(
      client.complete([{ role: "user", content: "run [mock:plugin-workspace-read]" }], []),
    ).resolves.toMatchObject({
      toolCalls: [
        {
          id: "mock-plugin-workspace-read-1",
          name: "plugin.echo",
          arguments: { workspaceId: "qa-workspace", relativePath: "plugin-input.txt" },
        },
      ],
    });

    await expect(
      client.complete([{ role: "user", content: "run [mock:plugin-workspace-write]" }], []),
    ).resolves.toMatchObject({
      toolCalls: [
        {
          id: "mock-plugin-workspace-write-1",
          name: "plugin.echo",
          arguments: { workspaceId: "qa-workspace", relativePath: "plugin-output.txt" },
        },
      ],
    });

    await expect(
      client.complete([{ role: "user", content: "run [mock:plugin-workspace-escape]" }], []),
    ).resolves.toMatchObject({
      toolCalls: [
        {
          id: "mock-plugin-workspace-escape-1",
          name: "plugin.echo",
          arguments: { workspaceId: "qa-workspace", relativePath: "../../etc/passwd" },
        },
      ],
    });

    await expect(
      client.complete([{ role: "user", content: "run [mock:plugin-workspace-symlink]" }], []),
    ).resolves.toMatchObject({
      toolCalls: [
        {
          id: "mock-plugin-workspace-symlink-1",
          name: "plugin.echo",
          arguments: { workspaceId: "qa-workspace", relativePath: "outside-link/plugin.txt" },
        },
      ],
    });

    await expect(
      client.complete([{ role: "user", content: "run [mock:mcp-echo]" }], []),
    ).resolves.toMatchObject({
      toolCalls: [
        {
          id: "mock-mcp-echo-1",
          name: "mcp.qa_echo.echo",
          arguments: { text: "hello from MockLLMClient" },
        },
      ],
    });

    await expect(
      client.complete([{ role: "user", content: "run [mock:computer-use-list-apps]" }], []),
    ).resolves.toMatchObject({
      toolCalls: [
        {
          id: "mock-computer-use-list-apps-1",
          name: "mcp.computer_use.list_apps",
          arguments: {},
        },
      ],
    });

    await expect(
      client.complete([{ role: "user", content: "run [mock:computer-use-get-finder]" }], []),
    ).resolves.toMatchObject({
      toolCalls: [
        {
          id: "mock-computer-use-get-finder-1",
          name: "mcp.computer_use.get_app_state",
          arguments: { app: "Finder" },
        },
      ],
    });

    await expect(
      client.complete([{ role: "user", content: "run [mock:ocr-sample]" }], []),
    ).resolves.toMatchObject({
      toolCalls: [
        {
          id: "mock-ocr-sample-1",
          name: "ocr.read",
          arguments: {
            mimeType: "image/png",
            language: "en-US",
            imageBase64: expect.any(String),
          },
        },
      ],
    });

    await expect(
      client.complete([{ role: "user", content: "run [mock:accessibility-frontmost]" }], []),
    ).resolves.toMatchObject({
      toolCalls: [
        {
          id: "mock-accessibility-frontmost-1",
          name: "accessibility.snapshot",
          arguments: { kind: "frontmost_app" },
        },
      ],
    });

    await expect(
      client.complete([{ role: "user", content: "run [mock:accessibility-set-frontmost]" }], []),
    ).resolves.toMatchObject({
      toolCalls: [
        {
          id: "mock-accessibility-set-frontmost-1",
          name: "accessibility.action",
          arguments: {
            target: { kind: "frontmost_app" },
            action: { kind: "set_value", value: "HANDAGENT_ACCESSIBILITY_SET_VALUE_20260521" },
          },
        },
      ],
    });
  });

  it("drives AgentRuntime through tool call, tool result, and final assistant answer", async () => {
    const tool = new FakeFileWriteTool();
    const runtime = new AgentRuntime(
      new MockLLMClient(),
      new ToolRegistry([tool]),
    );

    const result = await runtime.run("please [mock:file-write]");

    expect(tool.calls).toEqual([
      {
        workspaceId: "qa-workspace",
        relativePath: "hello.txt",
        content: "hello from MockLLMClient",
      },
    ]);
    expect(result.messages.at(-1)).toEqual({
      role: "assistant",
      content: "Mock file.write completed for hello.txt.",
    });
    expect(result).not.toHaveProperty("bubbles");
  });

  it("throws explicit errors for failure triggers and missing triggers", async () => {
    const client = new MockLLMClient();

    await expect(
      client.complete([{ role: "user", content: "run [mock:llm-error]" }], []),
    ).rejects.toThrow("MockLLMClient forced failure for QA.");

    await expect(
      client.complete([{ role: "user", content: "no trigger" }], []),
    ).rejects.toThrow("MockLLMClient could not find a mock trigger.");
  });

  it("keeps the slow-focus QA scenario response deterministic", async () => {
    const slowFocusScenario: MockLLMScenario = {
      ...mockLLMScenarios.find((scenario) => scenario.id === "slow-focus")!,
      complete: () => ({
        message: { role: "assistant", content: "Mock slow focus response completed." },
        toolCalls: [],
      }),
    };
    const client = new MockLLMClient([slowFocusScenario]);

    await expect(
      client.complete([{ role: "user", content: "run [mock:slow-focus]" }], []),
    ).resolves.toEqual({
      message: {
        role: "assistant",
        content: "Mock slow focus response completed.",
      },
      toolCalls: [],
    });
  });

  it("lets the slow-focus QA scenario abort without waiting for the full delay", async () => {
    const client = new MockLLMClient();
    const abortController = new AbortController();
    abortController.abort();

    await expect(
      client.complete(
        [{ role: "user", content: "run [mock:slow-focus]" }],
        [],
        { signal: abortController.signal },
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});

import { describe, expect, it } from "vitest";
import { MemoryBlobStore } from "../support/MemoryBlobStore.ts";
import {
  agentMessagesToRuntimeMessages,
  agentMessagesToConversation,
  composeUserContent,
  deriveTitle,
  toAuditEvent,
  toErrorMessage,
  toSessionMessage,
} from "../../src/MessageTranslator.ts";

describe("MessageTranslator", () => {
  it("translates assistant runtime events into session frames", () => {
    expect(
      toSessionMessage(
        "session-1",
        {
          type: "assistant_message_delta",
          messageId: "assistant-1",
          payload: { text: "你好" },
        },
        "2026-05-18T00:00:00.000Z",
      ),
    ).toEqual({
      type: "assistant_message_delta",
      sessionId: "session-1",
      messageId: "session-1-assistant-1",
      timestamp: "2026-05-18T00:00:00.000Z",
      payload: { text: "你好" },
    });
  });

  it("translates tool call and result events into tool_message frames", () => {
    expect(
      toSessionMessage(
        "session-tool",
        {
          type: "tool_call",
          toolCallId: "tc-1",
          toolName: "clipboard.read",
          input: {},
        },
        "2026-05-18T00:00:00.000Z",
      ),
    ).toEqual({
      type: "tool_message",
      sessionId: "session-tool",
      messageId: "session-tool-tc-1",
      timestamp: "2026-05-18T00:00:00.000Z",
      payload: { name: "clipboard.read", text: "{}", status: "running" },
    });
    expect(
      toSessionMessage(
        "session-tool",
        {
          type: "tool_result",
          toolCallId: "tc-1",
          toolName: "clipboard.read",
          status: "success",
          output: "hello",
          durationMs: 5,
        },
        "2026-05-18T00:00:00.000Z",
      ),
    ).toEqual({
      type: "tool_message",
      sessionId: "session-tool",
      messageId: "session-tool-tc-1",
      timestamp: "2026-05-18T00:00:00.000Z",
      payload: { name: "clipboard.read", text: "hello", status: "completed" },
    });
  });

  it("translates runtime events into audit events", () => {
    expect(
      toAuditEvent(
        {
          type: "tool_call",
          toolCallId: "tc-1",
          toolName: "file.read",
          input: { path: "/tmp/test.txt" },
        },
        "2026-05-17T00:00:00.000Z",
      ),
    ).toEqual({
      type: "tool_call",
      timestamp: "2026-05-17T00:00:00.000Z",
      toolCallId: "tc-1",
      toolName: "file.read",
      input: { path: "/tmp/test.txt" },
    });
    expect(
      toAuditEvent(
        {
          type: "permission_decision",
          toolCallId: "tc-1",
          toolName: "file.read",
          decision: "deny",
          scope: "session",
          reason: "No",
        },
        "2026-05-17T00:00:00.000Z",
      ),
    ).toEqual({
      type: "permission_request",
      timestamp: "2026-05-17T00:00:00.000Z",
      toolName: "file.read",
      action: "deny",
      granted: false,
    });
  });

  it("converts persisted agent messages into conversation messages", () => {
    expect(
      agentMessagesToConversation([
        { role: "user", content: "hello" },
        { role: "assistant", content: "world" },
        {
          role: "tool",
          toolCallId: "tc-1",
          name: "file.read",
          content: "file contents",
        },
      ]),
    ).toEqual([
      {
        id: "msg-0",
        role: "user",
        text: "hello",
        status: "completed",
        createdAt: "1970-01-01T00:00:00.000Z",
        updatedAt: "1970-01-01T00:00:00.000Z",
      },
      {
        id: "msg-1",
        role: "assistant",
        text: "world",
        status: "completed",
        createdAt: "1970-01-01T00:00:00.000Z",
        updatedAt: "1970-01-01T00:00:00.000Z",
      },
      {
        id: "msg-2",
        role: "tool",
        text: "file contents",
        status: "completed",
        createdAt: "1970-01-01T00:00:00.000Z",
        updatedAt: "1970-01-01T00:00:00.000Z",
        toolCall: { name: "file.read" },
      },
    ]);
  });

  it("composes user content and derives concise titles", async () => {
    const blobStore = new MemoryBlobStore();

    expect(
      await composeUserContent(
        "解释这段代码",
        [
          { kind: "text_selection", id: "a", text: "let x = 1" },
          {
            kind: "image",
            id: "img-1",
            mimeType: "image/png",
            base64: Buffer.from("png-bytes").toString("base64"),
          },
        ],
        blobStore,
      ),
    ).toBe(
      '解释这段代码\n\n[选区]\nlet x = 1\n\n[STUB id=blob-1 kind=image size=9 path="/tmp/blob-1.png"]\n[/STUB]',
    );
    await expect(blobStore.readContent("blob-1")).resolves.toEqual(Buffer.from("png-bytes"));
    expect(deriveTitle("  第一行标题\n第二行不要进入标题")).toBe("第一行标题");
    expect(deriveTitle("x".repeat(60))).toBe(`${"x".repeat(47)}...`);
  });

  it("expands persisted image stubs into runtime multimodal user content", async () => {
    const blobStore = new MemoryBlobStore();
    const persisted = await composeUserContent(
      "描述图片",
      [
        {
          kind: "image",
          id: "img-1",
          mimeType: "image/png",
          base64: Buffer.from("png-bytes").toString("base64"),
        },
      ],
      blobStore,
    );

    expect(agentMessagesToRuntimeMessages([{ role: "user", content: persisted }])).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "描述图片" },
          { type: "image", blobId: "blob-1", mimeType: "image/png" },
        ],
      },
    ]);
  });

  it("normalizes runtime errors", () => {
    expect(toErrorMessage(new Error("Missing apiKey"))).toBe("Missing apiKey");
    expect(toErrorMessage("boom")).toBe("Agent runtime failed.");
  });
});

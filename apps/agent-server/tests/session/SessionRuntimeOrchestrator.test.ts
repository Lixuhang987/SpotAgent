import { describe, expect, it } from "vitest";
import type { AgentMessage } from "@handagent/core/runtime/AgentMessage.ts";
import type { AgentRuntimeEvent } from "@handagent/core/runtime/AgentRuntime.ts";
import type { SessionEvent } from "@handagent/core/protocol/SessionEvent.ts";
import type { UserMessageAttachment } from "@handagent/core/protocol/SessionProtocolShared.ts";
import { InMemorySessionStore } from "@handagent/core/storage/index.ts";
import { MemoryBlobStore } from "../support/MemoryBlobStore.ts";
import { SessionPersistence } from "../../src/session/SessionPersistence.ts";
import { SessionRuntimeOrchestrator } from "../../src/session/SessionRuntimeOrchestrator.ts";

function createUserMessage(
  sessionId: string,
  text: string,
  messageId: string,
): {
  sessionId: string;
  messageId: string;
  timestamp: string;
  payload: {
    text: string;
    attachments?: UserMessageAttachment[];
  };
} {
  return {
    sessionId,
    messageId,
    timestamp: "2026-05-11T10:00:00.000Z",
    payload: { text },
  };
}

function eventTypes(events: SessionEvent[]): string[] {
  return events.map((event) => event.type);
}

function expectTypes(events: SessionEvent[], expected: SessionEvent["type"][]): void {
  expect(eventTypes(events)).toEqual(expected);
}

describe("SessionRuntimeOrchestrator", () => {
  it("pushes assistant events and persists final user + assistant messages", async () => {
    const pushed: SessionEvent[] = [];
    const runtimeCalls: AgentMessage[][] = [];
    const store = new InMemorySessionStore();
    const persistence = new SessionPersistence(
      store,
      () => "2026-05-11T00:00:00.000Z",
    );
    const orchestrator = new SessionRuntimeOrchestrator(
      {
        async runWithMessages(
          messages: AgentMessage[],
          onEvent: (event: AgentRuntimeEvent) => void,
        ) {
          runtimeCalls.push(messages.map((message) => ({ ...message })));
          onEvent({
            type: "assistant_message_start",
            messageId: "assistant-1",
            payload: { role: "assistant" },
          });
          onEvent({
            type: "assistant_message_delta",
            messageId: "assistant-1",
            payload: { text: "你好，我收到了。" },
          });
          onEvent({
            type: "assistant_message_end",
            messageId: "assistant-1",
            payload: { status: "completed" },
          });

          return {
            messages: [
              ...messages,
              {
                role: "assistant" as const,
                content: "你好，我收到了。",
              },
            ],
          };
        },
      },
      persistence,
      () => "2026-05-11T00:00:00.000Z",
    );

    await persistence.ensureSession("session-1");
    await orchestrator.handleUserMessage(
      createUserMessage("session-1", "第一句", "user-1"),
      (message) => pushed.push(message),
    );

    expect(runtimeCalls).toEqual([
      [
        {
          role: "user",
          content: "第一句",
        },
      ],
    ]);
    expectTypes(pushed, [
      "user_message_recorded",
      "turn_started",
      "assistant_delta",
      "turn_completed",
      "session_status_changed",
    ]);
    expect(pushed[0]).toMatchObject({
      type: "user_message_recorded",
      sessionId: "session-1",
      payload: { messageId: "user-1", text: "第一句" },
    });
    expect(pushed[1]).toMatchObject({
      type: "turn_started",
      sessionId: "session-1",
      turnId: "user-1",
    });
    expect(pushed[2]).toMatchObject({
      type: "assistant_delta",
      sessionId: "session-1",
      turnId: "user-1",
      itemId: "session-1-user-1-assistant-1",
      payload: { text: "你好，我收到了。" },
    });
    expect(pushed[3]).toMatchObject({
      type: "turn_completed",
      sessionId: "session-1",
      turnId: "user-1",
      payload: { status: "completed" },
    });
    expect(pushed[4]).toMatchObject({
      type: "session_status_changed",
      sessionId: "session-1",
      payload: { value: "idle" },
    });
    expect(await persistence.getMessages("session-1")).toEqual([
      {
        role: "user",
        content: "第一句",
      },
      {
        role: "assistant",
        content: "你好，我收到了。",
      },
    ]);
  });

  it("passes current session history and run options into runtime on later turns", async () => {
    const runtimeCalls: AgentMessage[][] = [];
    const seenRunOptions: Array<Record<string, unknown> | undefined> = [];
    const replies = ["第一轮回复", "第二轮回复"];
    const persistence = new SessionPersistence(
      new InMemorySessionStore(),
      () => "2026-05-11T00:00:00.000Z",
    );
    const orchestrator = new SessionRuntimeOrchestrator(
      {
        async runWithMessages(
          messages: AgentMessage[],
          _onEvent,
          runOptions?: Record<string, unknown>,
        ) {
          runtimeCalls.push(messages.map((message) => ({ ...message })));
          seenRunOptions.push(runOptions);
          const reply = replies[runtimeCalls.length - 1];
          return {
            messages: [
              ...messages,
              {
                role: "assistant" as const,
                content: reply,
              },
            ],
          };
        },
      },
      persistence,
      () => "2026-05-11T00:00:00.000Z",
    );

    await persistence.ensureSession("session-2");
    await orchestrator.handleUserMessage(
      createUserMessage("session-2", "第一句", "user-1"),
      () => {},
    );
    await orchestrator.handleUserMessage(
      createUserMessage("session-2", "第二句", "user-2"),
      () => {},
    );

    expect(runtimeCalls).toEqual([
      [
        {
          role: "user",
          content: "第一句",
        },
      ],
      [
        {
          role: "user",
          content: "第一句",
        },
        {
          role: "assistant",
          content: "第一轮回复",
        },
        {
          role: "user",
          content: "第二句",
        },
      ],
    ]);
    expect(seenRunOptions.map((options) => options?.sessionId)).toEqual([
      "session-2",
      "session-2",
    ]);
    expect(seenRunOptions.every((options) => options?.signal instanceof AbortSignal)).toBe(true);
  });

  it("waits for pending summaries before passing history into runtime", async () => {
    const runtimeCalls: AgentMessage[][] = [];
    const order: string[] = [];
    const persistence = new SessionPersistence(
      new InMemorySessionStore(),
      () => "2026-05-11T00:00:00.000Z",
    );
    const orchestrator = new SessionRuntimeOrchestrator(
      {
        async waitForPendingSummaries(messages: AgentMessage[] = []) {
          order.push("summary");
          messages.push({ role: "system", content: "summary ready" });
        },
        async runWithMessages(messages: AgentMessage[]) {
          order.push("runtime");
          runtimeCalls.push(messages.map((message) => ({ ...message })));
          return { messages };
        },
      },
      persistence,
      () => "2026-05-11T00:00:00.000Z",
      (sessionId) => {
        order.push(`refresh:${sessionId}`);
      },
    );

    await persistence.ensureSession("session-summary");
    await orchestrator.handleUserMessage(
      createUserMessage("session-summary", "第一句", "user-1"),
      () => {},
    );

    expect(runtimeCalls).toEqual([
      [
        { role: "user", content: "第一句" },
        { role: "system", content: "summary ready" },
      ],
    ]);
    expect(order).toEqual(["refresh:session-summary", "summary", "runtime"]);
  });

  it("passes image attachments to runtime as multimodal content while persisting stubs", async () => {
    const runtimeCalls: AgentMessage[][] = [];
    const blobStore = new MemoryBlobStore();
    const persistence = new SessionPersistence(
      new InMemorySessionStore(),
      () => "2026-05-11T00:00:00.000Z",
      blobStore,
    );
    const orchestrator = new SessionRuntimeOrchestrator(
      {
        async runWithMessages(messages: AgentMessage[]) {
          runtimeCalls.push(messages.map((message) => ({ ...message })));
          return { messages };
        },
      },
      persistence,
      () => "2026-05-11T00:00:00.000Z",
    );

    await persistence.ensureSession("session-image");
    await orchestrator.handleUserMessage(
      {
        ...createUserMessage("session-image", "描述图片", "user-1"),
        payload: {
          text: "描述图片",
          attachments: [
            {
              kind: "image",
              id: "img-1",
              mimeType: "image/png",
              base64: Buffer.from("png-bytes").toString("base64"),
            },
          ],
        },
      },
      () => {},
    );

    expect(runtimeCalls).toEqual([
      [
        {
          role: "user",
          content: [
            { type: "text", text: "描述图片" },
            { type: "image", blobId: "blob-1", mimeType: "image/png" },
          ],
        },
      ],
    ]);
    expect(await persistence.getMessages("session-image")).toEqual([
      {
        role: "user",
        content:
          '描述图片\n\n[STUB id=blob-1 kind=image size=9 path="/tmp/blob-1.png"]\n[/STUB]',
      },
    ]);
  });

  it("translates tool events into tool frames and records audit events", async () => {
    const pushed: SessionEvent[] = [];
    const store = new InMemorySessionStore();
    const persistence = new SessionPersistence(
      store,
      () => "2026-05-17T00:00:00.000Z",
    );
    const orchestrator = new SessionRuntimeOrchestrator(
      {
        async runWithMessages(messages: AgentMessage[], onEvent) {
          onEvent({
            type: "tool_call",
            toolCallId: "tc-1",
            toolName: "file.read",
            input: { path: "/tmp/test.txt" },
          });
          onEvent({
            type: "tool_result",
            toolCallId: "tc-1",
            toolName: "file.read",
            status: "success",
            output: "file contents here",
            durationMs: 12,
          });
          return {
            messages: [
              ...messages,
              {
                role: "assistant" as const,
                content: "reading file",
                toolCalls: [
                  { id: "tc-1", name: "file.read", arguments: { path: "/tmp/test.txt" } },
                ],
              },
              {
                role: "tool" as const,
                toolCallId: "tc-1",
                name: "file.read",
                content: "file contents here",
              },
            ],
          };
        },
      },
      persistence,
      () => "2026-05-17T00:00:00.000Z",
    );

    await persistence.ensureSession("session-tool");
    await orchestrator.handleUserMessage(
      createUserMessage("session-tool", "读取文件", "user-1"),
      (message) => pushed.push(message),
    );

    expectTypes(pushed, [
      "user_message_recorded",
      "turn_started",
      "tool_started",
      "tool_finished",
      "turn_completed",
      "session_status_changed",
    ]);
    expect(pushed[2]).toMatchObject({
      type: "tool_started",
      sessionId: "session-tool",
      turnId: "user-1",
      itemId: "session-tool-tc-1",
      payload: {
        name: "file.read",
        input: { path: "/tmp/test.txt" },
      },
    });
    expect(pushed[3]).toMatchObject({
      type: "tool_finished",
      sessionId: "session-tool",
      turnId: "user-1",
      itemId: "session-tool-tc-1",
      payload: {
        name: "file.read",
        output: "file contents here",
        status: "completed",
        durationMs: 12,
      },
    });
    const session = await persistence.getSession("session-tool");
    expect(session?.events).toEqual([
      {
        type: "tool_call",
        timestamp: "2026-05-17T00:00:00.000Z",
        toolCallId: "tc-1",
        toolName: "file.read",
        input: { path: "/tmp/test.txt" },
      },
      {
        type: "tool_result",
        timestamp: "2026-05-17T00:00:00.000Z",
        toolCallId: "tc-1",
        status: "success",
        output: "file contents here",
        durationMs: 12,
      },
    ]);
  });

  it("keeps assistant turn completion separate from later tool running frames", async () => {
    const pushed: SessionEvent[] = [];
    const store = new InMemorySessionStore();
    const persistence = new SessionPersistence(
      store,
      () => "2026-05-22T00:00:00.000Z",
    );
    const orchestrator = new SessionRuntimeOrchestrator(
      {
        async runWithMessages(messages: AgentMessage[], onEvent) {
          onEvent({
            type: "assistant_message_start",
            messageId: "assistant-1",
            payload: { role: "assistant" },
          });
          onEvent({
            type: "assistant_message_end",
            messageId: "assistant-1",
            payload: { status: "completed" },
          });
          onEvent({
            type: "tool_call",
            toolCallId: "tc-1",
            toolName: "workspace.list",
            input: {},
          });
          onEvent({
            type: "tool_result",
            toolCallId: "tc-1",
            toolName: "workspace.list",
            status: "success",
            output: "[]",
            durationMs: 12,
          });
          onEvent({
            type: "assistant_message_start",
            messageId: "assistant-2",
            payload: { role: "assistant" },
          });
          onEvent({
            type: "assistant_message_delta",
            messageId: "assistant-2",
            payload: { text: "done" },
          });
          onEvent({
            type: "assistant_message_end",
            messageId: "assistant-2",
            payload: { status: "completed" },
          });

          return {
            messages: [
              ...messages,
              {
                role: "assistant" as const,
                content: "",
                toolCalls: [
                  { id: "tc-1", name: "workspace.list", arguments: {} },
                ],
              },
              {
                role: "tool" as const,
                toolCallId: "tc-1",
                name: "workspace.list",
                content: "[]",
              },
              {
                role: "assistant" as const,
                content: "done",
              },
            ],
          };
        },
      },
      persistence,
      () => "2026-05-22T00:00:00.000Z",
    );

    await persistence.ensureSession("session-tool-running");
    await orchestrator.handleUserMessage(
      createUserMessage("session-tool-running", "列出工作区", "user-1"),
      (message) => pushed.push(message),
    );

    expectTypes(pushed, [
      "user_message_recorded",
      "turn_started",
      "tool_started",
      "tool_finished",
      "assistant_delta",
      "turn_completed",
      "session_status_changed",
    ]);
    expect(pushed[2]).toMatchObject({
      type: "tool_started",
      payload: { name: "workspace.list", input: {} },
    });
    expect(pushed[3]).toMatchObject({
      type: "tool_finished",
      payload: {
        name: "workspace.list",
        output: "[]",
        status: "completed",
        durationMs: 12,
      },
    });
    expect(pushed[4]).toMatchObject({
      type: "assistant_delta",
      itemId: "session-tool-running-user-1-assistant-2",
      payload: { text: "done" },
    });
    expect(pushed.some((message) => message.type === "session_error")).toBe(false);
  });

  it("aborts the active run and ignores later assistant/tool output", async () => {
    const pushed: SessionEvent[] = [];
    const store = new InMemorySessionStore();
    const persistence = new SessionPersistence(
      store,
      () => "2026-05-17T00:00:00.000Z",
    );
    let runtimeSignal: AbortSignal | undefined;
    let emitLateEvent: ((event: AgentRuntimeEvent) => void) | undefined;
    let finishRun: ((result: { messages: AgentMessage[] }) => void) | undefined;
    const runStarted = Promise.withResolvers<void>();
    const orchestrator = new SessionRuntimeOrchestrator(
      {
        runWithMessages(messages, onEvent, runOptions) {
          runtimeSignal = runOptions?.signal;
          emitLateEvent = onEvent;
          runStarted.resolve();
          return new Promise((resolve) => {
            finishRun = resolve;
          });
        },
      },
      persistence,
      () => "2026-05-17T00:00:00.000Z",
    );

    await persistence.ensureSession("session-interrupt");
    const runPromise = orchestrator.handleUserMessage(
      createUserMessage("session-interrupt", "停止这轮", "user-1"),
      (message) => pushed.push(message),
    );
    await runStarted.promise;

    orchestrator.interruptSession("session-interrupt", (message) => pushed.push(message));
    emitLateEvent?.({
      type: "assistant_message_delta",
      messageId: "assistant-1",
      payload: { text: "late assistant" },
    });
    emitLateEvent?.({
      type: "tool_result",
      toolCallId: "tc-1",
      toolName: "file.read",
      status: "success",
      output: "late tool",
      durationMs: 1,
    });
    finishRun?.({
      messages: [
        { role: "user", content: "停止这轮" },
        { role: "assistant", content: "late assistant" },
        { role: "tool", toolCallId: "tc-1", name: "file.read", content: "late tool" },
      ],
    });
    await runPromise;

    expect(runtimeSignal?.aborted).toBe(true);
    expectTypes(pushed, [
      "user_message_recorded",
      "turn_started",
      "turn_completed",
      "session_status_changed",
    ]);
    expect(pushed[2]).toMatchObject({
      type: "turn_completed",
      sessionId: "session-interrupt",
      turnId: "user-1",
      payload: { status: "interrupted" },
    });
    expect(pushed[3]).toMatchObject({
      type: "session_status_changed",
      sessionId: "session-interrupt",
      payload: { value: "interrupted" },
    });
    expect(await persistence.getMessages("session-interrupt")).toEqual([
      { role: "user", content: "停止这轮" },
    ]);
    expect((await persistence.getSession("session-interrupt"))?.events).toEqual([
      {
        type: "error",
        timestamp: "2026-05-17T00:00:00.000Z",
        message: "本轮运行已中断。",
        code: "run_interrupted",
      },
    ]);
  });

  it("reports running sessions and waits for interrupt cleanup", async () => {
    const pushed: SessionEvent[] = [];
    const persistence = new SessionPersistence(
      new InMemorySessionStore(),
      () => "2026-05-20T00:00:00.000Z",
    );
    let finishRun: ((result: { messages: AgentMessage[] }) => void) | undefined;
    const runStarted = Promise.withResolvers<void>();
    const orchestrator = new SessionRuntimeOrchestrator(
      {
        runWithMessages(_messages, _onEvent, runOptions) {
          runOptions?.signal.addEventListener("abort", () => {
            finishRun?.({
              messages: [
                { role: "user", content: "删除中" },
                { role: "assistant", content: "late" },
              ],
            });
          });
          runStarted.resolve();
          return new Promise((resolve) => {
            finishRun = resolve;
          });
        },
      },
      persistence,
      () => "2026-05-20T00:00:00.000Z",
    );

    await persistence.ensureSession("session-delete-running");
    const runPromise = orchestrator.handleUserMessage(
      createUserMessage("session-delete-running", "删除中", "user-1"),
      (message) => pushed.push(message),
    );
    await runStarted.promise;

    expect(orchestrator.isSessionRunning("session-delete-running")).toBe(true);
    await orchestrator.interruptAndWait("session-delete-running", (message) => pushed.push(message));
    await runPromise;

    expect(orchestrator.isSessionRunning("session-delete-running")).toBe(false);
    expect(await persistence.getMessages("session-delete-running")).toEqual([
      { role: "user", content: "删除中" },
    ]);
    expect((await persistence.getSession("session-delete-running"))?.events).toEqual([
      {
        type: "error",
        timestamp: "2026-05-20T00:00:00.000Z",
        message: "本轮运行已中断。",
        code: "run_interrupted",
      },
    ]);
    expectTypes(pushed, [
      "user_message_recorded",
      "turn_started",
      "turn_completed",
      "session_status_changed",
    ]);
    expect(pushed[2]).toMatchObject({
      type: "turn_completed",
      sessionId: "session-delete-running",
      turnId: "user-1",
      payload: { status: "interrupted" },
    });
    expect(pushed[3]).toMatchObject({
      type: "session_status_changed",
      sessionId: "session-delete-running",
      payload: { value: "interrupted" },
    });
  });

  it("times out interrupt cleanup when the runtime ignores abort", async () => {
    const pushed: SessionEvent[] = [];
    const persistence = new SessionPersistence(
      new InMemorySessionStore(),
      () => "2026-05-22T00:00:00.000Z",
    );
    const runStarted = Promise.withResolvers<void>();
    const orchestrator = new SessionRuntimeOrchestrator(
      {
        runWithMessages() {
          runStarted.resolve();
          return new Promise(() => {});
        },
      },
      persistence,
      () => "2026-05-22T00:00:00.000Z",
      () => {},
      { interruptWaitTimeoutMs: 20, interruptPollIntervalMs: 1 },
    );

    await persistence.ensureSession("session-stubborn-runtime");
    void orchestrator.handleUserMessage(
      createUserMessage("session-stubborn-runtime", "删除中", "user-1"),
      (message) => pushed.push(message),
    );
    await runStarted.promise;

    expect(orchestrator.isSessionRunning("session-stubborn-runtime")).toBe(true);
    const outcome = await Promise.race([
      orchestrator.interruptAndWait("session-stubborn-runtime", (message) => pushed.push(message))
        .then(() => "resolved"),
      new Promise((resolve) => setTimeout(() => resolve("timed-out"), 100)),
    ]);

    expect(outcome).toBe("resolved");
    expect(orchestrator.isSessionRunning("session-stubborn-runtime")).toBe(false);
    expectTypes(pushed, [
      "user_message_recorded",
      "turn_started",
      "turn_completed",
      "session_status_changed",
    ]);
    expect(pushed[2]).toMatchObject({
      type: "turn_completed",
      sessionId: "session-stubborn-runtime",
      turnId: "user-1",
      payload: { status: "interrupted" },
    });
    expect(pushed[3]).toMatchObject({
      type: "session_status_changed",
      sessionId: "session-stubborn-runtime",
      payload: { value: "interrupted" },
    });
    expect((await persistence.getSession("session-stubborn-runtime"))?.events).toEqual([
      {
        type: "error",
        timestamp: "2026-05-22T00:00:00.000Z",
        message: "本轮运行已中断。",
        code: "run_interrupted",
      },
    ]);
  });

  it("records interrupted instead of runtime error when an aborted run rejects without AbortError", async () => {
    const pushed: SessionEvent[] = [];
    const persistence = new SessionPersistence(
      new InMemorySessionStore(),
      () => "2026-05-22T00:00:00.000Z",
    );
    const runStarted = Promise.withResolvers<void>();
    let rejectRun: ((error: Error) => void) | undefined;
    const orchestrator = new SessionRuntimeOrchestrator(
      {
        runWithMessages(_messages, _onEvent, runOptions) {
          runOptions?.signal.addEventListener("abort", () => {
            rejectRun?.(new Error("provider closed stream after abort"));
          });
          runStarted.resolve();
          return new Promise((_, reject) => {
            rejectRun = reject;
          });
        },
      },
      persistence,
      () => "2026-05-22T00:00:00.000Z",
      () => {},
      { interruptWaitTimeoutMs: 20, interruptPollIntervalMs: 1 },
    );

    await persistence.ensureSession("session-non-abort-reject");
    const runPromise = orchestrator.handleUserMessage(
      createUserMessage("session-non-abort-reject", "停止这轮", "user-1"),
      (message) => pushed.push(message),
    );
    await runStarted.promise;

    await orchestrator.interruptAndWait(
      "session-non-abort-reject",
      (message) => pushed.push(message),
    );
    await runPromise;

    expectTypes(pushed, [
      "user_message_recorded",
      "turn_started",
      "turn_completed",
      "session_status_changed",
    ]);
    expect(pushed[2]).toMatchObject({
      type: "turn_completed",
      sessionId: "session-non-abort-reject",
      turnId: "user-1",
      payload: { status: "interrupted" },
    });
    expect(pushed[3]).toMatchObject({
      type: "session_status_changed",
      sessionId: "session-non-abort-reject",
      payload: { value: "interrupted" },
    });
    expect((await persistence.getSession("session-non-abort-reject"))?.events).toEqual([
      {
        type: "error",
        timestamp: "2026-05-22T00:00:00.000Z",
        message: "本轮运行已中断。",
        code: "run_interrupted",
      },
    ]);
  });

  it("pushes and records an error when runtime execution fails", async () => {

    const pushed: SessionEvent[] = [];
    const persistence = new SessionPersistence(
      new InMemorySessionStore(),
      () => "2026-05-11T00:00:00.000Z",
    );
    const orchestrator = new SessionRuntimeOrchestrator(
      {
        async runWithMessages() {
          throw new Error("Missing apiKey in ~/.spotAgent/settings.json. 请先在设置页完成模型配置。");
        },
      },
      persistence,
      () => "2026-05-11T00:00:00.000Z",
    );

    await persistence.ensureSession("session-4");
    await orchestrator.handleUserMessage(
      createUserMessage("session-4", "你好", "user-1"),
      (message) => pushed.push(message),
    );

    expectTypes(pushed, [
      "user_message_recorded",
      "turn_started",
      "session_error",
      "turn_completed",
      "session_status_changed",
    ]);
    expect(pushed[2]).toMatchObject({
      type: "session_error",
      sessionId: "session-4",
      payload: {
        message: "Missing apiKey in ~/.spotAgent/settings.json. 请先在设置页完成模型配置。",
      },
    });
    expect(pushed[3]).toMatchObject({
      type: "turn_completed",
      sessionId: "session-4",
      turnId: "user-1",
      payload: { status: "failed" },
    });
    expect(pushed[4]).toMatchObject({
      type: "session_status_changed",
      sessionId: "session-4",
      payload: { value: "failed" },
    });
    const session = await persistence.getSession("session-4");
    expect(session?.messages).toEqual([{ role: "user", content: "你好" }]);
    expect(session?.events).toEqual([
      {
        type: "error",
        timestamp: "2026-05-11T00:00:00.000Z",
        message: "Missing apiKey in ~/.spotAgent/settings.json. 请先在设置页完成模型配置。",
      },
    ]);
  });
});

describe("SessionRuntimeOrchestrator activation hook", () => {
  it("invokes beforeRun with the session id before runtime.runWithMessages", async () => {
    const calls: string[] = [];
    const persistence = new SessionPersistence(
      new InMemorySessionStore(),
      () => "2026-05-23T00:00:00.000Z",
    );
    const orchestrator = new SessionRuntimeOrchestrator(
      {
        async runWithMessages(messages: AgentMessage[]) {
          calls.push("runWithMessages");
          return { messages };
        },
      },
      persistence,
      () => "2026-05-23T00:00:00.000Z",
      async (sessionId) => {
        calls.push(`before:${sessionId}`);
      },
    );

    await persistence.ensureSession("s1");
    await orchestrator.handleUserMessage(
      createUserMessage("s1", "hi", "user-1"),
      () => {},
    );

    // beforeRun must fire before runWithMessages, and receive the correct sessionId
    expect(calls[0]).toBe("before:s1");
    expect(calls[1]).toBe("runWithMessages");
    expect(calls).toEqual(["before:s1", "runWithMessages"]);
  });

  it("resolves an isolated runtime for each session run", async () => {
    const calls: string[] = [];
    const persistence = new SessionPersistence(
      new InMemorySessionStore(),
      () => "2026-05-24T00:00:00.000Z",
    );
    const orchestrator = new SessionRuntimeOrchestrator(
      (sessionId) => {
        calls.push(`runtime:${sessionId}`);
        return {
          async waitForPendingSummaries() {
            calls.push(`summary:${sessionId}`);
          },
          async runWithMessages(
            messages: AgentMessage[],
            _onEvent,
            runOptions,
          ) {
            calls.push(`run:${sessionId}:${runOptions?.sessionId}`);
            return { messages, bubbles: [] };
          },
        };
      },
      persistence,
      () => "2026-05-24T00:00:00.000Z",
      (sessionId) => {
        calls.push(`before:${sessionId}`);
      },
    );

    await persistence.ensureSession("s1");
    await persistence.ensureSession("s2");
    await orchestrator.handleUserMessage(
      createUserMessage("s1", "one", "user-1"),
      () => {},
    );
    await orchestrator.handleUserMessage(
      createUserMessage("s2", "two", "user-2"),
      () => {},
    );

    expect(calls).toEqual([
      "before:s1",
      "runtime:s1",
      "summary:s1",
      "run:s1:s1",
      "before:s2",
      "runtime:s2",
      "summary:s2",
      "run:s2:s2",
    ]);
  });
});

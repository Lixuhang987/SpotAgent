import { describe, expect, it } from "vitest";
import type { AgentMessage } from "@handagent/core/runtime/AgentMessage.ts";
import type { AgentRuntimeEvent } from "@handagent/core/runtime/AgentRuntime.ts";
import type { ThreadNotification } from "@handagent/core/protocol/ThreadNotification.ts";
import type { ThreadAttachment } from "@handagent/core/protocol/ThreadProtocolShared.ts";
import { InMemoryThreadStore } from "@handagent/core/storage/index.ts";
import { MemoryBlobStore } from "../support/MemoryBlobStore.ts";
import { ThreadPersistence } from "../../src/thread/ThreadPersistence.ts";
import { ThreadRuntimeOrchestrator } from "../../src/thread/ThreadRuntimeOrchestrator.ts";

function createUserMessage(
  threadId: string,
  text: string,
  messageId: string,
): {
  threadId: string;
  messageId: string;
  timestamp: string;
  payload: {
    text: string;
    attachments?: ThreadAttachment[];
  };
} {
  return {
    threadId,
    messageId,
    timestamp: "2026-05-11T10:00:00.000Z",
    payload: { text },
  };
}

function eventTypes(events: ThreadNotification[]): string[] {
  return events.map((event) => event.type);
}

function expectTypes(events: ThreadNotification[], expected: ThreadNotification["type"][]): void {
  expect(eventTypes(events)).toEqual(expected);
}

describe("ThreadRuntimeOrchestrator", () => {
  it("pushes assistant events and persists final user + assistant messages", async () => {
    const pushed: ThreadNotification[] = [];
    const runtimeCalls: AgentMessage[][] = [];
    const store = new InMemoryThreadStore();
    const persistence = new ThreadPersistence(
      store,
      () => "2026-05-11T00:00:00.000Z",
    );
    const orchestrator = new ThreadRuntimeOrchestrator(
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

    await persistence.ensureThread("Thread-1");
    await orchestrator.handleUserMessage(
      createUserMessage("Thread-1", "第一句", "user-1"),
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
      "user.message.recorded",
      "turn.started",
      "assistant.delta",
      "turn.completed",
      "thread.status.changed",
    ]);
    expect(pushed[0]).toMatchObject({
      type: "user.message.recorded",
      threadId: "Thread-1",
      payload: { messageId: "user-1", text: "第一句" },
    });
    expect(pushed[1]).toMatchObject({
      type: "turn.started",
      threadId: "Thread-1",
      turnId: "user-1",
    });
    expect(pushed[2]).toMatchObject({
      type: "assistant.delta",
      threadId: "Thread-1",
      turnId: "user-1",
      itemId: "Thread-1-user-1-assistant-1",
      payload: { text: "你好，我收到了。" },
    });
    expect(pushed[3]).toMatchObject({
      type: "turn.completed",
      threadId: "Thread-1",
      turnId: "user-1",
      payload: { status: "completed" },
    });
    expect(pushed[4]).toMatchObject({
      type: "thread.status.changed",
      threadId: "Thread-1",
      payload: { value: "idle" },
    });
    expect(await persistence.getMessages("Thread-1")).toEqual([
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

  it("passes current thread history and run options into runtime on later turns", async () => {
    const runtimeCalls: AgentMessage[][] = [];
    const seenRunOptions: Array<Record<string, unknown> | undefined> = [];
    const replies = ["第一轮回复", "第二轮回复"];
    const persistence = new ThreadPersistence(
      new InMemoryThreadStore(),
      () => "2026-05-11T00:00:00.000Z",
    );
    const orchestrator = new ThreadRuntimeOrchestrator(
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

    await persistence.ensureThread("Thread-2");
    await orchestrator.handleUserMessage(
      createUserMessage("Thread-2", "第一句", "user-1"),
      () => {},
    );
    await orchestrator.handleUserMessage(
      createUserMessage("Thread-2", "第二句", "user-2"),
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
    expect(seenRunOptions.map((options) => options?.threadId)).toEqual([
      "Thread-2",
      "Thread-2",
    ]);
    expect(seenRunOptions.every((options) => options?.signal instanceof AbortSignal)).toBe(true);
  });

  it("waits for pending summaries before passing history into runtime", async () => {
    const runtimeCalls: AgentMessage[][] = [];
    const order: string[] = [];
    const persistence = new ThreadPersistence(
      new InMemoryThreadStore(),
      () => "2026-05-11T00:00:00.000Z",
    );
    const orchestrator = new ThreadRuntimeOrchestrator(
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
      (threadId) => {
        order.push(`refresh:${threadId}`);
      },
    );

    await persistence.ensureThread("Thread-summary");
    await orchestrator.handleUserMessage(
      createUserMessage("Thread-summary", "第一句", "user-1"),
      () => {},
    );

    expect(runtimeCalls).toEqual([
      [
        { role: "user", content: "第一句" },
        { role: "system", content: "summary ready" },
      ],
    ]);
    expect(order).toEqual(["refresh:Thread-summary", "summary", "runtime"]);
  });

  it("passes image attachments to runtime as multimodal content while persisting stubs", async () => {
    const runtimeCalls: AgentMessage[][] = [];
    const blobStore = new MemoryBlobStore();
    const persistence = new ThreadPersistence(
      new InMemoryThreadStore(),
      () => "2026-05-11T00:00:00.000Z",
      blobStore,
    );
    const orchestrator = new ThreadRuntimeOrchestrator(
      {
        async runWithMessages(messages: AgentMessage[]) {
          runtimeCalls.push(messages.map((message) => ({ ...message })));
          return { messages };
        },
      },
      persistence,
      () => "2026-05-11T00:00:00.000Z",
    );

    await persistence.ensureThread("Thread-image");
    await orchestrator.handleUserMessage(
      {
        ...createUserMessage("Thread-image", "描述图片", "user-1"),
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
    expect(await persistence.getMessages("Thread-image")).toEqual([
      {
        role: "user",
        content:
          '描述图片\n\n[STUB id=blob-1 kind=image size=9 path="/tmp/blob-1.png"]\n[/STUB]',
      },
    ]);
  });

  it("translates tool events into tool frames and records audit events", async () => {
    const pushed: ThreadNotification[] = [];
    const store = new InMemoryThreadStore();
    const persistence = new ThreadPersistence(
      store,
      () => "2026-05-17T00:00:00.000Z",
    );
    const orchestrator = new ThreadRuntimeOrchestrator(
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

    await persistence.ensureThread("Thread-tool");
    await orchestrator.handleUserMessage(
      createUserMessage("Thread-tool", "读取文件", "user-1"),
      (message) => pushed.push(message),
    );

    expectTypes(pushed, [
      "user.message.recorded",
      "turn.started",
      "tool.started",
      "tool.finished",
      "turn.completed",
      "thread.status.changed",
    ]);
    expect(pushed[2]).toMatchObject({
      type: "tool.started",
      threadId: "Thread-tool",
      turnId: "user-1",
      itemId: "Thread-tool-tc-1",
      payload: {
        name: "file.read",
        input: { path: "/tmp/test.txt" },
      },
    });
    expect(pushed[3]).toMatchObject({
      type: "tool.finished",
      threadId: "Thread-tool",
      turnId: "user-1",
      itemId: "Thread-tool-tc-1",
      payload: {
        name: "file.read",
        output: "file contents here",
        status: "completed",
        durationMs: 12,
      },
    });
    const Thread = await persistence.getThread("Thread-tool");
    expect(Thread?.events).toEqual([
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
    const pushed: ThreadNotification[] = [];
    const store = new InMemoryThreadStore();
    const persistence = new ThreadPersistence(
      store,
      () => "2026-05-22T00:00:00.000Z",
    );
    const orchestrator = new ThreadRuntimeOrchestrator(
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

    await persistence.ensureThread("Thread-tool-running");
    await orchestrator.handleUserMessage(
      createUserMessage("Thread-tool-running", "列出工作区", "user-1"),
      (message) => pushed.push(message),
    );

    expectTypes(pushed, [
      "user.message.recorded",
      "turn.started",
      "tool.started",
      "tool.finished",
      "assistant.delta",
      "turn.completed",
      "thread.status.changed",
    ]);
    expect(pushed[2]).toMatchObject({
      type: "tool.started",
      payload: { name: "workspace.list", input: {} },
    });
    expect(pushed[3]).toMatchObject({
      type: "tool.finished",
      payload: {
        name: "workspace.list",
        output: "[]",
        status: "completed",
        durationMs: 12,
      },
    });
    expect(pushed[4]).toMatchObject({
      type: "assistant.delta",
      itemId: "Thread-tool-running-user-1-assistant-2",
      payload: { text: "done" },
    });
    expect(pushed.some((message) => message.type === "thread.error")).toBe(false);
  });

  it("aborts the active run and ignores later assistant/tool output", async () => {
    const pushed: ThreadNotification[] = [];
    const store = new InMemoryThreadStore();
    const persistence = new ThreadPersistence(
      store,
      () => "2026-05-17T00:00:00.000Z",
    );
    let runtimeSignal: AbortSignal | undefined;
    let emitLateEvent: ((event: AgentRuntimeEvent) => void) | undefined;
    let finishRun: ((result: { messages: AgentMessage[] }) => void) | undefined;
    const runStarted = Promise.withResolvers<void>();
    const orchestrator = new ThreadRuntimeOrchestrator(
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

    await persistence.ensureThread("Thread-interrupt");
    const runPromise = orchestrator.handleUserMessage(
      createUserMessage("Thread-interrupt", "停止这轮", "user-1"),
      (message) => pushed.push(message),
    );
    await runStarted.promise;

    orchestrator.interruptThread("Thread-interrupt", (message) => pushed.push(message));
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
      "user.message.recorded",
      "turn.started",
      "turn.completed",
      "thread.status.changed",
    ]);
    expect(pushed[2]).toMatchObject({
      type: "turn.completed",
      threadId: "Thread-interrupt",
      turnId: "user-1",
      payload: { status: "interrupted" },
    });
    expect(pushed[3]).toMatchObject({
      type: "thread.status.changed",
      threadId: "Thread-interrupt",
      payload: { value: "interrupted" },
    });
    expect(await persistence.getMessages("Thread-interrupt")).toEqual([
      { role: "user", content: "停止这轮" },
    ]);
    expect((await persistence.getThread("Thread-interrupt"))?.events).toEqual([
      {
        type: "error",
        timestamp: "2026-05-17T00:00:00.000Z",
        message: "本轮运行已中断。",
        code: "run_interrupted",
      },
    ]);
  });

  it("reports running threads and waits for interrupt cleanup", async () => {
    const pushed: ThreadNotification[] = [];
    const persistence = new ThreadPersistence(
      new InMemoryThreadStore(),
      () => "2026-05-20T00:00:00.000Z",
    );
    let finishRun: ((result: { messages: AgentMessage[] }) => void) | undefined;
    const runStarted = Promise.withResolvers<void>();
    const orchestrator = new ThreadRuntimeOrchestrator(
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

    await persistence.ensureThread("Thread-delete-running");
    const runPromise = orchestrator.handleUserMessage(
      createUserMessage("Thread-delete-running", "删除中", "user-1"),
      (message) => pushed.push(message),
    );
    await runStarted.promise;

    expect(orchestrator.isThreadRunning("Thread-delete-running")).toBe(true);
    await orchestrator.interruptAndWait("Thread-delete-running", (message) => pushed.push(message));
    await runPromise;

    expect(orchestrator.isThreadRunning("Thread-delete-running")).toBe(false);
    expect(await persistence.getMessages("Thread-delete-running")).toEqual([
      { role: "user", content: "删除中" },
    ]);
    expect((await persistence.getThread("Thread-delete-running"))?.events).toEqual([
      {
        type: "error",
        timestamp: "2026-05-20T00:00:00.000Z",
        message: "本轮运行已中断。",
        code: "run_interrupted",
      },
    ]);
    expectTypes(pushed, [
      "user.message.recorded",
      "turn.started",
      "turn.completed",
      "thread.status.changed",
    ]);
    expect(pushed[2]).toMatchObject({
      type: "turn.completed",
      threadId: "Thread-delete-running",
      turnId: "user-1",
      payload: { status: "interrupted" },
    });
    expect(pushed[3]).toMatchObject({
      type: "thread.status.changed",
      threadId: "Thread-delete-running",
      payload: { value: "interrupted" },
    });
  });

  it("times out interrupt cleanup when the runtime ignores abort", async () => {
    const pushed: ThreadNotification[] = [];
    const persistence = new ThreadPersistence(
      new InMemoryThreadStore(),
      () => "2026-05-22T00:00:00.000Z",
    );
    const runStarted = Promise.withResolvers<void>();
    const orchestrator = new ThreadRuntimeOrchestrator(
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

    await persistence.ensureThread("Thread-stubborn-runtime");
    void orchestrator.handleUserMessage(
      createUserMessage("Thread-stubborn-runtime", "删除中", "user-1"),
      (message) => pushed.push(message),
    );
    await runStarted.promise;

    expect(orchestrator.isThreadRunning("Thread-stubborn-runtime")).toBe(true);
    const outcome = await Promise.race([
      orchestrator.interruptAndWait("Thread-stubborn-runtime", (message) => pushed.push(message))
        .then(() => "resolved"),
      new Promise((resolve) => setTimeout(() => resolve("timed-out"), 100)),
    ]);

    expect(outcome).toBe("resolved");
    expect(orchestrator.isThreadRunning("Thread-stubborn-runtime")).toBe(false);
    expectTypes(pushed, [
      "user.message.recorded",
      "turn.started",
      "turn.completed",
      "thread.status.changed",
    ]);
    expect(pushed[2]).toMatchObject({
      type: "turn.completed",
      threadId: "Thread-stubborn-runtime",
      turnId: "user-1",
      payload: { status: "interrupted" },
    });
    expect(pushed[3]).toMatchObject({
      type: "thread.status.changed",
      threadId: "Thread-stubborn-runtime",
      payload: { value: "interrupted" },
    });
    expect((await persistence.getThread("Thread-stubborn-runtime"))?.events).toEqual([
      {
        type: "error",
        timestamp: "2026-05-22T00:00:00.000Z",
        message: "本轮运行已中断。",
        code: "run_interrupted",
      },
    ]);
  });

  it("records interrupted instead of runtime error when an aborted run rejects without AbortError", async () => {
    const pushed: ThreadNotification[] = [];
    const persistence = new ThreadPersistence(
      new InMemoryThreadStore(),
      () => "2026-05-22T00:00:00.000Z",
    );
    const runStarted = Promise.withResolvers<void>();
    let rejectRun: ((error: Error) => void) | undefined;
    const orchestrator = new ThreadRuntimeOrchestrator(
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

    await persistence.ensureThread("Thread-non-abort-reject");
    const runPromise = orchestrator.handleUserMessage(
      createUserMessage("Thread-non-abort-reject", "停止这轮", "user-1"),
      (message) => pushed.push(message),
    );
    await runStarted.promise;

    await orchestrator.interruptAndWait(
      "Thread-non-abort-reject",
      (message) => pushed.push(message),
    );
    await runPromise;

    expectTypes(pushed, [
      "user.message.recorded",
      "turn.started",
      "turn.completed",
      "thread.status.changed",
    ]);
    expect(pushed[2]).toMatchObject({
      type: "turn.completed",
      threadId: "Thread-non-abort-reject",
      turnId: "user-1",
      payload: { status: "interrupted" },
    });
    expect(pushed[3]).toMatchObject({
      type: "thread.status.changed",
      threadId: "Thread-non-abort-reject",
      payload: { value: "interrupted" },
    });
    expect((await persistence.getThread("Thread-non-abort-reject"))?.events).toEqual([
      {
        type: "error",
        timestamp: "2026-05-22T00:00:00.000Z",
        message: "本轮运行已中断。",
        code: "run_interrupted",
      },
    ]);
  });

  it("pushes and records an error when runtime execution fails", async () => {

    const pushed: ThreadNotification[] = [];
    const persistence = new ThreadPersistence(
      new InMemoryThreadStore(),
      () => "2026-05-11T00:00:00.000Z",
    );
    const orchestrator = new ThreadRuntimeOrchestrator(
      {
        async runWithMessages() {
          throw new Error("Missing apiKey in ~/.spotAgent/settings.json. 请先在设置页完成模型配置。");
        },
      },
      persistence,
      () => "2026-05-11T00:00:00.000Z",
    );

    await persistence.ensureThread("Thread-4");
    await orchestrator.handleUserMessage(
      createUserMessage("Thread-4", "你好", "user-1"),
      (message) => pushed.push(message),
    );

    expectTypes(pushed, [
      "user.message.recorded",
      "turn.started",
      "thread.error",
      "turn.completed",
      "thread.status.changed",
    ]);
    expect(pushed[2]).toMatchObject({
      type: "thread.error",
      threadId: "Thread-4",
      payload: {
        message: "Missing apiKey in ~/.spotAgent/settings.json. 请先在设置页完成模型配置。",
      },
    });
    expect(pushed[3]).toMatchObject({
      type: "turn.completed",
      threadId: "Thread-4",
      turnId: "user-1",
      payload: { status: "failed" },
    });
    expect(pushed[4]).toMatchObject({
      type: "thread.status.changed",
      threadId: "Thread-4",
      payload: { value: "failed" },
    });
    const Thread = await persistence.getThread("Thread-4");
    expect(Thread?.messages).toEqual([{ role: "user", content: "你好" }]);
    expect(Thread?.events).toEqual([
      {
        type: "error",
        timestamp: "2026-05-11T00:00:00.000Z",
        message: "Missing apiKey in ~/.spotAgent/settings.json. 请先在设置页完成模型配置。",
      },
    ]);
  });
});

describe("ThreadRuntimeOrchestrator activation hook", () => {
  it("invokes beforeRun with the thread id before runtime.runWithMessages", async () => {
    const calls: string[] = [];
    const persistence = new ThreadPersistence(
      new InMemoryThreadStore(),
      () => "2026-05-23T00:00:00.000Z",
    );
    const orchestrator = new ThreadRuntimeOrchestrator(
      {
        async runWithMessages(messages: AgentMessage[]) {
          calls.push("runWithMessages");
          return { messages };
        },
      },
      persistence,
      () => "2026-05-23T00:00:00.000Z",
      async (threadId) => {
        calls.push(`before:${threadId}`);
      },
    );

    await persistence.ensureThread("s1");
    await orchestrator.handleUserMessage(
      createUserMessage("s1", "hi", "user-1"),
      () => {},
    );

    // beforeRun must fire before runWithMessages, and receive the correct threadId
    expect(calls[0]).toBe("before:s1");
    expect(calls[1]).toBe("runWithMessages");
    expect(calls).toEqual(["before:s1", "runWithMessages"]);
  });

  it("resolves an isolated runtime for each thread run", async () => {
    const calls: string[] = [];
    const persistence = new ThreadPersistence(
      new InMemoryThreadStore(),
      () => "2026-05-24T00:00:00.000Z",
    );
    const orchestrator = new ThreadRuntimeOrchestrator(
      (threadId) => {
        calls.push(`runtime:${threadId}`);
        return {
          async waitForPendingSummaries() {
            calls.push(`summary:${threadId}`);
          },
          async runWithMessages(
            messages: AgentMessage[],
            _onEvent,
            runOptions,
          ) {
            calls.push(`run:${threadId}:${runOptions?.threadId}`);
            return { messages, bubbles: [] };
          },
        };
      },
      persistence,
      () => "2026-05-24T00:00:00.000Z",
      (threadId) => {
        calls.push(`before:${threadId}`);
      },
    );

    await persistence.ensureThread("s1");
    await persistence.ensureThread("s2");
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

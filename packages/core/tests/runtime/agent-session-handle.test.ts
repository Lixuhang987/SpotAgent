import { describe, expect, it, vi } from "vitest";
import { AgentSessionHandle } from "../../src/runtime/AgentSessionHandle.ts";
import type { AgentMessage } from "../../src/runtime/AgentMessage.ts";
import type {
  AgentRunResult,
  AgentRuntimeEvent,
  AgentRuntimeRunOptions,
} from "../../src/runtime/AgentRuntime.ts";
import type { SessionCommand } from "../../src/protocol/SessionCommand.ts";
import type { SessionEvent } from "../../src/protocol/SessionEvent.ts";

type RuntimeLike = {
  runWithMessages(
    messages: AgentMessage[],
    onEvent: (event: AgentRuntimeEvent) => void,
    runOptions?: AgentRuntimeRunOptions,
  ): Promise<AgentRunResult>;
  waitForPendingSummaries?(messages?: AgentMessage[]): Promise<void>;
};

describe("AgentSessionHandle", () => {
  it("accepts turn_start and emits session events through a queue pair", async () => {
    const loadMessages = vi.fn(async () => [{ role: "user", content: "history" } satisfies AgentMessage]);
    const persistUserMessage = vi.fn(async () => {});
    const persistRunResult = vi.fn(async () => {});
    const runtime: RuntimeLike = {
      waitForPendingSummaries: vi.fn(async () => {}),
      runWithMessages: vi.fn(async (_messages, onEvent) => {
        onEvent({
          type: "assistant_message_start",
          messageId: "assistant-1",
          payload: { role: "assistant" },
        });
        onEvent({
          type: "assistant_message_delta",
          messageId: "assistant-1",
          payload: { text: "ok" },
        });
        onEvent({
          type: "tool_call",
          toolCallId: "tool-1",
          toolName: "echo",
          input: { value: "x" },
        });
        onEvent({
          type: "tool_result",
          toolCallId: "tool-1",
          toolName: "echo",
          status: "success",
          output: "{\"ok\":true}",
          durationMs: 12,
        });
        onEvent({
          type: "assistant_message_end",
          messageId: "assistant-1",
          payload: { status: "completed" },
        });
        return {
          messages: [
            { role: "user", content: "history" },
            { role: "assistant", content: "ok" },
          ],
        };
      }),
    };

    const handle = new AgentSessionHandle({
      sessionId: "s1",
      runtime,
      loadMessages,
      persistUserMessage,
      persistRunResult,
      now: () => "2026-06-03T00:00:00.000Z",
    });

    await handle.submit(turnStartCommand());

    const events = await readEvents(handle, 6);
    expect(events.map((event) => event.type)).toEqual([
      "user_message_recorded",
      "turn_started",
      "assistant_delta",
      "tool_started",
      "tool_finished",
      "turn_completed",
    ]);
    expect(events[2]).toMatchObject({
      type: "assistant_delta",
      turnId: "turn-1",
      itemId: "assistant-1",
      payload: { text: "ok" },
    });
    expect(events[3]).toMatchObject({
      type: "tool_started",
      turnId: "turn-1",
      itemId: "tool-1",
      payload: { name: "echo", input: { value: "x" } },
    });
    expect(events[4]).toMatchObject({
      type: "tool_finished",
      turnId: "turn-1",
      itemId: "tool-1",
      payload: {
        name: "echo",
        status: "completed",
        output: "{\"ok\":true}",
        durationMs: 12,
      },
    });
    const finalStatus = await handle.nextEvent();
    expect(finalStatus).toMatchObject({
      type: "session_status_changed",
      payload: { value: "idle" },
    });
    expect(loadMessages).toHaveBeenCalledWith("s1");
    expect(persistUserMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "s1",
        turnId: "turn-1",
        text: "hi",
      }),
    );
    expect(persistRunResult).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "s1",
        turnId: "turn-1",
      }),
    );
  });

  it("interrupts an active turn and emits interrupted completion", async () => {
    const runtime: RuntimeLike = {
      runWithMessages: async (_messages, _onEvent, runOptions) => {
        await waitForAbort(runOptions?.signal);
        throw abortError();
      },
    };
    const handle = new AgentSessionHandle({
      sessionId: "s1",
      runtime,
      loadMessages: async () => [],
      persistUserMessage: async () => {},
      persistRunResult: async () => {},
      now: () => "2026-06-03T00:00:00.000Z",
    });

    const runPromise = handle.submit(turnStartCommand());
    const firstEvents = await readEvents(handle, 2);
    expect(firstEvents.map((event) => event.type)).toEqual([
      "user_message_recorded",
      "turn_started",
    ]);

    await handle.submit(turnInterruptCommand());
    await runPromise;

    const completion = await handle.nextEvent();
    const status = await handle.nextEvent();
    expect(completion).toMatchObject({
      type: "turn_completed",
      payload: { status: "interrupted" },
    });
    expect(status).toMatchObject({
      type: "session_status_changed",
      payload: { value: "interrupted" },
    });
  });

  it("rejects a second turn while one is active", async () => {
    const runtime: RuntimeLike = {
      runWithMessages: async (_messages, _onEvent, runOptions) => {
        await waitForAbort(runOptions?.signal);
        throw abortError();
      },
    };
    const handle = new AgentSessionHandle({
      sessionId: "s1",
      runtime,
      loadMessages: async () => [],
      persistUserMessage: async () => {},
      persistRunResult: async () => {},
      now: () => "2026-06-03T00:00:00.000Z",
    });

    const runPromise = handle.submit(turnStartCommand());
    await readEvents(handle, 2);

    await expect(handle.submit(turnStartCommand("c2"))).rejects.toThrow(
      "Turn already running",
    );

    await handle.submit(turnInterruptCommand());
    await runPromise;
  });
});

async function readEvents(
  handle: AgentSessionHandle,
  count: number,
): Promise<SessionEvent[]> {
  const events: SessionEvent[] = [];
  for (let index = 0; index < count; index += 1) {
    events.push(await handle.nextEvent());
  }
  return events;
}

function turnStartCommand(commandId = "c1"): Extract<SessionCommand, { type: "turn_start" }> {
  return {
    type: "turn_start",
    sessionId: "s1",
    commandId,
    timestamp: "2026-06-03T00:00:00.000Z",
    payload: { text: "hi" },
  };
}

function turnInterruptCommand(): Extract<SessionCommand, { type: "turn_interrupt" }> {
  return {
    type: "turn_interrupt",
    sessionId: "s1",
    commandId: "c-int",
    timestamp: "2026-06-03T00:00:01.000Z",
    payload: {},
  };
}

function abortError(): Error {
  const error = new Error("aborted");
  error.name = "AbortError";
  return error;
}

async function waitForAbort(signal?: AbortSignal): Promise<void> {
  if (!signal) return;
  if (signal.aborted) throw abortError();

  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener("abort", onAbort);
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

import { describe, expect, it, vi } from "vitest";
import { createLoggingFetch } from "../../src/logging/createLoggingFetch";
import type { NetworkLogEntry } from "../../src/logging/NetworkLogger";

describe("createLoggingFetch", () => {
  it("returns streaming responses immediately without waiting for the body to close", async () => {
    const entries: NetworkLogEntry[] = [];
    const logger = {
      log: vi.fn(async (entry: NetworkLogEntry) => {
        entries.push(entry);
      }),
    };
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("data: {\"delta\":\"hi\"}\n\n"));
      },
    });
    const streamingResponse = new Response(stream, {
      status: 200,
      headers: { "content-type": "text/event-stream; charset=utf-8" },
    });
    const baseFetch = vi.fn(async () => streamingResponse) as unknown as typeof fetch;
    const wrapped = createLoggingFetch({ logger, baseFetch });

    const result = await Promise.race([
      wrapped("https://api.example.com/v1/chat/completions", { method: "POST" }),
      new Promise((resolve) => setTimeout(() => resolve("still-pending"), 25)),
    ]);

    expect(result).toBe(streamingResponse);
    expect(entries[1]).toMatchObject({
      direction: "response",
      status: 200,
      body: "[streaming response: text/event-stream]",
    });
  });

  it("logs the request body and response body as parsed JSON entries", async () => {
    const entries: NetworkLogEntry[] = [];
    const logger = {
      log: vi.fn(async (entry: NetworkLogEntry) => {
        entries.push(entry);
      }),
    };
    const baseFetch = vi.fn(async () =>
      new Response(JSON.stringify({ id: "chatcmpl-1", choices: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ) as unknown as typeof fetch;

    const wrapped = createLoggingFetch({ logger, baseFetch });

    const response = await wrapped("https://api.example.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "gpt-5-mini", messages: [{ role: "user", content: "hi" }] }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ id: "chatcmpl-1", choices: [] });

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      direction: "request",
      url: "https://api.example.com/v1/chat/completions",
      method: "POST",
      body: { model: "gpt-5-mini", messages: [{ role: "user", content: "hi" }] },
    });
    expect(entries[1]).toMatchObject({
      direction: "response",
      url: "https://api.example.com/v1/chat/completions",
      method: "POST",
      status: 200,
      body: { id: "chatcmpl-1", choices: [] },
    });
  });

  it("falls back to raw text when bodies are not JSON", async () => {
    const entries: NetworkLogEntry[] = [];
    const logger = {
      log: vi.fn(async (entry: NetworkLogEntry) => {
        entries.push(entry);
      }),
    };
    const baseFetch = vi.fn(async () =>
      new Response("not-json", { status: 500 }),
    ) as unknown as typeof fetch;

    const wrapped = createLoggingFetch({ logger, baseFetch });
    await wrapped("https://api.example.com", { method: "POST", body: "raw-string" });

    expect(entries[0]).toMatchObject({ direction: "request", body: "raw-string" });
    expect(entries[1]).toMatchObject({ direction: "response", status: 500, body: "not-json" });
  });

  it("returns event stream responses before consuming the body for logging", async () => {
    const entries: NetworkLogEntry[] = [];
    const logger = {
      log: vi.fn(async (entry: NetworkLogEntry) => {
        entries.push(entry);
      }),
    };
    let closeStream!: () => void;
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("data: hello\n\n"));
        closeStream = () => controller.close();
      },
    });
    const baseFetch = vi.fn(async () =>
      new Response(stream, {
        status: 200,
        headers: { "content-type": "text/event-stream; charset=utf-8" },
      }),
    ) as unknown as typeof fetch;

    const wrapped = createLoggingFetch({ logger, baseFetch });
    let resolved = false;
    const responsePromise = wrapped("https://api.example.com/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify({ stream: true }),
    }).then((response) => {
      resolved = true;
      return response;
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(resolved).toBe(true);
    const response = await responsePromise;
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const reader = response.body?.getReader();
    const firstChunk = await reader?.read();
    expect(new TextDecoder().decode(firstChunk?.value)).toBe("data: hello\n\n");
    expect(entries[1]).toMatchObject({
      direction: "response",
      status: 200,
      body: "[streaming response: text/event-stream]",
    });

    closeStream();
    await expect(reader?.read()).resolves.toMatchObject({ done: true });
  });

  it("attaches rejection handlers to async logger writes", async () => {
    let rejectionHandlers = 0;
    const rejectedLogWrite = {
      catch(onRejected: (error: Error) => void) {
        rejectionHandlers += 1;
        onRejected(new Error("log write failed"));
        return Promise.resolve();
      },
    } as Promise<void>;
    const logger = {
      log: vi.fn(() => rejectedLogWrite),
    };
    const baseFetch = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ) as unknown as typeof fetch;

    const wrapped = createLoggingFetch({ logger, baseFetch });

    const response = await wrapped("https://api.example.com/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify({ model: "gpt-5-mini" }),
    });
    await expect(response.json()).resolves.toEqual({ ok: true });

    expect(logger.log).toHaveBeenCalledTimes(2);
    expect(rejectionHandlers).toBe(2);
  });

  it("does not let synchronous logger failures fail the fetch", async () => {
    const logger = {
      log: vi.fn(() => {
        throw new Error("disk is full");
      }),
    };
    const baseFetch = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ) as unknown as typeof fetch;

    const wrapped = createLoggingFetch({ logger, baseFetch });

    const response = await wrapped("https://api.example.com/v1/chat/completions");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("redacts image payloads from parsed JSON request logs", async () => {
    const entries: NetworkLogEntry[] = [];
    const logger = {
      log: vi.fn(async (entry: NetworkLogEntry) => {
        entries.push(entry);
      }),
    };
    const baseFetch = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ) as unknown as typeof fetch;

    const wrapped = createLoggingFetch({ logger, baseFetch });

    await wrapped("https://api.example.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                image: "base64-large",
                mediaType: "image/png",
              },
              {
                type: "text",
                text: "data:image/png;base64,abc",
              },
            ],
          },
        ],
      }),
    });

    expect(entries[0]?.body).toEqual({
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              image: "[redacted image payload]",
              mediaType: "image/png",
            },
            {
              type: "text",
              text: "[redacted image data URI]",
            },
          ],
        },
      ],
    });
  });
});

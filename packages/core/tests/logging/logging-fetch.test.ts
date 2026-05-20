import { describe, expect, it, vi } from "vitest";
import { createLoggingFetch } from "../../src/logging/createLoggingFetch";
import type { NetworkLogEntry } from "../../src/logging/NetworkLogger";

describe("createLoggingFetch", () => {
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

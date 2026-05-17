import { describe, expect, it, vi } from "vitest";
import { SettingsBackedLLMClient } from "./SettingsBackedLLMClient.ts";

describe("SettingsBackedLLMClient", () => {
  it("loads settings from disk for every completion request", async () => {
    const loadModelSettings = vi
      .fn()
      .mockReturnValueOnce({
        model: "gpt-5-mini",
        apiKey: "first-key",
        baseUrl: "https://first.example/v1",
        api: "responses",
      })
      .mockReturnValueOnce({
        model: "gpt-4.1",
        apiKey: "second-key",
        baseUrl: "https://second.example/v1",
        api: "chat",
      });

    const complete = vi
      .fn()
      .mockResolvedValue({ message: { role: "assistant", content: "ok" }, toolCalls: [] });
    const createClient = vi.fn(() => ({ complete }));

    const client = new SettingsBackedLLMClient({}, { loadModelSettings, createClient });

    await client.complete([], []);
    await client.complete([], []);

    expect(loadModelSettings).toHaveBeenCalledTimes(2);
    expect(createClient).toHaveBeenNthCalledWith(1, {
      model: "gpt-5-mini",
      apiKey: "first-key",
      baseURL: "https://first.example/v1",
      api: "responses",
      networkLogger: undefined,
    });
    expect(createClient).toHaveBeenNthCalledWith(2, {
      model: "gpt-4.1",
      apiKey: "second-key",
      baseURL: "https://second.example/v1",
      api: "chat",
      networkLogger: undefined,
    });
  });

  it("forwards the configured network logger to each created client", async () => {
    const networkLogger = { log: vi.fn().mockResolvedValue(undefined) };
    const loadModelSettings = vi.fn().mockReturnValue({
      model: "gpt-5-mini",
      apiKey: "k",
      baseUrl: "https://example/v1",
      api: "chat",
    });
    const complete = vi
      .fn()
      .mockResolvedValue({ message: { role: "assistant", content: "ok" }, toolCalls: [] });
    const createClient = vi.fn(() => ({ complete }));

    const client = new SettingsBackedLLMClient(
      { networkLogger },
      { loadModelSettings, createClient },
    );

    await client.complete([], []);

    expect(createClient).toHaveBeenCalledWith(
      expect.objectContaining({ networkLogger }),
    );
  });
});

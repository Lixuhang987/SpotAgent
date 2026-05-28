import { describe, expect, it, vi } from "vitest";
import { SettingsBackedLLMClient } from "../../src/settings/SettingsBackedLLMClient.ts";

describe("SettingsBackedLLMClient", () => {
  it("uses cached settings and one client for 100 completions when the settings stamp is unchanged", async () => {
    const loadModelSettings = vi.fn().mockReturnValue({
      provider: "openai-compatible",
      model: "gpt-5-mini",
      summarizerModel: "claude-haiku-4-5-20251001",
      apiKey: "first-key",
      baseUrl: "https://first.example/v1",
      api: "responses",
    });

    const complete = vi
      .fn()
      .mockResolvedValue({ message: { role: "assistant", content: "ok" }, toolCalls: [] });
    const createClient = vi.fn(() => ({ complete }));
    const readSettingsStamp = vi.fn(() => "settings-v1");

    const client = new SettingsBackedLLMClient(
      {},
      { loadModelSettings, createClient, readSettingsStamp },
    );

    for (let i = 0; i < 100; i += 1) {
      await client.complete([], []);
    }

    expect(loadModelSettings.mock.calls.length).toBeLessThanOrEqual(2);
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledWith({
      provider: "openai-compatible",
      model: "gpt-5-mini",
      apiKey: "first-key",
      baseURL: "https://first.example/v1",
      api: "responses",
      networkLogger: undefined,
    });
    expect(complete).toHaveBeenCalledTimes(100);
  });

  it("reloads settings and rebuilds the client when the settings stamp changes", async () => {
    let stamp = "settings-v1";
    let settings = {
      provider: "openai-compatible" as const,
      model: "gpt-5-mini",
      summarizerModel: "claude-haiku-4-5-20251001",
      apiKey: "first-key",
      baseUrl: "https://first.example/v1",
      api: "responses" as const,
    };
    const loadModelSettings = vi.fn(() => settings);
    const readSettingsStamp = vi.fn(() => stamp);

    const firstComplete = vi
      .fn()
      .mockResolvedValue({ message: { role: "assistant", content: "first" }, toolCalls: [] });
    const secondComplete = vi
      .fn()
      .mockResolvedValue({ message: { role: "assistant", content: "second" }, toolCalls: [] });
    const createClient = vi
      .fn()
      .mockReturnValueOnce({ complete: firstComplete })
      .mockReturnValueOnce({ complete: secondComplete });

    const client = new SettingsBackedLLMClient(
      {},
      { loadModelSettings, createClient, readSettingsStamp },
    );

    await expect(client.complete([], [])).resolves.toEqual({
      message: { role: "assistant", content: "first" },
      toolCalls: [],
    });

    stamp = "settings-v2";
    settings = {
      provider: "anthropic",
      model: "gpt-4.1",
      summarizerModel: "claude-haiku-4-5-20251001",
      apiKey: "second-key",
      baseUrl: "https://second.example/v1",
      api: "chat",
    };

    await expect(client.complete([], [])).resolves.toEqual({
      message: { role: "assistant", content: "second" },
      toolCalls: [],
    });

    expect(loadModelSettings).toHaveBeenCalledTimes(2);
    expect(createClient).toHaveBeenCalledTimes(2);
    expect(createClient).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        model: "gpt-4.1",
        provider: "anthropic",
        apiKey: "second-key",
        baseURL: "https://second.example/v1",
        api: "chat",
      }),
    );
  });

  it("reuses the existing client when a settings stamp changes but effective client settings do not", async () => {
    let stamp = "settings-v1";
    const loadModelSettings = vi.fn().mockReturnValue({
      provider: "openai-compatible",
      model: "gpt-5-mini",
      summarizerModel: "claude-haiku-4-5-20251001",
      apiKey: "k",
      baseUrl: "https://example/v1",
      api: "chat",
    });
    const readSettingsStamp = vi.fn(() => stamp);
    const complete = vi
      .fn()
      .mockResolvedValue({ message: { role: "assistant", content: "ok" }, toolCalls: [] });
    const createClient = vi.fn(() => ({ complete }));

    const client = new SettingsBackedLLMClient(
      {},
      { loadModelSettings, createClient, readSettingsStamp },
    );

    await client.complete([], []);
    stamp = "settings-v2";
    await client.complete([], []);

    expect(loadModelSettings).toHaveBeenCalledTimes(2);
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it("keeps using the cached client while the settings stamp is unchanged", async () => {
    let settings = {
      provider: "openai-compatible" as const,
      model: "gpt-5-mini",
      summarizerModel: "claude-haiku-4-5-20251001",
      apiKey: "first-key",
      baseUrl: "https://first.example/v1",
      api: "responses" as const,
    };
    const loadModelSettings = vi.fn(() => settings);
    const readSettingsStamp = vi.fn(() => "settings-v1");
    const complete = vi
      .fn()
      .mockResolvedValue({ message: { role: "assistant", content: "ok" }, toolCalls: [] });
    const createClient = vi.fn(() => ({ complete }));

    const client = new SettingsBackedLLMClient(
      {},
      { loadModelSettings, createClient, readSettingsStamp },
    );

    await client.complete([], []);
    settings = {
      provider: "openai-compatible",
      model: "gpt-4.1",
      summarizerModel: "claude-haiku-4-5-20251001",
      apiKey: "second-key",
      baseUrl: "https://second.example/v1",
      api: "chat",
    };
    await client.complete([], []);

    expect(loadModelSettings).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledWith({
      provider: "openai-compatible",
      model: "gpt-5-mini",
      apiKey: "first-key",
      baseURL: "https://first.example/v1",
      api: "responses",
      networkLogger: undefined,
    });
  });

  it("forwards the configured network logger to each created client", async () => {
    const networkLogger = { log: vi.fn().mockResolvedValue(undefined) };
    const loadModelSettings = vi.fn().mockReturnValue({
      provider: "anthropic",
      model: "gpt-5-mini",
      summarizerModel: "claude-haiku-4-5-20251001",
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

  it("forwards completion options to the cached client", async () => {
    const loadModelSettings = vi.fn().mockReturnValue({
      provider: "openai-compatible",
      model: "gpt-5-mini",
      summarizerModel: "claude-haiku-4-5-20251001",
      apiKey: "k",
      baseUrl: "https://example/v1",
      api: "chat",
    });
    const complete = vi
      .fn()
      .mockResolvedValue({ message: { role: "assistant", content: "ok" }, toolCalls: [] });
    const createClient = vi.fn(() => ({ complete }));
    const blobStore = { get: vi.fn() };

    const client = new SettingsBackedLLMClient(
      {},
      { loadModelSettings, createClient },
    );

    await client.complete([], [], { blobStore: blobStore as never });

    expect(complete).toHaveBeenCalledWith([], [], { blobStore });
  });

  it("can use summarizerModel for summary-only completion requests", async () => {
    const loadModelSettings = vi.fn().mockReturnValue({
      provider: "anthropic",
      model: "gpt-5-mini",
      summarizerModel: "claude-haiku-4-5-20251001",
      apiKey: "k",
      baseUrl: "https://example/v1",
      api: "chat",
    });
    const complete = vi
      .fn()
      .mockResolvedValue({ message: { role: "assistant", content: "summary" }, toolCalls: [] });
    const createClient = vi.fn(() => ({ complete }));

    const client = new SettingsBackedLLMClient(
      { purpose: "summarizer" },
      { loadModelSettings, createClient },
    );

    await client.complete([], []);

    expect(createClient).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-haiku-4-5-20251001",
        provider: "anthropic",
      }),
    );
  });
});

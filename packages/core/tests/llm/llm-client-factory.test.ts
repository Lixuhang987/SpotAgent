import { describe, expect, it, vi } from "vitest";
import { collectLLMStream } from "../../src/llm/LLMClient";
import {
  createLLMClient,
  unsupportedCapabilityMessage,
  type LLMClientFactoryDependencies,
} from "../../src/llm/LLMClientFactory";
import type { AgentMessage } from "../../src/runtime/AgentMessage";

describe("LLMClientFactory", () => {
  it("creates an OpenAI-compatible client by default with explicit capabilities", () => {
    const createOpenAICompatibleClient = vi.fn(() => ({
      stream: vi.fn(),
    }));

    const result = createLLMClient(
      {
        provider: "openai-compatible",
        model: "gpt-5-mini",
        summarizerModel: "claude-haiku-4-5-20251001",
        apiKey: "test-key",
        baseUrl: "https://example.com/v1",
        api: "responses",
      },
      { createOpenAICompatibleClient } as LLMClientFactoryDependencies,
    );

    expect(result.capabilities).toEqual({
      streaming: true,
      toolCalling: true,
      multimodal: true,
    });
    expect(createOpenAICompatibleClient).toHaveBeenCalledWith({
      model: "gpt-5-mini",
      apiKey: "test-key",
      baseURL: "https://example.com/v1",
      api: "responses",
      networkLogger: undefined,
    });
  });

  it("creates an Anthropic client through the AI SDK stream path", async () => {
    const streamText = vi.fn(() => ({
      fullStream: (async function* () {
        yield { type: "text-delta", text: "ok" };
        yield {
          type: "tool-call",
          toolCallId: "call-1",
          toolName: "file_read",
          input: { path: "/tmp/a.txt" },
        };
      })(),
    }));
    const model = { provider: "anthropic", modelId: "claude-sonnet-4-5-20250929" };
    const createAnthropic = vi.fn(() => vi.fn(() => model));

    const result = createLLMClient(
      {
        provider: "anthropic",
        model: "claude-sonnet-4-5-20250929",
        summarizerModel: "claude-haiku-4-5-20251001",
        apiKey: "anthropic-key",
        api: "chat",
      },
      { createAnthropic, streamText } as LLMClientFactoryDependencies,
    );

    expect(result.capabilities).toEqual({
      streaming: true,
      toolCalling: true,
      multimodal: true,
    });
    await expect(
      collectLLMStream(
        result.client.stream(
          [{ role: "user", content: "读取文件" }],
          [
            {
              name: "file.read",
              description: "读取文件",
              inputSchema: {
                type: "object",
                properties: { path: { type: "string" } },
                required: ["path"],
              },
            },
          ],
        ),
      ),
    ).resolves.toEqual({
      message: { role: "assistant", content: "ok" },
      toolCalls: [
        {
          id: "call-1",
          name: "file.read",
          arguments: { path: "/tmp/a.txt" },
        },
      ],
    });
    expect(createAnthropic).toHaveBeenCalledWith({
      baseURL: undefined,
      apiKey: "anthropic-key",
    });
    expect(streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        model,
        messages: [{ role: "user", content: "读取文件" }],
        tools: expect.objectContaining({
          file_read: expect.any(Object),
        }),
      }),
    );
  });

  it("passes Anthropic baseUrl to the AI SDK provider", () => {
    const model = { provider: "anthropic", modelId: "claude-sonnet-4-5-20250929" };
    const createAnthropic = vi.fn(() => vi.fn(() => model));

    createLLMClient(
      {
        provider: "anthropic",
        model: "claude-sonnet-4-5-20250929",
        summarizerModel: "claude-haiku-4-5-20251001",
        apiKey: "anthropic-key",
        baseUrl: "https://anthropic-gateway.example/v1",
        api: "chat",
      },
      { createAnthropic } as LLMClientFactoryDependencies,
    );

    expect(createAnthropic).toHaveBeenCalledWith({
      baseURL: "https://anthropic-gateway.example/v1",
      apiKey: "anthropic-key",
    });
  });

  it("uses ANTHROPIC_AUTH_TOKEN for Anthropic when settings apiKey is empty", () => {
    const previousAuthToken = process.env.ANTHROPIC_AUTH_TOKEN;
    process.env.ANTHROPIC_AUTH_TOKEN = "gateway-token";
    const model = { provider: "anthropic", modelId: "claude-sonnet-4-5-20250929" };
    const createAnthropic = vi.fn(() => vi.fn(() => model));

    try {
      createLLMClient(
        {
          provider: "anthropic",
          model: "claude-sonnet-4-5-20250929",
          summarizerModel: "claude-haiku-4-5-20251001",
          api: "chat",
        },
        { createAnthropic } as LLMClientFactoryDependencies,
      );
    } finally {
      if (previousAuthToken === undefined) {
        delete process.env.ANTHROPIC_AUTH_TOKEN;
      } else {
        process.env.ANTHROPIC_AUTH_TOKEN = previousAuthToken;
      }
    }

    expect(createAnthropic).toHaveBeenCalledWith({
      baseURL: undefined,
      authToken: "gateway-token",
    });
  });

  it("passes abort signals to Anthropic AI SDK requests", async () => {
    const streamText = vi.fn(() => ({
      fullStream: (async function* () {
        yield { type: "text-delta", text: "ok" };
      })(),
    }));
    const model = { provider: "anthropic", modelId: "claude-sonnet-4-5-20250929" };
    const controller = new AbortController();
    const result = createLLMClient(
      {
        provider: "anthropic",
        model: "claude-sonnet-4-5-20250929",
        summarizerModel: "claude-haiku-4-5-20251001",
        apiKey: "anthropic-key",
        api: "chat",
      },
      {
        createAnthropic: vi.fn(() => vi.fn(() => model)),
        streamText,
      } as LLMClientFactoryDependencies,
    );

    await collectLLMStream(
      result.client.stream(
        [{ role: "user", content: "hi" }],
        [],
        { signal: controller.signal },
      ),
    );

    expect(streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        abortSignal: controller.signal,
      }),
    );
  });

  it("throws Anthropic AI SDK provider errors instead of returning an empty assistant message", async () => {
    const providerError = new Error("TLS handshake failure");
    const streamText = vi.fn(() => ({
      fullStream: (async function* () {
        yield { type: "error", error: providerError };
      })(),
    }));
    const model = { provider: "anthropic", modelId: "claude-sonnet-4-5-20250929" };
    const result = createLLMClient(
      {
        provider: "anthropic",
        model: "claude-sonnet-4-5-20250929",
        summarizerModel: "claude-haiku-4-5-20251001",
        apiKey: "anthropic-key",
        api: "chat",
      },
      {
        createAnthropic: vi.fn(() => vi.fn(() => model)),
        streamText,
      } as LLMClientFactoryDependencies,
    );

    await expect(
      collectLLMStream(result.client.stream([{ role: "user", content: "hi" }], [])),
    ).rejects.toThrow(providerError);
  });

  it("throws when Anthropic AI SDK stream finishes without assistant content or tool calls", async () => {
    const streamText = vi.fn(() => ({
      fullStream: (async function* () {
        yield { type: "finish", finishReason: "stop" };
      })(),
    }));
    const model = { provider: "anthropic", modelId: "claude-sonnet-4-5-20250929" };
    const result = createLLMClient(
      {
        provider: "anthropic",
        model: "claude-sonnet-4-5-20250929",
        summarizerModel: "claude-haiku-4-5-20251001",
        apiKey: "anthropic-key",
        api: "chat",
      },
      {
        createAnthropic: vi.fn(() => vi.fn(() => model)),
        streamText,
      } as LLMClientFactoryDependencies,
    );

    await expect(
      collectLLMStream(result.client.stream([{ role: "user", content: "hi" }], [])),
    ).rejects.toThrow("AI SDK stream finished without assistant content or tool calls.");
  });

  it("rejects unsupported multimodal messages before calling the provider", async () => {
    const stream = vi.fn(async function* () {
      yield { type: "text_delta" as const, text: "should not run" };
    });
    const result = createLLMClient(
      {
        provider: "openai-compatible",
        model: "gpt-3.5-turbo-instruct",
        summarizerModel: "claude-haiku-4-5-20251001",
        apiKey: "test-key",
        api: "completion",
      },
      {
        createOpenAICompatibleClient: vi.fn(() => ({ stream })),
      } as LLMClientFactoryDependencies,
    );
    const messages: AgentMessage[] = [
      {
        role: "user",
        content: [{ type: "image", blobId: "blob-1", mimeType: "image/png" }],
      },
    ];

    await expect(collectLLMStream(result.client.stream(messages, []))).rejects.toThrow(
      unsupportedCapabilityMessage("openai-compatible", "multimodal"),
    );
    expect(stream).not.toHaveBeenCalled();
  });

  it("drops tools when the selected provider does not support tool calling", async () => {
    const stream = vi.fn(async function* () {
      yield { type: "text_delta" as const, text: "ok" };
      yield {
        type: "message_end" as const,
        message: { role: "assistant" as const, content: "ok" },
        toolCalls: [],
      };
    });
    const result = createLLMClient(
      {
        provider: "openai-compatible",
        model: "gpt-3.5-turbo-instruct",
        summarizerModel: "claude-haiku-4-5-20251001",
        apiKey: "test-key",
        api: "completion",
      },
      {
        createOpenAICompatibleClient: vi.fn(() => ({ stream })),
      } as LLMClientFactoryDependencies,
    );

    await collectLLMStream(
      result.client.stream(
        [{ role: "user", content: "hi" }],
        [
          {
            name: "file.read",
            description: "读取文件",
            inputSchema: { type: "object", properties: {} },
          },
        ],
      ),
    );

    expect(stream).toHaveBeenCalledWith([{ role: "user", content: "hi" }], [], undefined);
  });
});

import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadModelSettings,
  type ModelSettings,
  type OpenAIApiType,
} from "../../src/config/ModelSettings";
import { VercelClient } from "../../src/llm/VercelClient";
import type { NetworkLogEntry, NetworkLogger } from "../../src/logging/NetworkLogger";
import type { AgentMessage } from "../../src/runtime/AgentMessage";
import type { RegisteredTool } from "../../src/tools/ToolRegistry";
import {
  type LLMIntegrationTurn,
  writeLLMIntegrationArtifact,
} from "./support/LLMIntegrationArtifacts";

const runIntegration = process.env.HANDAGENT_LLM_INTEGRATION === "1";
const integration = runIntegration ? it : it.skip;
const requestTimeoutMs = Number.parseInt(
  process.env.HANDAGENT_LLM_REQUEST_TIMEOUT_MS ?? "45000",
  10,
);

class RecordingNetworkLogger implements NetworkLogger {
  entries: NetworkLogEntry[] = [];

  async log(entry: NetworkLogEntry): Promise<void> {
    this.entries.push(entry);
  }
}

describe("VercelClient real API integration", () => {
  integration(
    "calls the configured real endpoint and writes reference JSON artifacts",
    async () => {
      const settings = loadIntegrationSettings();
      if (!settings.apiKey) {
        throw new Error(
          "HANDAGENT_LLM_INTEGRATION=1 requires ~/.spotAgent/settings.json llm.apiKey",
        );
      }

      const networkLogger = new RecordingNetworkLogger();
      const outputDir =
        process.env.HANDAGENT_LLM_ARTIFACT_DIR ??
        join(process.cwd(), ".cache", "llm-api-integration", "latest");
      const turns: LLMIntegrationTurn[] = [];
      let capturedError: unknown;
      const client = new VercelClient({
        model: settings.model,
        api: settings.api,
        apiKey: settings.apiKey,
        baseURL: settings.baseUrl,
        networkLogger,
        fetch: timeoutFetch(requestTimeoutMs),
      });
      const tools = [referenceFileWriteTool()];

      const firstMessages: AgentMessage[] = [
        {
          role: "user",
          content:
            "Reply with one short sentence containing the text handagent-api-integration-ok.",
        },
      ];
      const toolMessages: AgentMessage[] = [
        {
          role: "user",
          content:
            "You are running a HandAgent integration test. Call file.write exactly once with workspaceId qa-workspace, relativePath api-integration.txt, and content hello from real api integration test. Do not provide a final answer until after the tool result is provided.",
        },
      ];

      try {
        const assistantOnlyCompletion = await client.complete(firstMessages, []);
        turns.push({
          name: "assistant-only",
          input: { messages: firstMessages, tools: [] },
          completion: assistantOnlyCompletion,
        });
        expect(assistantOnlyCompletion.message.content.length).toBeGreaterThan(0);

        const firstCompletion = await client.complete(toolMessages, tools);
        turns.push({
          name: "tool-call",
          input: { messages: toolMessages, tools },
          completion: firstCompletion,
        });

        expect(firstCompletion.toolCalls?.length).toBeGreaterThan(0);
        const fileWriteCall = firstCompletion.toolCalls?.find(
          (toolCall) => toolCall.name === "file.write",
        );
        expect(fileWriteCall).toBeDefined();
        expect(fileWriteCall?.arguments).toMatchObject({
          workspaceId: expect.any(String),
          relativePath: expect.any(String),
          content: expect.any(String),
        });

        const secondMessages: AgentMessage[] = [
          ...toolMessages,
          {
            ...firstCompletion.message,
            toolCalls: firstCompletion.toolCalls,
          },
          {
            role: "tool",
            toolCallId: fileWriteCall!.id,
            name: "file.write",
            content: JSON.stringify({
              ok: true,
              workspaceId: fileWriteCall!.arguments.workspaceId,
              relativePath: fileWriteCall!.arguments.relativePath,
            }),
          },
        ];
        const secondCompletion = await client.complete(secondMessages, tools);
        turns.push({
          name: "final-answer",
          input: { messages: secondMessages, tools },
          completion: secondCompletion,
        });

        expect(secondCompletion.message.content.length).toBeGreaterThan(0);
        expect(networkLogger.entries.some((entry) => entry.direction === "request")).toBe(true);
        expect(networkLogger.entries.some((entry) => entry.direction === "response")).toBe(true);
      } catch (error) {
        capturedError = error;
        throw error;
      } finally {
        await writeLLMIntegrationArtifact({
          outputDir,
          scenario: "vercel-client-real-api-tool-call",
          settings,
          turns,
          networkLog: networkLogger.entries,
          error: capturedError,
        });
      }
    },
    Math.max(120_000, requestTimeoutMs * 4 + 15_000),
  );
});

function timeoutFetch(timeoutMs: number): typeof fetch {
  return async (input, init) => {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = init?.signal
      ? AbortSignal.any([init.signal, timeoutSignal])
      : timeoutSignal;
    return fetch(input, { ...init, signal });
  };
}

function loadIntegrationSettings(): ModelSettings {
  const settings = loadModelSettings();
  return {
    ...settings,
    model: process.env.HANDAGENT_LLM_MODEL?.trim() || settings.model,
    apiKey: process.env.HANDAGENT_LLM_API_KEY?.trim() || settings.apiKey,
    baseUrl: process.env.HANDAGENT_LLM_BASE_URL?.trim() || settings.baseUrl,
    api: parseApiOverride(process.env.HANDAGENT_LLM_API) ?? settings.api,
  };
}

function parseApiOverride(value: string | undefined): OpenAIApiType | undefined {
  const normalized = value?.trim();
  if (normalized === "responses" || normalized === "chat" || normalized === "completion") {
    return normalized;
  }
  return undefined;
}

function referenceFileWriteTool(): RegisteredTool {
  return {
    name: "file.write",
    description: "Write a UTF-8 text file inside a named HandAgent workspace.",
    inputSchema: {
      type: "object",
      properties: {
        workspaceId: {
          type: "string",
          description: "Workspace identifier.",
        },
        relativePath: {
          type: "string",
          description: "Relative path inside the workspace.",
        },
        content: {
          type: "string",
          description: "File content to write.",
        },
      },
      required: ["workspaceId", "relativePath", "content"],
      additionalProperties: false,
    },
  };
}

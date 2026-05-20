import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ModelSettings } from "../../../src/config/ModelSettings";
import type { LLMCompletion } from "../../../src/llm/LLMClient";
import type { NetworkLogEntry } from "../../../src/logging/NetworkLogger";
import type { AgentMessage } from "../../../src/runtime/AgentMessage";
import type { RegisteredTool } from "../../../src/tools/ToolRegistry";

export type LLMIntegrationTurn = {
  name: string;
  input: {
    messages: AgentMessage[];
    tools: RegisteredTool[];
  };
  completion: LLMCompletion;
};

export type LLMIntegrationArtifactOptions = {
  outputDir: string;
  scenario: string;
  settings: ModelSettings;
  turns: LLMIntegrationTurn[];
  networkLog: NetworkLogEntry[];
  error?: unknown;
  generatedAt?: string;
};

export type LLMIntegrationArtifactPaths = {
  artifactJson: string;
  networkJsonl: string;
  turns: Array<{
    inputJson: string;
    completionJson: string;
  }>;
};

export async function writeLLMIntegrationArtifact(
  options: LLMIntegrationArtifactOptions,
): Promise<LLMIntegrationArtifactPaths> {
  await rm(options.outputDir, { recursive: true, force: true });
  await mkdir(options.outputDir, { recursive: true });

  const safeNetworkLog = redactSecrets(options.networkLog);
  const artifact = {
    schemaVersion: 1,
    scenario: options.scenario,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    settings: {
      model: options.settings.model,
      summarizerModel: options.settings.summarizerModel,
      api: options.settings.api,
      baseUrl: options.settings.baseUrl,
    },
    turns: options.turns.map((turn, index) => ({
      index: index + 1,
      name: turn.name,
      inputPath: turnInputFileName(index, turn.name),
      completionPath: turnCompletionFileName(index, turn.name),
    })),
    networkLogPath: "network.jsonl",
    networkLog: safeNetworkLog,
    error: options.error ? redactSecrets(toErrorSummary(options.error)) : undefined,
  };

  const artifactJson = join(options.outputDir, "artifact.json");
  const networkJsonl = join(options.outputDir, "network.jsonl");
  const turnPaths = [];

  await writeJson(artifactJson, artifact);
  await writeFile(
    networkJsonl,
    safeNetworkLog.map((entry) => JSON.stringify(entry)).join("\n") + "\n",
    "utf8",
  );

  for (let index = 0; index < options.turns.length; index += 1) {
    const turn = options.turns[index]!;
    const inputJson = join(options.outputDir, turnInputFileName(index, turn.name));
    const completionJson = join(options.outputDir, turnCompletionFileName(index, turn.name));
    await writeJson(inputJson, redactSecrets(turn.input));
    await writeJson(completionJson, redactSecrets(turn.completion));
    turnPaths.push({ inputJson, completionJson });
  }

  return {
    artifactJson,
    networkJsonl,
    turns: turnPaths,
  };
}

function turnInputFileName(index: number, name: string): string {
  return `turn-${index + 1}-${safeFilePart(name)}.input.json`;
}

function turnCompletionFileName(index: number, name: string): string {
  return `turn-${index + 1}-${safeFilePart(name)}.completion.json`;
}

function safeFilePart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "") || "turn";
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item));
  }
  if (typeof value === "string") {
    return redactSecretText(value);
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      shouldRedactKey(key) ? "[redacted]" : redactSecrets(entry),
    ]),
  );
}

function shouldRedactKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return (
    normalized === "apikey" ||
    normalized === "api_key" ||
    normalized === "authorization" ||
    normalized === "x-api-key" ||
    normalized.endsWith("_token") ||
    normalized.endsWith("token")
  );
}

function redactSecretText(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\bsk-[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/\bsecret-[A-Za-z0-9_-]+/gi, "[redacted]");
}

function toErrorSummary(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return {
    name: "UnknownError",
    message: String(error),
  };
}

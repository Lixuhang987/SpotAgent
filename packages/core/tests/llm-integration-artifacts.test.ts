import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { writeLLMIntegrationArtifact } from "./support/LLMIntegrationArtifacts";

describe("LLM integration artifacts", () => {
  it("writes redacted provider logs and normalized completions for reference", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "handagent-llm-artifact-"));
    try {
      const paths = await writeLLMIntegrationArtifact({
        outputDir,
        scenario: "unit-reference",
        generatedAt: "2026-05-19T00:00:00.000Z",
        settings: {
          model: "gpt-test",
          summarizerModel: "summary-test",
          api: "responses",
          apiKey: "secret-key",
          baseUrl: "https://example.test/v1",
        },
        turns: [
          {
            name: "tool-call",
            input: {
              messages: [{ role: "user", content: "write a file" }],
              tools: [
                {
                  name: "file.write",
                  description: "write a workspace file",
                  inputSchema: {
                    type: "object",
                    properties: {
                      relativePath: { type: "string" },
                    },
                  },
                },
              ],
            },
            completion: {
              message: { role: "assistant", content: "" },
              toolCalls: [
                {
                  id: "call-1",
                  name: "file.write",
                  arguments: { relativePath: "hello.txt" },
                },
              ],
            },
          },
        ],
        error: new Error("request failed with token secret-token"),
        networkLog: [
          {
            timestamp: "2026-05-19T00:00:01.000Z",
            direction: "request",
            url: "https://example.test/v1/responses",
            method: "POST",
            body: {
              apiKey: "secret-key",
              headers: { authorization: "Bearer secret-token" },
              messages: [{ role: "user", content: "write a file" }],
            },
          },
        ],
      });

      const artifact = await readFile(paths.artifactJson, "utf8");
      const network = await readFile(paths.networkJsonl, "utf8");
      const completion = await readFile(paths.turns[0]!.completionJson, "utf8");

      expect(artifact).toContain('"scenario": "unit-reference"');
      expect(artifact).toContain('"api": "responses"');
      expect(artifact).toContain('"message": "request failed with token [redacted]"');
      expect(completion).toContain('"name": "file.write"');
      expect(network).toContain('"authorization":"[redacted]"');
      expect(`${artifact}\n${network}\n${completion}`).not.toContain("secret-key");
      expect(`${artifact}\n${network}\n${completion}`).not.toContain("secret-token");
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  defaultModelSettings,
  loadModelSettings,
  modelSettingsFilePath,
} from "../src/config/ModelSettings";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("ModelSettings", () => {
  it("returns defaults when the settings file does not exist", () => {
    const homeDir = mkdtempSync(join(tmpdir(), "spot-agent-settings-"));
    tempRoots.push(homeDir);

    expect(modelSettingsFilePath(homeDir)).toBe(join(homeDir, ".spotAgent", "settings.json"));
    expect(loadModelSettings(homeDir)).toEqual(defaultModelSettings);
  });

  it("loads model settings from ~/.spotAgent/settings.json", () => {
    const homeDir = mkdtempSync(join(tmpdir(), "spot-agent-settings-"));
    tempRoots.push(homeDir);
    const settingsDir = join(homeDir, ".spotAgent");
    mkdirSync(settingsDir, { recursive: true });
    writeFileSync(
      join(settingsDir, "settings.json"),
      JSON.stringify(
        {
          llm: {
            model: "gpt-4.1",
            apiKey: "test-key",
            baseUrl: "https://example.com/v1",
            api: "chat",
          },
        },
        null,
        2,
      ),
    );

    expect(loadModelSettings(homeDir)).toEqual({
      model: "gpt-4.1",
      summarizerModel: "claude-haiku-4-5-20251001",
      apiKey: "test-key",
      baseUrl: "https://example.com/v1",
      api: "chat",
    });
  });

  it("re-reads the settings file on every call", () => {
    const homeDir = mkdtempSync(join(tmpdir(), "spot-agent-settings-"));
    tempRoots.push(homeDir);
    const settingsDir = join(homeDir, ".spotAgent");
    mkdirSync(settingsDir, { recursive: true });
    const filePath = join(settingsDir, "settings.json");

    writeFileSync(
      filePath,
      JSON.stringify({
        llm: {
          model: "gpt-5-mini",
          apiKey: "first-key",
          baseUrl: "https://first.example/v1",
          api: "responses",
        },
      }),
    );
    expect(loadModelSettings(homeDir).apiKey).toBe("first-key");

    writeFileSync(
      filePath,
      JSON.stringify({
        llm: {
          model: "gpt-4.1",
          summarizerModel: "claude-3-5-haiku-latest",
          apiKey: "second-key",
          baseUrl: "https://second.example/v1",
          api: "chat",
        },
      }),
    );
    expect(loadModelSettings(homeDir)).toEqual({
      model: "gpt-4.1",
      summarizerModel: "claude-3-5-haiku-latest",
      apiKey: "second-key",
      baseUrl: "https://second.example/v1",
      api: "chat",
    });
  });

  it("throws a clear error when settings JSON is invalid", () => {
    const homeDir = mkdtempSync(join(tmpdir(), "spot-agent-settings-"));
    tempRoots.push(homeDir);
    const settingsDir = join(homeDir, ".spotAgent");
    mkdirSync(settingsDir, { recursive: true });
    writeFileSync(join(settingsDir, "settings.json"), "{invalid json");

    expect(() => loadModelSettings(homeDir)).toThrow(
      "Failed to parse settings at"
    );
  });
});

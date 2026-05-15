import { describe, expect, it } from "vitest";
import {
  defaultOpenAIBaseURL,
  resolveOpenAIApiKey,
  resolveOpenAIBaseURL,
} from "../src/llm/OpenAIConfig";

describe("OpenAIConfig", () => {
  it("returns the explicit apiKey without reading environment variables", () => {
    expect(resolveOpenAIApiKey({ apiKey: "explicit-key" })).toBe("explicit-key");
  });

  it("throws a clear error when no OpenAI API key is configured", () => {
    expect(() => resolveOpenAIApiKey({})).toThrow(
      "Missing apiKey in ~/.spotAgent/settings.json. 请先在设置页完成模型配置。"
    );
  });

  it("returns the explicit baseURL without reading environment variables", () => {
    expect(resolveOpenAIBaseURL({ baseURL: "https://explicit.example/v1" })).toBe(
      "https://explicit.example/v1"
    );
  });

  it("returns the OpenAI default baseURL when no custom baseURL is configured", () => {
    expect(resolveOpenAIBaseURL({})).toBe(defaultOpenAIBaseURL);
  });
});

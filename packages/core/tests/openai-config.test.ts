import { afterEach, describe, expect, it } from "vitest";
import {
  resolveOpenAIApiKey,
  resolveOpenAIBaseURL,
} from "../src/llm/OpenAIConfig";

const originalOpenAIKey = process.env.OPENAI_API_KEY;
const originalOpenAIBaseURL = process.env.OPENAI_BASE_URL;

afterEach(() => {
  if (originalOpenAIKey === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = originalOpenAIKey;
  }

  if (originalOpenAIBaseURL === undefined) {
    delete process.env.OPENAI_BASE_URL;
  } else {
    process.env.OPENAI_BASE_URL = originalOpenAIBaseURL;
  }
});

describe("OpenAIConfig", () => {
  it("prefers explicit apiKey and falls back to OPENAI_API_KEY", () => {
    process.env.OPENAI_API_KEY = "env-key";

    expect(resolveOpenAIApiKey({ apiKey: "explicit-key" })).toBe("explicit-key");
    expect(resolveOpenAIApiKey({})).toBe("env-key");
  });

  it("throws a clear error when no OpenAI API key is configured", () => {
    delete process.env.OPENAI_API_KEY;

    expect(() => resolveOpenAIApiKey({})).toThrow(
      "Missing OPENAI_API_KEY. Set it before starting HandAgent."
    );
  });

  it("prefers explicit baseURL and falls back to OPENAI_BASE_URL", () => {
    process.env.OPENAI_BASE_URL = "https://env.example/v1";

    expect(resolveOpenAIBaseURL({ baseURL: "https://explicit.example/v1" })).toBe(
      "https://explicit.example/v1"
    );
    expect(resolveOpenAIBaseURL({})).toBe("https://env.example/v1");
  });

  it("returns undefined when no OpenAI base URL is configured", () => {
    delete process.env.OPENAI_BASE_URL;

    expect(resolveOpenAIBaseURL({})).toBeUndefined();
  });
});

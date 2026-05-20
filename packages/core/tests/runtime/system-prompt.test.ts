import { describe, expect, it } from "vitest";
import type { RegisteredTool } from "../../src/tools/ToolRegistry";
import type { AgentMessage } from "../../src/runtime/AgentMessage";
import {
  buildDefaultSystemPromptSections,
  buildSystemPromptMessages,
  resolveSystemPromptSections,
  systemPromptSection,
} from "../../src/runtime/SystemPrompt";

const fakeRegisteredTool: RegisteredTool = {
  name: "app.frontmost",
  description: "读取当前前台 App 信息",
  inputSchema: { type: "object", additionalProperties: false },
};

describe("SystemPrompt", () => {
  it("resolves named sections in order and drops empty sections", async () => {
    const sections = [
      systemPromptSection("identity", () => "You are HandAgent."),
      systemPromptSection("empty", () => null),
      systemPromptSection("policy", async () => "Use structured tool calls."),
    ];

    await expect(resolveSystemPromptSections(sections, { tools: [] })).resolves.toEqual([
      "You are HandAgent.",
      "Use structured tool calls.",
    ]);
  });

  it("builds default tool-use policy only when tools are available", async () => {
    const sections = buildDefaultSystemPromptSections();

    await expect(resolveSystemPromptSections(sections, { tools: [] })).resolves.toEqual([]);
    await expect(resolveSystemPromptSections(sections, { tools: [fakeRegisteredTool] }))
      .resolves.toEqual([
        expect.stringContaining("structured tool calls"),
      ]);
  });

  it("converts resolved sections to system messages before conversation messages", async () => {
    const messages: AgentMessage[] = [
      { role: "system", content: "用户自定义系统提示" },
      { role: "user", content: "执行一个流程，使用两个tool调用" },
    ];

    await expect(
      buildSystemPromptMessages({
        sections: [
          systemPromptSection("identity", () => "You are HandAgent."),
          systemPromptSection("policy", () => "Use tools when required."),
        ],
        context: { tools: [fakeRegisteredTool] },
        messages,
      }),
    ).resolves.toEqual([
      { role: "system", content: "You are HandAgent." },
      { role: "system", content: "Use tools when required." },
      ...messages,
    ]);
  });
});

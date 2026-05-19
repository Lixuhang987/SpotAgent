import type { LLMClient, LLMCompleteOptions, LLMCompletion } from "./LLMClient.ts";
import type { AgentMessage } from "../runtime/AgentMessage.ts";
import type { RegisteredTool } from "../tools/ToolRegistry.ts";

type MockScenarioContext = {
  messages: AgentMessage[];
  tools: RegisteredTool[];
  options?: LLMCompleteOptions;
};

export type MockLLMScenario = {
  id: string;
  triggers: string[];
  description: string;
  complete(context: MockScenarioContext): Promise<LLMCompletion> | LLMCompletion;
};

export const mockLLMScenarios: MockLLMScenario[] = [
  {
    id: "assistant-ok",
    triggers: ["[mock:assistant-ok]"],
    description: "普通 assistant 回复，用于验证主链路。",
    complete: () => assistant("Mock assistant response: main chain is reachable."),
  },
  {
    id: "workspace-list",
    triggers: ["[mock:workspace-list]"],
    description: "调用 workspace.list，再根据 tool result 返回最终回复。",
    complete: (context) => toolThenFinal(context, {
      toolCall: {
        id: "mock-workspace-list-1",
        name: "workspace.list",
        arguments: {},
      },
      finalText: "Mock workspace.list completed.",
    }),
  },
  {
    id: "file-write",
    triggers: ["[mock:file-write]"],
    description: "调用 file.write，参数形态参考真实 API 集成测试。",
    complete: (context) => toolThenFinal(context, {
      toolCall: {
        id: "mock-file-write-1",
        name: "file.write",
        arguments: {
          workspaceId: "qa-workspace",
          relativePath: "hello.txt",
          content: "hello from MockLLMClient",
        },
      },
      finalText: "Mock file.write completed for hello.txt.",
    }),
  },
  {
    id: "file-read",
    triggers: ["[mock:file-read]"],
    description: "调用 file.read，覆盖 cached=turn 的读取链路。",
    complete: (context) => toolThenFinal(context, {
      toolCall: {
        id: "mock-file-read-1",
        name: "file.read",
        arguments: {
          workspaceId: "qa-workspace",
          relativePath: "hello.txt",
          cached: "turn",
        },
      },
      finalText: "Mock file.read completed for hello.txt.",
    }),
  },
  {
    id: "path-escape",
    triggers: ["[mock:path-escape]"],
    description: "返回越狱路径 file.write，用于验证 workspace 沙箱拒绝。",
    complete: (context) => toolThenFinal(context, {
      toolCall: {
        id: "mock-path-escape-1",
        name: "file.write",
        arguments: {
          workspaceId: "qa-workspace",
          relativePath: "../../etc/passwd",
          content: "should be rejected",
        },
      },
      finalText: "Mock path escape scenario finished.",
    }),
  },
  {
    id: "permission-write",
    triggers: ["[mock:permission-write]"],
    description: "返回 file.write，用于触发权限审批 UI。",
    complete: (context) => toolThenFinal(context, {
      toolCall: {
        id: "mock-permission-write-1",
        name: "file.write",
        arguments: {
          workspaceId: "qa-workspace",
          relativePath: "permission-check.txt",
          content: "permission scenario content",
        },
      },
      finalText: "Mock permission write completed.",
    }),
  },
  {
    id: "image-summary",
    triggers: ["[mock:image-summary]"],
    description: "图片附件摘要，不依赖真实 vision。",
    complete: () => assistant("Mock image summary: one attached image was received."),
  },
  {
    id: "unknown-tool",
    triggers: ["[mock:unknown-tool]"],
    description: "返回不存在的 tool 名，用于验证错误展示。",
    complete: () => ({
      message: { role: "assistant", content: "" },
      toolCalls: [
        {
          id: "mock-unknown-tool-1",
          name: "mock.missing_tool",
          arguments: {},
        },
      ],
    }),
  },
  {
    id: "slow",
    triggers: ["[mock:slow]"],
    description: "延迟返回，用于验证运行态 UI。",
    complete: async () => {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      return assistant("Mock slow response completed.");
    },
  },
  {
    id: "llm-error",
    triggers: ["[mock:llm-error]"],
    description: "抛出 LLM 错误，用于验证错误气泡。",
    complete: () => {
      throw new Error("MockLLMClient forced failure for QA.");
    },
  },
];

export class MockLLMClient implements LLMClient {
  constructor(private readonly scenarios: MockLLMScenario[] = mockLLMScenarios) {}

  async complete(
    messages: AgentMessage[],
    tools: RegisteredTool[],
    options?: LLMCompleteOptions,
  ): Promise<LLMCompletion> {
    const scenario = findScenario(messages, this.scenarios);
    if (!scenario) {
      throw new Error(
        `MockLLMClient could not find a mock trigger. Available triggers: ${
          this.scenarios.flatMap((s) => s.triggers).join(", ")
        }`,
      );
    }
    return scenario.complete({ messages, tools, options });
  }
}

function findScenario(
  messages: AgentMessage[],
  scenarios: MockLLMScenario[],
): MockLLMScenario | undefined {
  const userTexts = messages
    .filter((message): message is Extract<AgentMessage, { role: "user" }> => message.role === "user")
    .map((message) => messageText(message));

  return scenarios.find((scenario) =>
    scenario.triggers.some((trigger) =>
      userTexts.some((text) => text.includes(trigger)),
    ),
  );
}

function messageText(message: Extract<AgentMessage, { role: "user" }>): string {
  if (typeof message.content === "string") {
    return message.content;
  }
  return message.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

function assistant(content: string): LLMCompletion {
  return {
    message: { role: "assistant", content },
    toolCalls: [],
  };
}

function toolThenFinal(
  context: MockScenarioContext,
  config: {
    toolCall: NonNullable<LLMCompletion["toolCalls"]>[number];
    finalText: string;
  },
): LLMCompletion {
  const lastMessage = context.messages.at(-1);
  if (lastMessage?.role === "tool" && lastMessage.toolCallId === config.toolCall.id) {
    return assistant(config.finalText);
  }
  return {
    message: { role: "assistant", content: "" },
    toolCalls: [config.toolCall],
  };
}

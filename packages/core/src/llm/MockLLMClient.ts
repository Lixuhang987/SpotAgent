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
    id: "clipboard-read",
    triggers: ["[mock:clipboard-read]"],
    description: "调用 clipboard.read，用于验证 tool settings denylist 和平台 tool 链路。",
    complete: (context) => toolThenFinal(context, {
      toolCall: {
        id: "mock-clipboard-read-1",
        name: "clipboard.read",
        arguments: {},
      },
      finalText: "Mock clipboard.read completed.",
    }),
  },
  {
    id: "screen-display",
    triggers: ["[mock:screen-display]"],
    description: "调用 screen.capture display，用于验证 ScreenCaptureKit display 截图链路。",
    complete: (context) => toolThenFinal(context, {
      toolCall: {
        id: "mock-screen-display-1",
        name: "screen.capture",
        arguments: { target: { kind: "display" } },
      },
      finalText: "Mock screen.capture display completed.",
    }),
  },
  {
    id: "screen-window",
    triggers: ["[mock:screen-window]"],
    description: "调用 screen.capture window，prompt 中可用 windowId=<number> 指定窗口 id。",
    complete: (context) => toolThenFinal(context, {
      toolCall: {
        id: "mock-screen-window-1",
        name: "screen.capture",
        arguments: { target: { kind: "window", windowId: parseWindowId(context) } },
      },
      finalText: "Mock screen.capture window completed.",
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
    id: "symlink-escape",
    triggers: ["[mock:symlink-escape]"],
    description: "返回指向 symlink 内路径的 file.write，用于验证 workspace realpath 沙箱拒绝。",
    complete: (context) => toolThenFinal(context, {
      toolCall: {
        id: "mock-symlink-escape-1",
        name: "file.write",
        arguments: {
          workspaceId: "qa-workspace",
          relativePath: "outside-link/escape.txt",
          content: "should be rejected through symlink",
        },
      },
      finalText: "Mock symlink escape scenario finished.",
    }),
  },
  {
    id: "workspace-ask",
    triggers: ["[mock:workspace-ask]"],
    description: "调用 workspace.askUser，用于验证 SessionWindow 内联 workspace 选择链路。",
    complete: (context) => toolThenFinal(context, {
      toolCall: {
        id: "mock-workspace-ask-1",
        name: "workspace.askUser",
        arguments: {
          prompt: "请选择 QA 要写入的 workspace",
          candidateIds: ["qa-workspace", "tmp"],
        },
      },
      finalText: "Mock workspace.askUser completed.",
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
    id: "plugin-echo",
    triggers: ["[mock:plugin-echo]"],
    description: "调用 plugin.echo，用于验证本地插件 tool 加载、执行与热禁用。",
    complete: (context) => toolThenFinal(context, {
      toolCall: {
        id: "mock-plugin-echo-1",
        name: "plugin.echo",
        arguments: { message: "hello from MockLLMClient" },
      },
      finalText: "Mock plugin.echo completed.",
    }),
  },
  {
    id: "ocr-invalid",
    triggers: ["[mock:ocr-invalid]"],
    description: "调用缺少 imageBase64 的 ocr.read，用于验证明确 invalid_argument 错误。",
    complete: (context) => toolThenFinal(context, {
      toolCall: {
        id: "mock-ocr-invalid-1",
        name: "ocr.read",
        arguments: {},
      },
      finalText: "Mock ocr invalid scenario finished.",
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
    id: "slow-focus",
    triggers: ["[mock:slow-focus]"],
    description: "较长延迟返回，用于状态气泡回到 running session 的实机 QA。",
    complete: async (context) => {
      await delay(10 * 60_000, context.options?.signal);
      return assistant("Mock slow focus response completed.");
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

function parseWindowId(context: MockScenarioContext): number {
  const userText = context.messages
    .filter((message): message is Extract<AgentMessage, { role: "user" }> => message.role === "user")
    .map((message) => messageText(message))
    .join("\n");
  const match = userText.match(/\bwindowId=(\d+)\b/);
  return match ? Number(match[1]) : 0;
}

function assistant(content: string): LLMCompletion {
  return {
    message: { role: "assistant", content },
    toolCalls: [],
  };
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(createAbortError());
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(createAbortError());
    }, { once: true });
  });
}

function createAbortError(): Error {
  const error = new Error("The agent run was interrupted.");
  error.name = "AbortError";
  return error;
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

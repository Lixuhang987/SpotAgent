import type {
  LLMClient,
  LLMCompleteOptions,
  LLMCompletion,
  LLMStreamEvent,
} from "./LLMClient.ts";
import type { AgentMessage } from "../runtime/AgentMessage.ts";
import type { RegisteredTool } from "../tools/ToolRegistry.ts";

type MockScenarioContext = {
  messages: AgentMessage[];
  tools: RegisteredTool[];
  options?: LLMCompleteOptions;
};

type MockToolCall = NonNullable<LLMCompletion["toolCalls"]>[number];

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
  toolScenario({
    id: "workspace-list",
    trigger: "[mock:workspace-list]",
    description: "调用 workspace.list，再根据 tool result 返回最终回复。",
    toolCall: {
      id: "mock-workspace-list-1",
      name: "workspace.list",
      arguments: {},
    },
    finalText: "Mock workspace.list completed.",
  }),
  toolScenario({
    id: "clipboard-read",
    trigger: "[mock:clipboard-read]",
    description: "调用 clipboard.read，用于验证 tool settings denylist 和平台 tool 链路。",
    toolCall: {
      id: "mock-clipboard-read-1",
      name: "clipboard.read",
      arguments: {},
    },
    finalText: "Mock clipboard.read completed.",
  }),
  toolScenario({
    id: "screen-display",
    trigger: "[mock:screen-display]",
    description: "调用 screen.capture display，用于验证 ScreenCaptureKit display 截图链路。",
    toolCall: {
      id: "mock-screen-display-1",
      name: "screen.capture",
      arguments: { target: { kind: "display" } },
    },
    finalText: "Mock screen.capture display completed.",
  }),
  toolScenario({
    id: "screen-window",
    trigger: "[mock:screen-window]",
    description: "调用 screen.capture window，prompt 中可用 windowId=<number> 指定窗口 id。",
    toolCall: (context) => ({
      id: "mock-screen-window-1",
      name: "screen.capture",
      arguments: { target: { kind: "window", windowId: parseWindowId(context) } },
    }),
    finalText: "Mock screen.capture window completed.",
  }),
  toolScenario({
    id: "file-write",
    trigger: "[mock:file-write]",
    description: "调用 file.write，参数形态参考真实 API 集成测试。",
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
  toolScenario({
    id: "file-read",
    trigger: "[mock:file-read]",
    description: "调用 file.read，覆盖 cached=turn 的读取链路。",
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
  toolScenario({
    id: "path-escape",
    trigger: "[mock:path-escape]",
    description: "返回越狱路径 file.write，用于验证 workspace 沙箱拒绝。",
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
  toolScenario({
    id: "symlink-escape",
    trigger: "[mock:symlink-escape]",
    description: "返回指向 symlink 内路径的 file.write，用于验证 workspace realpath 沙箱拒绝。",
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
  toolScenario({
    id: "workspace-ask",
    trigger: "[mock:workspace-ask]",
    description: "调用 workspace.askUser，用于验证 ThreadWindow 内联 workspace 选择链路。",
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
  toolScenario({
    id: "permission-write",
    trigger: "[mock:permission-write]",
    description: "返回 file.write，用于触发权限审批 UI。",
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
  toolScenario({
    id: "plugin-echo",
    trigger: "[mock:plugin-echo]",
    description: "调用 plugin.echo，用于验证本地插件 tool 加载、执行与热禁用。",
    toolCall: {
      id: "mock-plugin-echo-1",
      name: "plugin.echo",
      arguments: { message: "hello from MockLLMClient" },
    },
    finalText: "Mock plugin.echo completed.",
  }),
  toolScenario({
    id: "plugin-workspace-read",
    trigger: "[mock:plugin-workspace-read]",
    description: "调用带合法 workspace read 参数的 plugin.echo，用于验证插件 workspace 注入。",
    toolCall: {
      id: "mock-plugin-workspace-read-1",
      name: "plugin.echo",
      arguments: {
        workspaceId: "qa-workspace",
        relativePath: "plugin-input.txt",
      },
    },
    finalText: "Mock plugin workspace read completed.",
  }),
  toolScenario({
    id: "plugin-workspace-write",
    trigger: "[mock:plugin-workspace-write]",
    description: "调用带合法 workspace write 参数的 plugin.echo，用于验证插件 workspace 注入。",
    toolCall: {
      id: "mock-plugin-workspace-write-1",
      name: "plugin.echo",
      arguments: {
        workspaceId: "qa-workspace",
        relativePath: "plugin-output.txt",
      },
    },
    finalText: "Mock plugin workspace write completed.",
  }),
  toolScenario({
    id: "plugin-workspace-escape",
    trigger: "[mock:plugin-workspace-escape]",
    description: "调用带 ../../ 越界路径的 plugin.echo，用于验证插件 workspace 路径拦截。",
    toolCall: {
      id: "mock-plugin-workspace-escape-1",
      name: "plugin.echo",
      arguments: {
        workspaceId: "qa-workspace",
        relativePath: "../../etc/passwd",
      },
    },
    finalText: "Mock plugin workspace escape completed.",
  }),
  toolScenario({
    id: "plugin-workspace-symlink",
    trigger: "[mock:plugin-workspace-symlink]",
    description: "调用指向 workspace symlink 的 plugin.echo，用于验证插件 workspace realpath 拦截。",
    toolCall: {
      id: "mock-plugin-workspace-symlink-1",
      name: "plugin.echo",
      arguments: {
        workspaceId: "qa-workspace",
        relativePath: "outside-link/plugin.txt",
      },
    },
    finalText: "Mock plugin workspace symlink completed.",
  }),
  toolScenario({
    id: "mcp-echo",
    trigger: "[mock:mcp-echo]",
    description: "调用 mcp.qa_echo.echo，用于验证 plugin action 绑定的 MCP tool 作用域。",
    toolCall: {
      id: "mock-mcp-echo-1",
      name: "mcp.qa_echo.echo",
      arguments: { text: "hello from MockLLMClient" },
    },
    finalText: "Mock MCP echo completed.",
  }),
  toolScenario({
    id: "mcp-filesystem-read",
    trigger: "[mock:mcp-filesystem-read]",
    description: "调用 mcp.filesystem.read_file，用于验证 filesystem MCP tool 权限气泡。",
    toolCall: {
      id: "mock-mcp-filesystem-read-1",
      name: "mcp.filesystem.read_file",
      arguments: { path: "/tmp/handagent-mcp-example/hello.txt" },
    },
    finalText: "Mock MCP filesystem read completed.",
  }),
  toolScenario({
    id: "computer-use-list-apps",
    trigger: "[mock:computer-use-list-apps]",
    description: "调用 mcp.computer_use.list_apps，用于验证 Computer Use MCP 全局注入与只读工具调用。",
    toolCall: {
      id: "mock-computer-use-list-apps-1",
      name: "mcp.computer_use.list_apps",
      arguments: {},
    },
    finalText: "Mock Computer Use list_apps completed.",
  }),
  toolScenario({
    id: "computer-use-get-finder",
    trigger: "[mock:computer-use-get-finder]",
    description: "调用 mcp.computer_use.get_app_state，用于验证 Computer Use MCP app 授权 elicitation 与读取链路。",
    toolCall: {
      id: "mock-computer-use-get-finder-1",
      name: "mcp.computer_use.get_app_state",
      arguments: { app: "Finder" },
    },
    finalText: "Mock Computer Use get_app_state completed.",
  }),
  toolScenario({
    id: "ocr-invalid",
    trigger: "[mock:ocr-invalid]",
    description: "调用缺少 imageBase64 的 ocr.read，用于验证明确 invalid_argument 错误。",
    toolCall: {
      id: "mock-ocr-invalid-1",
      name: "ocr.read",
      arguments: {},
    },
    finalText: "Mock ocr invalid scenario finished.",
  }),
  toolScenario({
    id: "ocr-sample",
    trigger: "[mock:ocr-sample]",
    description: "调用带 imageBase64 的 ocr.read，prompt 可用 imageBase64=<base64> 覆盖默认样例。",
    toolCall: (context) => ({
      id: "mock-ocr-sample-1",
      name: "ocr.read",
      arguments: {
        imageBase64: parseInlineValue(context, "imageBase64") ?? samplePngBase64,
        mimeType: "image/png",
        language: "en-US",
      },
    }),
    finalText: "Mock ocr sample completed.",
  }),
  toolScenario({
    id: "accessibility-frontmost",
    trigger: "[mock:accessibility-frontmost]",
    description: "调用 accessibility.snapshot frontmost_app，用于验证辅助功能快照或权限错误。",
    toolCall: {
      id: "mock-accessibility-frontmost-1",
      name: "accessibility.snapshot",
      arguments: { kind: "frontmost_app" },
    },
    finalText: "Mock accessibility snapshot completed.",
  }),
  toolScenario({
    id: "accessibility-set-frontmost",
    trigger: "[mock:accessibility-set-frontmost]",
    description: "调用 accessibility.action set_value frontmost_app，用于验证辅助功能动作或权限错误。",
    toolCall: {
      id: "mock-accessibility-set-frontmost-1",
      name: "accessibility.action",
      arguments: {
        target: { kind: "frontmost_app" },
        action: {
          kind: "set_value",
          value: "HANDAGENT_ACCESSIBILITY_SET_VALUE_20260521",
        },
      },
    },
    finalText: "Mock accessibility action completed.",
  }),
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
    description: "较长延迟返回，用于状态气泡回到 running thread 的实机 QA。",
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

  async *stream(
    messages: AgentMessage[],
    tools: RegisteredTool[],
    options?: LLMCompleteOptions,
  ): AsyncIterable<LLMStreamEvent> {
    const completion = await this.complete(messages, tools, options);
    throwIfAborted(options?.signal);

    for (const text of chunkText(completion.message.content)) {
      throwIfAborted(options?.signal);
      yield { type: "text_delta", text };
    }

    for (const toolCall of completion.toolCalls ?? []) {
      throwIfAborted(options?.signal);
      yield { type: "tool_call", toolCall };
    }

    throwIfAborted(options?.signal);
    yield {
      type: "message_end",
      message: completion.message,
      toolCalls: completion.toolCalls ?? [],
    };
  }
}

function toolScenario(config: {
  id: string;
  trigger: string;
  description: string;
  toolCall: MockToolCall | ((context: MockScenarioContext) => MockToolCall);
  finalText: string;
}): MockLLMScenario {
  return {
    id: config.id,
    triggers: [config.trigger],
    description: config.description,
    complete: (context) => toolThenFinal(context, {
      toolCall: resolveMockToolCall(config.toolCall, context),
      finalText: config.finalText,
    }),
  };
}

function resolveMockToolCall(
  toolCall: MockToolCall | ((context: MockScenarioContext) => MockToolCall),
  context: MockScenarioContext,
): MockToolCall {
  return typeof toolCall === "function" ? toolCall(context) : toolCall;
}

function findScenario(
  messages: AgentMessage[],
  scenarios: MockLLMScenario[],
): MockLLMScenario | undefined {
  const userTexts = userMessageTexts(messages);
  const latestUserText = userTexts.at(-1);
  if (latestUserText) {
    const latestScenario = findScenarioInTexts([latestUserText], scenarios);
    if (latestScenario) return latestScenario;
  }

  return findScenarioInTexts(userTexts.slice(0, -1), scenarios);
}

function findScenarioInTexts(
  userTexts: string[],
  scenarios: MockLLMScenario[],
): MockLLMScenario | undefined {
  return scenarios.find((scenario) =>
    scenario.triggers.some((trigger) =>
      userTexts.some((text) => text.includes(trigger)),
    ),
  );
}

function userMessageTexts(messages: AgentMessage[]): string[] {
  return messages
    .filter((message): message is Extract<AgentMessage, { role: "user" }> => message.role === "user")
    .map((message) => messageText(message));
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
  const userText = userMessageTexts(context.messages).join("\n");
  const match = userText.match(/\bwindowId=(\d+)\b/);
  return match ? Number(match[1]) : 0;
}

function parseInlineValue(context: MockScenarioContext, key: string): string | undefined {
  const userText = userMessageTexts(context.messages).join("\n");
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = userText.match(new RegExp(`\\b${escapedKey}=([^\\s]+)`));
  return match?.[1];
}

function assistant(content: string): LLMCompletion {
  return {
    message: { role: "assistant", content },
    toolCalls: [],
  };
}

const samplePngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAAAAgABSK+kcQAAAABJRU5ErkJggg==";

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

function chunkText(text: string): string[] {
  return text.match(/\S+\s*/g) ?? [];
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw createAbortError();
}

function createAbortError(): Error {
  const error = new Error("The agent run was interrupted.");
  error.name = "AbortError";
  return error;
}

function toolThenFinal(
  context: MockScenarioContext,
  config: {
    toolCall: MockToolCall;
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

import type {
  MCPCallToolResult,
  MCPClient,
  MCPGetPromptResult,
  MCPPromptDescription,
  MCPReadResourceResult,
  MCPResourceDescription,
  MCPServerInfo,
  MCPToolDescription,
} from "@handagent/core/mcp/MCPClient.ts";
import type {
  AccessibilityNodeSnapshot,
  AppInfo,
  PlatformAdapter,
  ScreenCaptureResult,
  WindowInfo,
} from "@handagent/core/platform/PlatformAdapter.ts";

export type ComputerUseMCPClientOptions = {
  serverId: string;
  platform: PlatformAdapter;
};

type GetAppStateResult = {
  app: AppInfo;
  screenshot: ScreenCaptureResult;
  accessibilityTree: AccessibilityNodeSnapshot;
};

export class ComputerUseMCPClient implements MCPClient {
  private readonly info: MCPServerInfo;

  constructor(private readonly options: ComputerUseMCPClientOptions) {
    this.info = {
      name: "Computer Use",
      version: "handagent-native",
      protocolVersion: "2025-11-25",
      capabilities: { tools: { listChanged: false } },
    };
  }

  async initialize(): Promise<MCPServerInfo> {
    return this.info;
  }

  serverInfo(): MCPServerInfo {
    return this.info;
  }

  async listTools(): Promise<MCPToolDescription[]> {
    return [
      {
        name: "list_apps",
        description:
          "List the apps currently running on this computer through HandAgent's native macOS platform bridge.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          properties: {},
        },
      },
      {
        name: "get_app_state",
        description:
          "Get an app screenshot and accessibility tree through HandAgent's native macOS platform bridge.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["app"],
          properties: {
            app: {
              type: "string",
              description: "App name, full app path, or unambiguous bundle identifier",
            },
          },
        },
      },
    ];
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<MCPCallToolResult> {
    switch (name) {
      case "list_apps":
        return this.listApps();
      case "get_app_state":
        return this.getAppState(args);
      default:
        return this.errorResult(`Unknown Computer Use tool: ${name}`);
    }
  }

  async listPrompts(): Promise<MCPPromptDescription[]> {
    return [];
  }

  async getPrompt(): Promise<MCPGetPromptResult> {
    return { messages: [] };
  }

  async listResources(): Promise<MCPResourceDescription[]> {
    return [];
  }

  async readResource(_uri: string): Promise<MCPReadResourceResult> {
    return { contents: [] };
  }

  async close(): Promise<void> {}

  private async listApps(): Promise<MCPCallToolResult> {
    const apps = await this.options.platform.listApps();
    return {
      isError: false,
      content: [
        {
          type: "text",
          text: JSON.stringify({ apps }, null, 2),
        },
      ],
      structuredContent: { apps },
    };
  }

  private async getAppState(args: Record<string, unknown>): Promise<MCPCallToolResult> {
    const appQuery = typeof args.app === "string" ? args.app.trim() : "";
    if (!appQuery) {
      return this.errorResult("Computer Use get_app_state requires non-empty app");
    }

    const apps = await this.options.platform.listApps();
    const app = resolveApp(apps, appQuery);
    if (!app) {
      return this.errorResult(`Computer Use app not found: ${appQuery}`);
    }

    const windows = await this.options.platform.frontmostWindowList();
    const window = resolveWindow(windows, app);
    const screenshot = await this.options.platform.captureScreen(
      window?.id !== undefined
        ? { target: { kind: "window", windowId: window.id } }
        : {},
    );
    const accessibilityTree = await this.options.platform.accessibilitySnapshot({
      kind: "app",
      ...(app.pid !== undefined ? { pid: app.pid } : {}),
      ...(app.bundleId ? { bundleId: app.bundleId } : {}),
    });
    const structuredContent: GetAppStateResult = {
      app,
      screenshot,
      accessibilityTree,
    };

    return {
      isError: false,
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              app,
              screenshot: {
                width: screenshot.width,
                height: screenshot.height,
                target: screenshot.target,
                mimeType: screenshot.mimeType,
              },
              accessibilityTree,
            },
            null,
            2,
          ),
        },
        {
          type: "image",
          data: screenshot.imageBase64,
          mimeType: screenshot.mimeType,
        },
      ],
      structuredContent,
    };
  }

  private errorResult(message: string): MCPCallToolResult {
    return {
      isError: true,
      content: [{ type: "text", text: message }],
    };
  }
}

function resolveApp(apps: AppInfo[], query: string): AppInfo | undefined {
  const normalizedQuery = normalize(query);
  const byBundleId = apps.find((app) => normalize(app.bundleId) === normalizedQuery);
  if (byBundleId) return byBundleId;

  const byName = apps.find((app) => normalize(app.name) === normalizedQuery);
  if (byName) return byName;

  return apps.find((app) => {
    const name = normalize(app.name);
    const bundleId = normalize(app.bundleId);
    return name.includes(normalizedQuery) || bundleId.includes(normalizedQuery);
  });
}

function resolveWindow(windows: WindowInfo[], app: AppInfo): WindowInfo | undefined {
  const appName = normalize(app.name);
  return windows.find((window) => {
    if (window.id === undefined) return false;
    return normalize(window.appName) === appName;
  });
}

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

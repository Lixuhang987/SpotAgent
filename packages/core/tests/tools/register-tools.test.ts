import { describe, expect, it } from "vitest";
import { OfflinePlatformAdapter } from "../../src/platform/OfflinePlatformAdapter.ts";
import type { AgentTool } from "../../src/tools/AgentTool.ts";
import {
  registerTools,
  type RegisterToolsOptions,
} from "../../src/tools/registerTools.ts";

describe("registerTools", () => {
  it("ignores extra legacy loader options while registering builtin tools", async () => {
    const legacyLoaderOption = "plugin" + "Loaders";
    const legacyToolName = "plugin" + ".echo";
    const options = {
      platform: new OfflinePlatformAdapter(),
      [legacyLoaderOption]: [
        async () => ({
          tools: [makeTool(legacyToolName)],
          disabled: [],
        }),
      ],
    } as unknown as RegisterToolsOptions;

    const result = await registerTools(options);

    expect(result.registered).not.toContain(legacyToolName);
    expect(result.registry.get(legacyToolName)).toBeUndefined();
  });
});

function makeTool(name: string): AgentTool {
  return {
    name,
    description: name,
    inputSchema: { type: "object" },
    async call() {
      return {};
    },
  };
}

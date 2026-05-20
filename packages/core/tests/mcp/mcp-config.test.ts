import { describe, expect, it } from "vitest";
import { parseMCPConfig } from "../../src/mcp/MCPConfig.ts";

describe("parseMCPConfig", () => {
  it("parses stdio and streamable http servers", () => {
    const config = parseMCPConfig({
      version: 1,
      servers: [
        {
          id: "fs",
          title: "FS",
          transport: "stdio",
          command: "node",
          args: ["server.js"],
        },
        {
          id: "github",
          title: "GitHub",
          transport: "streamableHttp",
          url: "https://example.com/mcp",
        },
      ],
    });

    expect(config.servers.map((server) => server.id)).toEqual(["fs", "github"]);
  });
});

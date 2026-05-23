import { describe, expect, it } from "vitest";
import {
  META_TOOL_NAME,
  META_TOOL_FIRST_ACTIVATION_RESULT,
  META_TOOL_ALREADY_ACTIVE_RESULT,
  MetaToolUseTool,
} from "../../src/tools/MetaToolUseTool";

describe("MetaToolUseTool", () => {
  it("exposes the constant tool name", () => {
    expect(META_TOOL_NAME).toBe("use_tools");
  });

  it("creates a tool whose name matches META_TOOL_NAME", () => {
    const tool = MetaToolUseTool.create();
    expect(tool.name).toBe(META_TOOL_NAME);
    expect(tool.description.length).toBeGreaterThan(0);
  });

  it("returns the first-activation message when called with no reason", async () => {
    const tool = MetaToolUseTool.create();
    await expect(tool.call({})).resolves.toBe(META_TOOL_FIRST_ACTIVATION_RESULT);
  });

  it("accepts an optional reason argument", async () => {
    const tool = MetaToolUseTool.create();
    await expect(tool.call({ reason: "need to read a file" })).resolves.toBe(
      META_TOOL_FIRST_ACTIVATION_RESULT,
    );
  });

  it("rejects unknown additional properties via zod schema", async () => {
    const tool = MetaToolUseTool.create();
    await expect(tool.call({ unexpected: 1 } as unknown as never)).rejects.toThrow(
      /Invalid input for tool "use_tools"/,
    );
  });

  it("exports the already-active result string", () => {
    expect(META_TOOL_ALREADY_ACTIVE_RESULT).toContain("already active");
  });
});

import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineTool } from "../src/tools/defineTool.ts";

const StrictInputSchema = z
  .object({
    path: z.string(),
    limit: z.number(),
  })
  .strict();

type StrictInput = z.infer<typeof StrictInputSchema>;

function makeTool() {
  const run = vi.fn(async (input: StrictInput) => ({ received: input }));
  const factory = defineTool({
    name: "sample.validate",
    description: "校验输入",
    inputSchema: StrictInputSchema,
    run,
  });

  return { factory, tool: factory.create(undefined), run };
}

describe("defineTool", () => {
  it("keeps the JSON Schema generated from inputSchema unchanged", () => {
    const { factory, tool } = makeTool();
    const expectedSchema = {
      type: "object",
      properties: {
        path: { type: "string" },
        limit: { type: "number" },
      },
      required: ["path", "limit"],
      additionalProperties: false,
    };

    expect(factory.jsonSchema).toEqual(expectedSchema);
    expect(tool.inputSchema).toEqual(expectedSchema);
  });

  it("rejects a field type error before invoking run", async () => {
    const { tool, run } = makeTool();

    await expect(tool.call({ path: "README.md", limit: "10" } as never)).rejects.toThrow(
      /sample\.validate.*limit/s,
    );
    expect(run).not.toHaveBeenCalled();
  });

  it("rejects a missing required field before invoking run", async () => {
    const { tool, run } = makeTool();

    await expect(tool.call({ limit: 10 } as never)).rejects.toThrow(
      /sample\.validate.*path/s,
    );
    expect(run).not.toHaveBeenCalled();
  });

  it("rejects an unknown field on a strict object before invoking run", async () => {
    const { tool, run } = makeTool();

    await expect(
      tool.call({ path: "README.md", limit: 10, extra: true } as never),
    ).rejects.toThrow(/sample\.validate.*extra/s);
    expect(run).not.toHaveBeenCalled();
  });
});

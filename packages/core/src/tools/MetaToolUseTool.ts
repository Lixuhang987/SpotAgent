import { z } from "zod";
import { defineTool } from "./defineTool.ts";

export const META_TOOL_NAME = "use_tools";

export const META_TOOL_FIRST_ACTIVATION_RESULT =
  "Tools activated. The full tool catalog is now available.";

export const META_TOOL_ALREADY_ACTIVE_RESULT = "Tools are already active.";

const META_TOOL_DESCRIPTION =
  "Activate the full set of tools (file access, screen capture, app control, MCP integrations, etc.). " +
  "Call this whenever you need to perform any action beyond plain conversation. " +
  "Once activated, the tools become available immediately in the same turn. " +
  "Optional `reason` argument: a one-line note for audit logs.";

const inputSchema = z
  .object({
    reason: z.string().optional(),
  })
  .strict();

export const MetaToolUseTool = defineTool<z.infer<typeof inputSchema>, string, void>({
  name: META_TOOL_NAME,
  description: META_TOOL_DESCRIPTION,
  inputSchema,
  run: async () => META_TOOL_FIRST_ACTIVATION_RESULT,
});

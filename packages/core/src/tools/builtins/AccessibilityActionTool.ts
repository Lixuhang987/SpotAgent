import { z } from "zod";
import { defineTool } from "../defineTool.ts";
import type {
  AccessibilityActionRequest,
  AccessibilityActionResult,
  PlatformAdapter,
} from "../../platform/PlatformAdapter.ts";

const TargetSchema = z.union([
  z.object({ kind: z.literal("frontmost_app") }).strict(),
  z.object({ kind: z.literal("window"), windowId: z.number().optional() }).strict(),
  z.object({ kind: z.literal("element"), elementId: z.string() }).strict(),
]);

const ActionSchema = z.union([
  z.object({ kind: z.literal("press") }).strict(),
  z.object({ kind: z.literal("click") }).strict(),
  z.object({ kind: z.literal("set_value"), value: z.string() }).strict(),
]);

const InputSchema = z.object({
  target: TargetSchema,
  action: ActionSchema,
});

export const AccessibilityActionTool = defineTool<
  z.infer<typeof InputSchema>,
  AccessibilityActionResult,
  PlatformAdapter
>({
  name: "accessibility.action",
  description: "执行无障碍交互动作",
  inputSchema: InputSchema,
  run: async (input, platform) => platform.performAccessibilityAction(input as AccessibilityActionRequest),
});

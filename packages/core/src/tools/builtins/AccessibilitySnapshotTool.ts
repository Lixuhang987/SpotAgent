import { z } from "zod";
import { defineTool } from "../defineTool.ts";
import type {
  AccessibilityNodeSnapshot,
  AccessibilitySnapshotTarget,
  PlatformAdapter,
} from "../../platform/PlatformAdapter.ts";

const InputSchema = z.object({
  kind: z.enum(["frontmost_app", "app", "window", "element"]),
  bundleId: z.string().optional(),
  pid: z.number().optional(),
  windowId: z.number().optional(),
  elementId: z.string().optional(),
});

export const AccessibilitySnapshotTool = defineTool<
  z.infer<typeof InputSchema>,
  AccessibilityNodeSnapshot,
  PlatformAdapter
>({
  name: "accessibility.snapshot",
  description: "读取无障碍树快照",
  inputSchema: InputSchema,
  run: async (input, platform) => platform.accessibilitySnapshot(input as AccessibilitySnapshotTarget),
});
